/**
 * Camera -> MediaPipe -> pulsa API, and the status that pipeline is in. UI-free, so the
 * element renders it and tests drive it with stand-ins.
 */

import { CameraDeniedError, CameraUnavailableError, openCamera, type Camera } from "../capture/camera";
import { scheduleVideoFrames } from "../capture/frameScheduler";
import {
  RecognitionConnection,
  type ConnectionEvents,
  type ConnectionStatus,
} from "../connection/recognitionConnection";
import {
  createLandmarkExtractor,
  DEFAULT_MEDIAPIPE_ASSETS,
  type LandmarkExtractor,
  type MediaPipeAssets,
} from "../landmarks/landmarkExtractor";
import type { PulsaError, RecognizerCallbacks, RecognizerStatus } from "../types";

export const DEFAULT_ENDPOINT = "wss://api.pulsa.ar/v1/stream";

export interface RecognizerOptions {
  readonly apiKey: string;
  readonly endpoint?: string;
  readonly vocabulary?: readonly string[];
  readonly mediapipe?: MediaPipeAssets;
}

/** What the recogniser builds on; replaced in tests. */
export interface RecognizerDependencies {
  openCamera(video: HTMLVideoElement): Promise<Camera>;
  createLandmarkExtractor(assets: MediaPipeAssets): Promise<LandmarkExtractor>;
  createConnection(options: RecognizerOptions, events: ConnectionEvents): FrameConnection;
  scheduleVideoFrames(video: HTMLVideoElement, onFrame: (captureTimeMs: number) => void): () => void;
  isOnline(): boolean;
}

export type FrameConnection = Pick<
  RecognitionConnection,
  "open" | "sendFrame" | "reset" | "close" | "acceptsFrames" | "currentStatus"
>;

export const browserDependencies: RecognizerDependencies = {
  openCamera,
  createLandmarkExtractor,
  createConnection: (options, events) =>
    new RecognitionConnection(
      {
        endpoint: options.endpoint ?? DEFAULT_ENDPOINT,
        apiKey: options.apiKey,
        ...(options.vocabulary === undefined ? {} : { vocabulary: options.vocabulary }),
      },
      events,
    ),
  scheduleVideoFrames,
  isOnline: () => navigator.onLine,
};

export class Recognizer {
  private status: RecognizerStatus | null = null;
  private stopped = false;
  private readonly cleanups: (() => void)[] = [];
  private connection: FrameConnection | null = null;

  constructor(
    private readonly video: HTMLVideoElement,
    private readonly options: RecognizerOptions,
    private readonly callbacks: RecognizerCallbacks,
    private readonly dependencies: RecognizerDependencies = browserDependencies,
  ) {}

  /** Asks for the camera, loads MediaPipe, connects, and streams until stop(). */
  async start(): Promise<void> {
    this.setStatus("requesting-camera");
    // Loaded while the signer answers the camera prompt; harmless if they decline.
    const extractorLoading = this.dependencies.createLandmarkExtractor(
      this.options.mediapipe ?? DEFAULT_MEDIAPIPE_ASSETS,
    );
    extractorLoading.catch(() => undefined);

    try {
      const camera = await this.dependencies.openCamera(this.video);
      this.cleanups.push(() => camera.stop());
      this.setStatus("loading-model");
      const extractor = await extractorLoading;
      this.cleanups.push(() => extractor.close());
      if (this.stopped) {
        this.release();
        return;
      }
      this.stream(camera, extractor);
    } catch (error) {
      // MediaPipe may still be loading; close it once it has, rather than leak it.
      extractorLoading.then((extractor) => extractor.close(), () => undefined);
      this.release();
      if (!this.stopped) this.fail(error);
    }
  }

  reset(): void {
    this.connection?.reset();
  }

  stop(): void {
    this.stopped = true;
    this.release();
  }

  private stream(camera: Camera, extractor: LandmarkExtractor): void {
    const connection = this.dependencies.createConnection(this.options, this.connectionEvents());
    this.connection = connection;
    this.cleanups.push(() => connection.close());
    this.cleanups.push(camera.onFrameSizeChange((frame) => connection.reset(frame)));
    this.cleanups.push(this.watchNetwork());
    this.cleanups.push(this.dependencies.scheduleVideoFrames(this.video, (captureTimeMs) => {
      // MediaPipe is the expensive part; skip it while no session would use the result.
      if (connection.acceptsFrames) {
        connection.sendFrame(captureTimeMs, extractor.extract(this.video, captureTimeMs));
      }
    }));
    connection.open(camera.frameSize());
  }

  private connectionEvents(): ConnectionEvents {
    return {
      onStatus: (status) => this.showConnectionStatus(status),
      onReady: (vocabulary) => this.callbacks.onReady?.(vocabulary),
      onSentence: (sentence) => this.callbacks.onSentence?.(sentence),
      onSentenceFinished: (sentence) => this.callbacks.onSentenceFinished?.(sentence),
      onError: (error) => this.callbacks.onError?.(error),
    };
  }

  private showConnectionStatus(status: ConnectionStatus): void {
    switch (status) {
      case "connecting":
        this.setStatus("connecting");
        break;
      case "ready":
      case "idle":
        this.setStatus("ready");
        break;
      case "reconnecting":
        this.setStatus(this.dependencies.isOnline() ? "reconnecting" : "offline");
        break;
      case "failed":
        this.setStatus("error");
        break;
      case "closed":
        break;
    }
  }

  private watchNetwork(): () => void {
    const update = () => {
      if (this.connection !== null) this.showConnectionStatus(this.connection.currentStatus);
    };
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }

  private fail(error: unknown): void {
    if (error instanceof CameraDeniedError) {
      this.setStatus("camera-denied");
      this.report({ code: "camera_denied", message: error.message, fatal: true });
      return;
    }
    this.setStatus("error");
    this.report({
      code: error instanceof CameraUnavailableError ? "camera_unavailable" : "startup_failed",
      message: error instanceof Error ? error.message : String(error),
      fatal: true,
    });
  }

  private report(error: PulsaError): void {
    this.callbacks.onError?.(error);
  }

  private release(): void {
    this.cleanups.splice(0).reverse().forEach((cleanup) => cleanup());
    this.connection = null;
  }

  private setStatus(status: RecognizerStatus): void {
    if (status !== this.status && !this.stopped) {
      this.status = status;
      this.callbacks.onStatus?.(status);
    }
  }
}
