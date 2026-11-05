import { describe, expect, it } from "vitest";

import { FrameMirror, type MirrorCanvas } from "../src/landmarks/frameMirror";

/** A canvas that records what is drawn on it, since happy-dom draws nothing. */
class RecordingCanvas {
  width = 0;
  height = 0;
  readonly calls: string[] = [];
  readonly context = {
    setTransform: (...matrix: number[]) => this.calls.push(`setTransform(${matrix.join(",")})`),
    drawImage: (_source: unknown, ...box: number[]) => this.calls.push(`drawImage(${box.join(",")})`),
  };

  getContext(kind: string) {
    return kind === "2d" ? this.context : null;
  }
}

function video(width: number, height: number): HTMLVideoElement {
  return { videoWidth: width, videoHeight: height } as HTMLVideoElement;
}

describe("FrameMirror", () => {
  it("draws each frame flipped left to right, at the camera's size, on one canvas", () => {
    const canvases: RecordingCanvas[] = [];
    const mirror = new FrameMirror(() => {
      const canvas = new RecordingCanvas();
      canvases.push(canvas);
      return canvas as unknown as MirrorCanvas;
    });

    mirror.mirror(video(640, 480));
    const rotated = mirror.mirror(video(480, 640)) as unknown as RecordingCanvas;

    expect(canvases).toHaveLength(1);
    expect([rotated.width, rotated.height]).toEqual([480, 640]);
    // x' = width - x: the right edge lands on the left.
    expect(rotated.calls).toEqual([
      "setTransform(-1,0,0,1,640,0)", "drawImage(0,0,640,480)",
      "setTransform(-1,0,0,1,480,0)", "drawImage(0,0,480,640)",
    ]);
  });

  it("says why when the browser cannot draw to a canvas", () => {
    const mirror = new FrameMirror(() => ({ getContext: () => null }) as unknown as MirrorCanvas);
    expect(() => mirror.mirror(video(640, 480))).toThrow(/left-handed/);
  });
});
