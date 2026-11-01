/**
 * The WebSocket to the pulsa API, across sessions: hello, landmark frames, resets, and
 * reconnecting as each close code says. A new session starts with an empty sentence, which
 * this reports, so the app never shows words the server has forgotten.
 */

import { backoffDelayMs, reconnectActionFor } from "../protocol/closePolicy";
import { encodeLandmarkFrame } from "../protocol/landmarkFrame";
import {
  PROTOCOL_VERSION,
  parseServerMessage,
  type ErrorMessage,
  type FrameSize,
  type HelloMessage,
  type ReadyMessage,
  type ResetMessage,
  type ServerMessage,
} from "../protocol/messages";
import type { FinishedSentence, PulsaError, Sentence, Sign } from "../types";

/** The part of the browser's WebSocket this uses, so tests can stand in for it. */
export interface WebSocketLike {
  binaryType: BinaryType;
  readonly readyState: number;
  readonly bufferedAmount: number;
  onopen: ((event: Event) => void) | null;
  onmessage: ((event: MessageEvent) => void) | null;
  onclose: ((event: CloseEvent) => void) | null;
  onerror: ((event: Event) => void) | null;
  send(data: string | ArrayBuffer): void;
  close(code?: number, reason?: string): void;
}

export type ConnectionStatus =
  | "connecting"
  | "ready"
  | "reconnecting"
  // Closed for lack of frames; reopens on the next one.
  | "idle"
  // Will not reconnect: see the error reported with it.
  | "failed"
  | "closed";

export interface ConnectionOptions {
  readonly endpoint: string;
  readonly apiKey: string;
  readonly vocabulary?: readonly string[];
  readonly createSocket?: (url: string) => WebSocketLike;
  readonly random?: () => number;
}

export interface ConnectionEvents {
  onStatus(status: ConnectionStatus): void;
  onReady(vocabulary: readonly Sign[]): void;
  onSentence(sentence: Sentence): void;
  onSentenceFinished(sentence: FinishedSentence): void;
  onError(error: PulsaError): void;
}

const OPEN = 1;
// About nine seconds of frames. Past this the network is not keeping up, and frames that
// late are worth less than staying current; the server interpolates the gap.
export const MAX_BUFFERED_BYTES = 256 * 1024;
const EMPTY_SENTENCE: Sentence = { glosses: [], text: [], pending: [] };

export class RecognitionConnection {
  private socket: WebSocketLike | null = null;
  private status: ConnectionStatus = "closed";
  private frame: FrameSize | null = null;
  private failedAttempts = 0;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private lastError: ErrorMessage | null = null;
  private sentenceShown = false;

  constructor(
    private readonly options: ConnectionOptions,
    private readonly events: ConnectionEvents,
  ) {}

  get currentStatus(): ConnectionStatus {
    return this.status;
  }

  /** Whether a frame sent now would be used, or would reopen an idle session. */
  get acceptsFrames(): boolean {
    return this.status === "ready" || this.status === "idle";
  }

  open(frame: FrameSize): void {
    this.frame = frame;
    this.connect("connecting");
  }

  /** Sends one frame if a session is ready for it; returns whether it was sent. */
  sendFrame(captureTimeMs: number, landmarks: Float32Array): boolean {
    if (this.status === "idle") {
      this.connect("connecting");
      return false;
    }
    if (this.status !== "ready" || this.socket === null || this.socket.readyState !== OPEN) {
      return false;
    }
    if (this.socket.bufferedAmount > MAX_BUFFERED_BYTES) {
      return false;
    }
    this.socket.send(encodeLandmarkFrame(captureTimeMs, landmarks));
    return true;
  }

  /** Clears the sentence; a new frame size goes with it, e.g. after the camera rotated. */
  reset(frame?: FrameSize): void {
    if (frame !== undefined) {
      this.frame = frame;
    }
    if (this.status !== "ready" || this.socket === null) {
      // The next session starts empty, at the latest frame size, anyway.
      return;
    }
    const message: ResetMessage = frame === undefined ? { type: "reset" } : { type: "reset", frame };
    this.socket.send(JSON.stringify(message));
  }

  close(): void {
    this.clearRetry();
    const socket = this.socket;
    this.socket = null;
    socket?.close(1000, "client closed");
    this.setStatus("closed");
  }

  private connect(status: "connecting" | "reconnecting"): void {
    this.clearRetry();
    this.lastError = null;
    this.setStatus(status);
    const socket = (this.options.createSocket ?? createBrowserSocket)(this.options.endpoint);
    socket.binaryType = "arraybuffer";
    socket.onopen = () => socket.send(JSON.stringify(this.hello()));
    socket.onmessage = (event) => this.receive(event);
    socket.onclose = (event) => this.handleClose(socket, event.code);
    this.socket = socket;
  }

  private hello(): HelloMessage {
    if (this.frame === null) {
      throw new Error("open() must be given a frame size before connecting.");
    }
    const hello: HelloMessage = {
      type: "hello",
      protocol: PROTOCOL_VERSION,
      auth: { api_key: this.options.apiKey },
      frame: this.frame,
    };
    return this.options.vocabulary === undefined ? hello : { ...hello, vocabulary: this.options.vocabulary };
  }

  private receive(event: MessageEvent): void {
    if (typeof event.data !== "string") {
      return;
    }
    const message = parseServerMessage(event.data);
    if (message !== null) {
      this.handleMessage(message);
    }
  }

  private handleMessage(message: ServerMessage): void {
    switch (message.type) {
      case "ready":
        this.handleReady(message);
        break;
      case "sentence":
        this.sentenceShown = message.glosses.length > 0 || message.pending.length > 0;
        this.events.onSentence({ glosses: message.glosses, text: message.text, pending: message.pending });
        break;
      case "sentence_finished":
        this.events.onSentenceFinished({ glosses: message.glosses, text: message.text });
        break;
      case "error":
        // The close that follows decides what happens; this says why.
        this.lastError = message;
        break;
    }
  }

  private handleReady(message: ReadyMessage): void {
    this.failedAttempts = 0;
    if (this.sentenceShown) {
      this.sentenceShown = false;
      this.events.onSentence(EMPTY_SENTENCE);
    }
    this.setStatus("ready");
    this.events.onReady(message.vocabulary);
  }

  private handleClose(socket: WebSocketLike, closeCode: number): void {
    if (socket !== this.socket) {
      // A socket this connection already let go of, e.g. after close().
      return;
    }
    this.socket = null;
    const action = reconnectActionFor(closeCode);
    const error = this.lastError;
    if (error !== null) {
      this.events.onError({ ...describe(error), fatal: action === "never" });
    }
    switch (action) {
      case "immediately":
        this.connect("reconnecting");
        break;
      case "with-backoff":
        this.scheduleRetry();
        break;
      case "when-frames-resume":
        this.setStatus("idle");
        break;
      case "never":
        if (error === null) {
          this.events.onError({ code: "connection_refused", message: `Closed with ${closeCode}.`, fatal: true });
        }
        this.setStatus("failed");
        break;
    }
  }

  private scheduleRetry(): void {
    this.setStatus("reconnecting");
    const delay = backoffDelayMs(this.failedAttempts, this.options.random);
    this.failedAttempts += 1;
    this.retryTimer = setTimeout(() => this.connect("reconnecting"), delay);
  }

  private clearRetry(): void {
    if (this.retryTimer !== null) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
  }

  private setStatus(status: ConnectionStatus): void {
    if (status !== this.status) {
      this.status = status;
      this.events.onStatus(status);
    }
  }
}

function describe(error: ErrorMessage): Omit<PulsaError, "fatal"> {
  return error.details === undefined
    ? { code: error.code, message: error.message }
    : { code: error.code, message: error.message, details: error.details };
}

function createBrowserSocket(url: string): WebSocketLike {
  return new WebSocket(url);
}
