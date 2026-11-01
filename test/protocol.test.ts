import { describe, expect, it } from "vitest";

// Written by pulsa-server's encode_landmark_frame(1234.5, arange(225) / 225).
import serverEncodedFrame from "./fixtures/landmark-frame.hex?raw";
import { backoffDelayMs, CloseCode, reconnectActionFor } from "../src/protocol/closePolicy";
import { encodeLandmarkFrame, LANDMARK_FRAME_BYTES, LANDMARK_VALUES } from "../src/protocol/landmarkFrame";
import { parseServerMessage } from "../src/protocol/messages";

describe("encodeLandmarkFrame", () => {
  it("produces exactly the bytes the server's own encoder does", () => {
    const expected = serverEncodedFrame.trim();
    const landmarks = Float32Array.from({ length: LANDMARK_VALUES }, (_, index) => index / 225);

    const encoded = encodeLandmarkFrame(1234.5, landmarks);

    expect(encoded.byteLength).toBe(LANDMARK_FRAME_BYTES);
    expect(Buffer.from(encoded).toString("hex")).toBe(expected);
  });

  it("refuses a frame of the wrong size or time", () => {
    expect(() => encodeLandmarkFrame(0, new Float32Array(224))).toThrow(RangeError);
    expect(() => encodeLandmarkFrame(Number.NaN, new Float32Array(LANDMARK_VALUES))).toThrow(RangeError);
  });
});

describe("parseServerMessage", () => {
  it("ignores message types this version does not know, so the server can add them", () => {
    expect(parseServerMessage('{"type": "translation", "spanish": "Me duele."}')).toBeNull();
    expect(parseServerMessage('{"type": "sentence", "glosses": [], "text": [], "pending": []}')).toEqual({
      type: "sentence",
      glosses: [],
      text: [],
      pending: [],
    });
  });

  it("refuses a message without a type", () => {
    expect(() => parseServerMessage("[]")).toThrow();
  });
});

describe("reconnectActionFor", () => {
  it.each([
    [CloseCode.SESSION_EXPIRED, "immediately"],
    [CloseCode.UNAUTHORIZED, "never"],
    [CloseCode.ORIGIN_NOT_ALLOWED, "never"],
    [CloseCode.BAD_REQUEST, "never"],
    [CloseCode.UNSUPPORTED_PROTOCOL, "never"],
    [CloseCode.IDLE, "when-frames-resume"],
    [CloseCode.SESSION_LIMIT_REACHED, "with-backoff"],
    [CloseCode.HELLO_TIMEOUT, "with-backoff"],
    [1006, "with-backoff"],
    [1012, "with-backoff"],
  ])("close code %i means %s", (code, action) => {
    expect(reconnectActionFor(code)).toBe(action);
  });
});

describe("backoffDelayMs", () => {
  it("doubles from one second up to thirty", () => {
    const middle = () => 0.5;
    expect([0, 1, 2, 3, 4, 5, 9].map((attempt) => backoffDelayMs(attempt, middle))).toEqual([
      1000, 2000, 4000, 8000, 16000, 30000, 30000,
    ]);
  });

  it("spreads retries by a fifth either way", () => {
    expect(backoffDelayMs(0, () => 0)).toBe(800);
    expect(backoffDelayMs(0, () => 1)).toBe(1200);
  });
});
