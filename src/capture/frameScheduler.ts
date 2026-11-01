/**
 * Calls back once per new camera frame with its capture time, at most 30 times a second.
 * Capture times, not processing times, are what the server resamples by.
 */

export const MAX_FRAMES_PER_SECOND = 30;
// A 30 fps camera's frames arrive a little early or late; this keeps them all.
const ARRIVAL_TOLERANCE_MS = 5;

/** Admits frames no closer together than the rate allows, in strictly increasing time. */
export class FrameThrottle {
  private readonly minimumIntervalMs: number;
  private lastAdmittedMs = Number.NEGATIVE_INFINITY;

  constructor(maxFramesPerSecond: number = MAX_FRAMES_PER_SECOND) {
    this.minimumIntervalMs = 1000 / maxFramesPerSecond - ARRIVAL_TOLERANCE_MS;
  }

  admit(captureTimeMs: number): boolean {
    if (captureTimeMs - this.lastAdmittedMs < this.minimumIntervalMs) {
      return false;
    }
    this.lastAdmittedMs = captureTimeMs;
    return true;
  }
}

type FrameListener = (captureTimeMs: number) => void;

/** Starts calling `onFrame` for `video`'s frames; returns a function that stops it. */
export function scheduleVideoFrames(video: HTMLVideoElement, onFrame: FrameListener): () => void {
  const throttle = new FrameThrottle();
  const admitted = (captureTimeMs: number) => {
    if (throttle.admit(captureTimeMs)) {
      onFrame(captureTimeMs);
    }
  };
  return "requestVideoFrameCallback" in video
    ? scheduleWithVideoFrameCallback(video, admitted)
    : scheduleWithAnimationFrames(video, admitted);
}

function scheduleWithVideoFrameCallback(video: HTMLVideoElement, onFrame: FrameListener): () => void {
  let handle = 0;
  const next = (now: DOMHighResTimeStamp, metadata: VideoFrameCallbackMetadata) => {
    // The camera's own timestamp where the browser gives one; arrival time otherwise.
    onFrame(metadata.captureTime ?? now);
    handle = video.requestVideoFrameCallback(next);
  };
  handle = video.requestVideoFrameCallback(next);
  return () => video.cancelVideoFrameCallback(handle);
}

/** For browsers without requestVideoFrameCallback: polls, and skips repeats of a frame. */
function scheduleWithAnimationFrames(video: HTMLVideoElement, onFrame: FrameListener): () => void {
  let handle = 0;
  let lastVideoTime = -1;
  const next = (now: DOMHighResTimeStamp) => {
    if (video.currentTime !== lastVideoTime) {
      lastVideoTime = video.currentTime;
      onFrame(now);
    }
    handle = requestAnimationFrame(next);
  };
  handle = requestAnimationFrame(next);
  return () => cancelAnimationFrame(handle);
}
