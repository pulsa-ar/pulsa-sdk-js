import type { HolisticLandmarkerResult, NormalizedLandmark } from "@mediapipe/tasks-vision";

import { COORDINATES, HAND_POINTS, LANDMARK_VALUES, POSE_POINTS } from "../protocol/landmarkFrame";

export type HolisticLandmarks = Pick<
  HolisticLandmarkerResult,
  "poseLandmarks" | "leftHandLandmarks" | "rightHandLandmarks"
>;

/**
 * One frame's landmarks in the layout the model was trained on -- the same as pulsa-model's
 * `MediaPipeExtractor._parse_landmarks` without the face: pose, then left hand, then right
 * hand, (x, y, z) each, zeros for anything not detected.
 */
export function packLandmarks(result: HolisticLandmarks): Float32Array {
  const packed = new Float32Array(LANDMARK_VALUES);
  const leftHandStart = POSE_POINTS * COORDINATES;
  const rightHandStart = leftHandStart + HAND_POINTS * COORDINATES;
  writePoints(packed, 0, POSE_POINTS, firstPerson(result.poseLandmarks));
  writePoints(packed, leftHandStart, HAND_POINTS, firstPerson(result.leftHandLandmarks));
  writePoints(packed, rightHandStart, HAND_POINTS, firstPerson(result.rightHandLandmarks));
  return packed;
}

function firstPerson(people: NormalizedLandmark[][] | undefined): readonly NormalizedLandmark[] {
  return people?.[0] ?? [];
}

function writePoints(
  packed: Float32Array,
  offset: number,
  pointCount: number,
  points: readonly NormalizedLandmark[],
): void {
  points.slice(0, pointCount).forEach((point, index) => {
    const start = offset + index * COORDINATES;
    packed[start] = point.x;
    packed[start + 1] = point.y;
    packed[start + 2] = point.z;
  });
}
