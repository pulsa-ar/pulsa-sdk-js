import { FilesetResolver, HolisticLandmarker, type HolisticLandmarkerOptions } from "@mediapipe/tasks-vision";

import { packLandmarks } from "./packLandmarks";

export interface LandmarkExtractor {
  /** The landmarks in `video`'s current frame, captured at `timestampMs`, which must only grow. */
  extract(video: HTMLVideoElement, timestampMs: number): Float32Array;
  close(): void;
}

export interface MediaPipeAssets {
  /** Folder holding MediaPipe's WebAssembly files for the pinned @mediapipe/tasks-vision. */
  readonly wasmBaseUrl: string;
  readonly holisticModelUrl: string;
}

/**
 * The exact files the model was trained with: this holistic landmarker is byte-identical to
 * the one that extracted the training corpus. Never point these at a `latest` URL -- a
 * silently updated landmarker would feed the model inputs it was not trained on.
 */
export const DEFAULT_MEDIAPIPE_ASSETS: MediaPipeAssets = {
  wasmBaseUrl: "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm",
  holisticModelUrl:
    "https://storage.googleapis.com/mediapipe-models/holistic_landmarker/holistic_landmarker/float16/1/holistic_landmarker.task",
};

// The thresholds the training corpus was extracted with.
const EXTRACTION_OPTIONS: HolisticLandmarkerOptions = {
  runningMode: "VIDEO",
  minFaceDetectionConfidence: 0.5,
  minPoseDetectionConfidence: 0.5,
  minHandLandmarksConfidence: 0.5,
};

export async function createLandmarkExtractor(
  assets: MediaPipeAssets = DEFAULT_MEDIAPIPE_ASSETS,
): Promise<LandmarkExtractor> {
  const fileset = await FilesetResolver.forVisionTasks(assets.wasmBaseUrl);
  const landmarker = await createWithBestDelegate(fileset, assets.holisticModelUrl);
  return {
    extract: (video, timestampMs) => packLandmarks(landmarker.detectForVideo(video, timestampMs)),
    close: () => landmarker.close(),
  };
}

/** The GPU where the browser offers one, the CPU otherwise. */
async function createWithBestDelegate(
  fileset: Awaited<ReturnType<typeof FilesetResolver.forVisionTasks>>,
  modelUrl: string,
): Promise<HolisticLandmarker> {
  try {
    return await HolisticLandmarker.createFromOptions(fileset, {
      ...EXTRACTION_OPTIONS,
      baseOptions: { modelAssetPath: modelUrl, delegate: "GPU" },
    });
  } catch {
    return HolisticLandmarker.createFromOptions(fileset, {
      ...EXTRACTION_OPTIONS,
      baseOptions: { modelAssetPath: modelUrl, delegate: "CPU" },
    });
  }
}
