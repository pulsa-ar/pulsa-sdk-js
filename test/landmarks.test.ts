import type { NormalizedLandmark } from "@mediapipe/tasks-vision";
import { describe, expect, it } from "vitest";

import { packLandmarks } from "../src/landmarks/packLandmarks";
import { FrameThrottle } from "../src/capture/frameScheduler";
import { parseVocabulary } from "../src/element/pulsaRecognizerElement";

function points(count: number, base: number): NormalizedLandmark[] {
  return Array.from({ length: count }, (_, index) => ({
    x: base + index,
    y: base + index + 0.25,
    z: base + index + 0.5,
    visibility: 1,
  }));
}

describe("packLandmarks", () => {
  it("lays out pose, then left hand, then right hand, as the model was trained", () => {
    const packed = packLandmarks({
      poseLandmarks: [points(33, 0)],
      leftHandLandmarks: [points(21, 100)],
      rightHandLandmarks: [points(21, 200)],
    });

    expect(packed).toHaveLength(225);
    expect(Array.from(packed.slice(0, 3))).toEqual([0, 0.25, 0.5]);
    expect(Array.from(packed.slice(96, 99))).toEqual([32, 32.25, 32.5]); // last pose point
    expect(Array.from(packed.slice(99, 102))).toEqual([100, 100.25, 100.5]); // left wrist
    expect(Array.from(packed.slice(162, 165))).toEqual([200, 200.25, 200.5]); // right wrist
    expect(Array.from(packed.slice(222, 225))).toEqual([220, 220.25, 220.5]);
  });

  it("leaves zeros for anything not detected", () => {
    const packed = packLandmarks({ poseLandmarks: [points(33, 1)], leftHandLandmarks: [], rightHandLandmarks: [] });
    expect(packed.slice(99).every((value) => value === 0)).toBe(true);
    expect(packLandmarks({ poseLandmarks: [], leftHandLandmarks: [], rightHandLandmarks: [] }).every((v) => v === 0)).toBe(true);
  });

  it("uses only the first person and never writes past a section", () => {
    const packed = packLandmarks({
      poseLandmarks: [points(40, 1), points(33, 500)],
      leftHandLandmarks: [],
      rightHandLandmarks: [],
    });
    expect(packed[96]).toBe(33); // the 33rd point of the first person
    expect(packed[99]).toBe(0); // not its 34th
  });
});

describe("FrameThrottle", () => {
  it("keeps every frame of a jittery 30 fps camera", () => {
    const throttle = new FrameThrottle();
    const arrivals = [0, 31, 66, 99, 132, 167, 200];
    expect(arrivals.map((time) => throttle.admit(time))).toEqual(arrivals.map(() => true));
  });

  it("halves a 60 fps camera", () => {
    const throttle = new FrameThrottle();
    const admitted = Array.from({ length: 12 }, (_, index) => index * (1000 / 60)).filter((time) => throttle.admit(time));
    expect(admitted).toHaveLength(6);
  });

  it("never admits a time that does not move forward", () => {
    const throttle = new FrameThrottle();
    expect(throttle.admit(1000)).toBe(true);
    expect(throttle.admit(1000)).toBe(false);
    expect(throttle.admit(500)).toBe(false);
  });
});

describe("parseVocabulary", () => {
  it("splits on commas and drops blanks", () => {
    expect(parseVocabulary(" YO, DOLOR,,AYUDAR ")).toEqual(["YO", "DOLOR", "AYUDAR"]);
  });

  it.each([null, "", " , "])("means every sign when absent or blank (%j)", (attribute) => {
    expect(parseVocabulary(attribute)).toBeUndefined();
  });
});
