/**
 * Flips camera frames left to right before MediaPipe sees them. The model only knows
 * right-handed signing: training flipped every left-handed take's video this way before
 * extracting its landmarks, so a left-handed signer's frames must be flipped the same way,
 * as images. Swapping hands in the landmarks afterwards would not match what MediaPipe reports
 * for a flipped image.
 */

export type MirrorCanvas = HTMLCanvasElement | OffscreenCanvas;
type MirrorContext = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

export class FrameMirror {
  private canvas: MirrorCanvas | null = null;
  private context: MirrorContext | null = null;

  constructor(private readonly createCanvas: () => MirrorCanvas = createBrowserCanvas) {}

  /** `video`'s current frame, flipped, on a canvas reused from frame to frame. */
  mirror(video: HTMLVideoElement): MirrorCanvas {
    const { canvas, context } = this.surface();
    const width = video.videoWidth;
    const height = video.videoHeight;
    if (canvas.width !== width || canvas.height !== height) {
      // Resizing clears the canvas and its transform, so this happens only when the camera
      // changes size, e.g. a phone rotated.
      canvas.width = width;
      canvas.height = height;
    }
    context.setTransform(-1, 0, 0, 1, width, 0);
    context.drawImage(video, 0, 0, width, height);
    return canvas;
  }

  private surface(): { canvas: MirrorCanvas; context: MirrorContext } {
    if (this.canvas === null || this.context === null) {
      const canvas = this.createCanvas();
      const context = canvas.getContext("2d") as MirrorContext | null;
      if (context === null) {
        throw new Error("This browser cannot draw camera frames to a canvas, needed for left-handed signing.");
      }
      this.canvas = canvas;
      this.context = context;
    }
    return { canvas: this.canvas, context: this.context };
  }
}

function createBrowserCanvas(): MirrorCanvas {
  return typeof OffscreenCanvas !== "undefined" ? new OffscreenCanvas(0, 0) : document.createElement("canvas");
}
