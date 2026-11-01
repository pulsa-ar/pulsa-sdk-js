import type { WebSocketLike } from "../src/connection/recognitionConnection";
import type { ServerMessage } from "../src/protocol/messages";

/** A WebSocket the test plays the server for. */
export class FakeSocket implements WebSocketLike {
  binaryType: BinaryType = "blob";
  readyState = 0;
  bufferedAmount = 0;
  onopen: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onclose: ((event: CloseEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  readonly sent: (string | ArrayBuffer)[] = [];
  closedWith: number | null = null;

  constructor(readonly url: string) {}

  send(data: string | ArrayBuffer): void {
    this.sent.push(data);
  }

  close(code = 1000): void {
    this.closedWith = code;
    this.readyState = 3;
  }

  /** The JSON messages sent, parsed. */
  get sentMessages(): Record<string, unknown>[] {
    return this.sent.filter((data): data is string => typeof data === "string").map((data) => JSON.parse(data));
  }

  get sentFrames(): ArrayBuffer[] {
    return this.sent.filter((data): data is ArrayBuffer => data instanceof ArrayBuffer);
  }

  serverOpens(): void {
    this.readyState = 1;
    this.onopen?.(new Event("open"));
  }

  serverSends(message: ServerMessage | { type: string; [field: string]: unknown }): void {
    this.onmessage?.(new MessageEvent("message", { data: JSON.stringify(message) }));
  }

  serverCloses(code: number): void {
    this.readyState = 3;
    this.onclose?.(new CloseEvent("close", { code }));
  }

  /** Opens and answers the hello, as a healthy server does. */
  serverAccepts(): void {
    this.serverOpens();
    this.serverSends({
      type: "ready",
      session_id: "s",
      model: "quiron-1.0",
      expires_at: "2026-11-01T00:10:00Z",
      vocabulary: [{ gloss: "YO", text: "yo" }],
    });
  }
}
