import type { Camera } from "../src/capture/camera";
import type { ConnectionEvents, ConnectionStatus } from "../src/connection/recognitionConnection";
import type { LandmarkExtractor } from "../src/landmarks/landmarkExtractor";
import type { FrameSize } from "../src/protocol/messages";
import type { FrameConnection, RecognizerDependencies, RecognizerOptions } from "../src/recognizer/recognizer";

export class FakeCamera implements Camera {
  size: FrameSize = { width: 640, height: 480 };
  stopped = false;
  private listeners: ((frame: FrameSize) => void)[] = [];

  frameSize(): FrameSize {
    return this.size;
  }

  onFrameSizeChange(listener: (frame: FrameSize) => void): () => void {
    this.listeners.push(listener);
    return () => (this.listeners = this.listeners.filter((candidate) => candidate !== listener));
  }

  stop(): void {
    this.stopped = true;
  }

  rotate(): void {
    this.size = { width: this.size.height, height: this.size.width };
    this.listeners.forEach((listener) => listener(this.size));
  }
}

export class FakeExtractor implements LandmarkExtractor {
  extractedAt: number[] = [];
  closed = false;

  extract(_video: HTMLVideoElement, timestampMs: number): Float32Array {
    this.extractedAt.push(timestampMs);
    return new Float32Array(225);
  }

  close(): void {
    this.closed = true;
  }
}

export class FakeConnection implements FrameConnection {
  openedWith: FrameSize | null = null;
  resets: (FrameSize | undefined)[] = [];
  sentAt: number[] = [];
  closed = false;
  acceptsFrames = false;
  currentStatus: ConnectionStatus = "closed";

  constructor(readonly options: RecognizerOptions, readonly events: ConnectionEvents) {}

  open(frame: FrameSize): void {
    this.openedWith = frame;
    this.becomes("connecting");
  }

  sendFrame(captureTimeMs: number): boolean {
    this.sentAt.push(captureTimeMs);
    return true;
  }

  reset(frame?: FrameSize): void {
    this.resets.push(frame);
  }

  close(): void {
    this.closed = true;
  }

  becomes(status: ConnectionStatus): void {
    this.currentStatus = status;
    this.acceptsFrames = status === "ready" || status === "idle";
    this.events.onStatus(status);
  }
}

/** Every dependency of a Recognizer, controllable from a test. */
export class FakePipeline implements RecognizerDependencies {
  camera = new FakeCamera();
  extractor = new FakeExtractor();
  connections: FakeConnection[] = [];
  online = true;
  cameraFailure: Error | null = null;
  framesScheduled = false;
  private frameListener: ((captureTimeMs: number) => void) | null = null;

  async openCamera(): Promise<Camera> {
    if (this.cameraFailure !== null) throw this.cameraFailure;
    return this.camera;
  }

  async createLandmarkExtractor(): Promise<LandmarkExtractor> {
    return this.extractor;
  }

  createConnection(options: RecognizerOptions, events: ConnectionEvents): FrameConnection {
    const connection = new FakeConnection(options, events);
    this.connections.push(connection);
    return connection;
  }

  scheduleVideoFrames(_video: HTMLVideoElement, onFrame: (captureTimeMs: number) => void): () => void {
    this.frameListener = onFrame;
    this.framesScheduled = true;
    return () => {
      this.frameListener = null;
      this.framesScheduled = false;
    };
  }

  isOnline(): boolean {
    return this.online;
  }

  get connection(): FakeConnection {
    const latest = this.connections[this.connections.length - 1];
    if (latest === undefined) throw new Error("No connection was created");
    return latest;
  }

  cameraDeliversFrame(captureTimeMs: number): void {
    this.frameListener?.(captureTimeMs);
  }
}

/** Lets every pending promise callback run. */
export async function settle(): Promise<void> {
  for (let turn = 0; turn < 5; turn += 1) {
    await Promise.resolve();
  }
}
