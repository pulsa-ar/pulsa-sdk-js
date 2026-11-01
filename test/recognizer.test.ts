import { describe, expect, it } from "vitest";

import { CameraDeniedError, CameraUnavailableError } from "../src/capture/camera";
import { Recognizer } from "../src/recognizer/recognizer";
import type { PulsaError, RecognizerStatus, Sentence } from "../src/types";
import { FakePipeline, settle } from "./fakePipeline";

function startRecognizer(pipeline = new FakePipeline()) {
  const statuses: RecognizerStatus[] = [];
  const errors: PulsaError[] = [];
  const sentences: Sentence[] = [];
  const recognizer = new Recognizer(
    document.createElement("video"),
    { apiKey: "pulsa_pk_test_key", vocabulary: ["YO"] },
    {
      onStatus: (status) => statuses.push(status),
      onError: (error) => errors.push(error),
      onSentence: (sentence) => sentences.push(sentence),
    },
    pipeline,
  );
  const started = recognizer.start();
  return { recognizer, pipeline, statuses, errors, sentences, started };
}

describe("Recognizer", () => {
  it("asks for the camera, loads MediaPipe, then connects at the camera's frame size", async () => {
    const { pipeline, statuses, started } = startRecognizer();
    await started;
    pipeline.connection.becomes("ready");

    expect(statuses).toEqual(["requesting-camera", "loading-model", "connecting", "ready"]);
    expect(pipeline.connection.openedWith).toEqual({ width: 640, height: 480 });
    expect(pipeline.connection.options.vocabulary).toEqual(["YO"]);
  });

  it("runs MediaPipe only on frames a session would use", async () => {
    const { pipeline, started } = startRecognizer();
    await started;
    pipeline.cameraDeliversFrame(0);
    pipeline.connection.becomes("ready");
    pipeline.cameraDeliversFrame(33);
    pipeline.connection.becomes("reconnecting");
    pipeline.cameraDeliversFrame(66);

    expect(pipeline.extractor.extractedAt).toEqual([33]);
    expect(pipeline.connection.sentAt).toEqual([33]);
  });

  it("tells the server when the camera's frame size changes", async () => {
    const { pipeline, started } = startRecognizer();
    await started;
    pipeline.camera.rotate();
    expect(pipeline.connection.resets).toEqual([{ width: 480, height: 640 }]);
  });

  it("reports reconnecting while offline as offline", async () => {
    const { pipeline, statuses, started } = startRecognizer();
    await started;
    pipeline.online = false;
    pipeline.connection.becomes("reconnecting");
    pipeline.online = true;
    window.dispatchEvent(new Event("online"));

    expect(statuses.slice(-2)).toEqual(["offline", "reconnecting"]);
  });

  it("relays the connection's failure as an error status", async () => {
    const { pipeline, statuses, started } = startRecognizer();
    await started;
    pipeline.connection.becomes("failed");
    expect(statuses.at(-1)).toBe("error");
  });

  it.each([
    [new CameraDeniedError("denied"), "camera-denied", "camera_denied"],
    [new CameraUnavailableError("none"), "error", "camera_unavailable"],
  ])("stops at a camera failure (%s) and closes MediaPipe", async (failure, status, code) => {
    const pipeline = new FakePipeline();
    pipeline.cameraFailure = failure;
    const { statuses, errors, started } = startRecognizer(pipeline);
    await started;
    await settle();

    expect(statuses).toEqual(["requesting-camera", status]);
    expect(errors).toEqual([{ code, message: failure.message, fatal: true }]);
    expect(pipeline.extractor.closed).toBe(true);
    expect(pipeline.connections).toHaveLength(0);
  });

  it("releases the camera, MediaPipe, frames and connection on stop", async () => {
    const { recognizer, pipeline, started } = startRecognizer();
    await started;
    recognizer.stop();

    expect(pipeline.camera.stopped).toBe(true);
    expect(pipeline.extractor.closed).toBe(true);
    expect(pipeline.connection.closed).toBe(true);
    expect(pipeline.framesScheduled).toBe(false);
  });

  it("releases everything when stopped before it finished starting", async () => {
    const { recognizer, pipeline, statuses, started } = startRecognizer();
    recognizer.stop();
    await started;

    expect(pipeline.camera.stopped).toBe(true);
    expect(pipeline.extractor.closed).toBe(true);
    expect(pipeline.connections).toHaveLength(0);
    expect(statuses).toEqual(["requesting-camera"]);
  });
});
