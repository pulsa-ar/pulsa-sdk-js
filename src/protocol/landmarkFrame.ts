/**
 * The binary landmark frame: a little-endian float64 capture time in milliseconds, then
 * float32[225] -- pose 33, left hand 21, right hand 21, each (x, y, z) -- zeros where
 * undetected. The server decodes exactly this layout; test/fixtures holds bytes it encoded.
 */

export const POSE_POINTS = 33;
export const HAND_POINTS = 21;
export const COORDINATES = 3;
export const LANDMARK_VALUES = (POSE_POINTS + 2 * HAND_POINTS) * COORDINATES;
const CAPTURE_TIME_BYTES = 8;
export const LANDMARK_FRAME_BYTES = CAPTURE_TIME_BYTES + LANDMARK_VALUES * 4;

export function encodeLandmarkFrame(captureTimeMs: number, landmarks: Float32Array): ArrayBuffer {
  if (landmarks.length !== LANDMARK_VALUES) {
    throw new RangeError(`A landmark frame holds ${LANDMARK_VALUES} values; got ${landmarks.length}.`);
  }
  if (!Number.isFinite(captureTimeMs)) {
    throw new RangeError(`A capture time must be finite; got ${captureTimeMs}.`);
  }
  const buffer = new ArrayBuffer(LANDMARK_FRAME_BYTES);
  const view = new DataView(buffer);
  view.setFloat64(0, captureTimeMs, true);
  landmarks.forEach((value, index) => {
    view.setFloat32(CAPTURE_TIME_BYTES + index * 4, value, true);
  });
  return buffer;
}
