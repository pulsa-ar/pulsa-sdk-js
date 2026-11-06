import { act, createElement, createRef } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PulsaRecognizerElement } from "../src/element/pulsaRecognizerElement";
import { PulsaRecognizer, type PulsaRecognizerHandle } from "../src/react/index";
import type { RecognizerStatus } from "../src/types";
import { settle } from "./fakePipeline";

// The wrapper creates the element itself, so its sessions run on stand-ins installed in place
// of the browser's camera, MediaPipe and socket.
vi.mock("../src/recognizer/recognizer", async (importOriginal) => {
  const original = await importOriginal<typeof import("../src/recognizer/recognizer")>();
  const { FakePipeline } = await import("./fakePipeline");
  return { ...original, browserDependencies: new FakePipeline() };
});

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => document.body.replaceChildren());

describe("<PulsaRecognizer>", () => {
  it("renders the element with its props as attributes, and its callbacks set before it starts", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const statuses: RecognizerStatus[] = [];
    const handle = createRef<PulsaRecognizerHandle>();
    const reset = vi.spyOn(PulsaRecognizerElement.prototype, "reset");

    await act(async () => {
      createRoot(container).render(
        createElement(PulsaRecognizer, {
          ref: handle,
          apiKey: "pulsa_pk_test_key",
          vocabulary: ["YO", "DOLOR"],
          showGlosses: true,
          leftHanded: true,
          mirrored: false,
          locale: "en",
          className: "camera",
          onStatus: (status) => statuses.push(status),
        }),
      );
    });
    await settle();

    const element = container.querySelector("pulsa-recognizer")!;
    expect(element).toBeInstanceOf(PulsaRecognizerElement);
    expect(element.getAttribute("api-key")).toBe("pulsa_pk_test_key");
    expect(element.getAttribute("vocabulary")).toBe("YO,DOLOR");
    expect(element.hasAttribute("show-glosses")).toBe(true);
    expect(element.hasAttribute("left-handed")).toBe(true);
    expect(element.getAttribute("mirrored")).toBe("false");
    expect(element.getAttribute("locale")).toBe("en");
    expect(element.getAttribute("class")).toBe("camera");
    // The first status the element reports already reaches the prop.
    expect(statuses[0]).toBe("requesting-camera");

    handle.current!.reset();
    expect(reset).toHaveBeenCalledOnce();
  });
});
