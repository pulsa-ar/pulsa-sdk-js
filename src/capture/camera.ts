import type { FrameSize } from "../protocol/messages";

export class CameraDeniedError extends Error {
  override readonly name = "CameraDeniedError";
}

export class CameraUnavailableError extends Error {
  override readonly name = "CameraUnavailableError";
}

export interface Camera {
  /** The size of the frames MediaPipe sees: the video's own, never its on-screen box. */
  frameSize(): FrameSize;
  /** Calls back when the frame size changes, e.g. a phone rotated. Returns an unsubscribe. */
  onFrameSizeChange(listener: (frame: FrameSize) => void): () => void;
  stop(): void;
}

const CONSTRAINTS: MediaStreamConstraints = {
  audio: false,
  video: {
    facingMode: "user",
    width: { ideal: 640 },
    height: { ideal: 480 },
    // More would only be dropped: the model runs on a 30 fps grid.
    frameRate: { ideal: 30, max: 30 },
  },
};

/** Opens the front camera into `video` and resolves once its frame size is known. */
export async function openCamera(video: HTMLVideoElement): Promise<Camera> {
  const stream = await requestStream();
  video.srcObject = stream;
  video.muted = true;
  video.playsInline = true;
  try {
    await whenSized(video);
    await video.play();
  } catch (error) {
    stopTracks(stream);
    throw error;
  }

  return {
    frameSize: () => ({ width: video.videoWidth, height: video.videoHeight }),
    onFrameSizeChange: (listener) => {
      const notify = () => listener({ width: video.videoWidth, height: video.videoHeight });
      video.addEventListener("resize", notify);
      return () => video.removeEventListener("resize", notify);
    },
    stop: () => {
      stopTracks(stream);
      video.srcObject = null;
    },
  };
}

async function requestStream(): Promise<MediaStream> {
  if (!navigator.mediaDevices?.getUserMedia) {
    // Also the case on plain http, other than on localhost.
    throw new CameraUnavailableError("This browser offers no camera here; pages need https.");
  }
  try {
    return await navigator.mediaDevices.getUserMedia(CONSTRAINTS);
  } catch (error) {
    const name = error instanceof DOMException ? error.name : "";
    if (name === "NotAllowedError" || name === "SecurityError") {
      throw new CameraDeniedError("Camera permission was denied.");
    }
    throw new CameraUnavailableError(error instanceof Error ? error.message : "No usable camera.");
  }
}

function whenSized(video: HTMLVideoElement): Promise<void> {
  if (video.videoWidth > 0 && video.videoHeight > 0) {
    return Promise.resolve();
  }
  return new Promise((resolve) => video.addEventListener("loadedmetadata", () => resolve(), { once: true }));
}

function stopTracks(stream: MediaStream): void {
  stream.getTracks().forEach((track) => track.stop());
}
