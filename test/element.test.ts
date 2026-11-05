import { afterEach, describe, expect, it, vi } from "vitest";

import "../src/index";
import type { PulsaRecognizerElement } from "../src/element/pulsaRecognizerElement";
import type { PulsaError, RecognizerStatus, Sentence } from "../src/types";
import { FakePipeline, settle } from "./fakePipeline";

async function mount(attributes: Record<string, string>, pipeline = new FakePipeline()) {
  const element = document.createElement("pulsa-recognizer");
  element.dependencies = pipeline;
  Object.entries(attributes).forEach(([name, value]) => element.setAttribute(name, value));
  document.body.append(element);
  await settle();
  return { element, pipeline };
}

function shadow(element: PulsaRecognizerElement) {
  const root = element.shadowRoot!;
  return {
    screenVisible: root.querySelector(".screen")!.hasAttribute("data-visible"),
    screenTitle: root.querySelector(".screen .title")!.textContent,
    screenDetail: root.querySelector(".screen .detail")!.textContent,
    badge: root.querySelector(".badge")!.hasAttribute("data-visible")
      ? root.querySelector(".badge-text")!.textContent
      : null,
    chips: Array.from(root.querySelectorAll(".gloss")).map((chip) => ({
      text: chip.textContent,
      pending: chip.classList.contains("pending"),
    })),
  };
}

afterEach(() => {
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

describe("<pulsa-recognizer>", () => {
  it("says what is missing when it has no key, and starts once one is set", async () => {
    const { element, pipeline } = await mount({});
    expect(element.status).toBe("error");
    expect(shadow(element).screenDetail).toBe("Falta la clave de la API (atributo api-key).");

    element.setAttribute("api-key", "pulsa_pk_test_key");
    await settle();
    expect(pipeline.connections).toHaveLength(1);
  });

  it("passes its attributes to the session", async () => {
    const { pipeline } = await mount({
      "api-key": "pulsa_pk_test_key",
      endpoint: "ws://localhost:8000/v1/stream",
      vocabulary: "YO, DOLOR",
    });
    expect(pipeline.connection.options).toEqual({
      apiKey: "pulsa_pk_test_key",
      endpoint: "ws://localhost:8000/v1/stream",
      vocabulary: ["YO", "DOLOR"],
    });
  });

  it("covers the feed with a screen until the session is ready, in the page's language", async () => {
    document.documentElement.lang = "en";
    const { element, pipeline } = await mount({ "api-key": "pulsa_pk_test_key" });
    expect(shadow(element)).toMatchObject({ screenVisible: true, screenTitle: "Connecting…" });

    pipeline.connection.becomes("ready");
    expect(shadow(element)).toMatchObject({ screenVisible: false, badge: "Ready! Start signing" });
    document.documentElement.lang = "";
  });

  it("shows a reconnecting badge over the feed, and a full screen when offline", async () => {
    const { element, pipeline } = await mount({ "api-key": "pulsa_pk_test_key", locale: "es" });
    pipeline.connection.becomes("ready");
    pipeline.connection.becomes("reconnecting");
    expect(shadow(element)).toMatchObject({ screenVisible: false, badge: "Reconectando…" });

    pipeline.online = false;
    pipeline.connection.becomes("reconnecting");
    window.dispatchEvent(new Event("offline"));
    expect(shadow(element)).toMatchObject({ screenVisible: true, screenTitle: "Sin conexión a internet" });
  });

  it("explains a fatal error from the server", async () => {
    const { element, pipeline } = await mount({ "api-key": "pulsa_pk_test_key", locale: "en" });
    pipeline.connection.events.onError({ code: "origin_not_allowed", message: "No.", fatal: true });
    pipeline.connection.becomes("failed");
    expect(shadow(element)).toMatchObject({
      screenVisible: true,
      screenTitle: "Something went wrong",
      screenDetail: "This key isn't enabled for this site.",
    });
  });

  it("shows the sentence, pending signs by their text, only with show-glosses", async () => {
    const { element, pipeline } = await mount({ "api-key": "pulsa_pk_test_key", "show-glosses": "" });
    pipeline.connection.events.onReady([{ gloss: "DOLOR", text: "dolor" }]);
    pipeline.connection.events.onSentence({ glosses: ["YO"], text: ["yo"], pending: ["DOLOR"] });

    expect(shadow(element).chips).toEqual([
      { text: "yo", pending: false },
      { text: "dolor", pending: true },
    ]);
    const overlay = element.shadowRoot!.querySelector(".glosses")!;
    expect(overlay.hasAttribute("data-visible")).toBe(true);
    expect(getComputedStyle(overlay).display).toBe("flex");

    element.removeAttribute("show-glosses");
    expect(getComputedStyle(overlay).display).toBe("none");
  });

  it("reports through callback properties and through DOM events", async () => {
    const pipeline = new FakePipeline();
    const element = document.createElement("pulsa-recognizer");
    element.dependencies = pipeline;
    element.setAttribute("api-key", "pulsa_pk_test_key");
    const statuses: RecognizerStatus[] = [];
    const heard: Sentence[] = [];
    const errors: PulsaError[] = [];
    element.onStatus = (status) => statuses.push(status);
    element.addEventListener("pulsa-sentence", (event) => heard.push(event.detail));
    element.onError = () => {
      throw new Error("an app bug");
    };
    element.addEventListener("pulsa-error", (event) => errors.push(event.detail));
    const reportError = vi.fn();
    vi.stubGlobal("reportError", reportError);

    document.body.append(element);
    await settle();
    pipeline.connection.events.onSentence({ glosses: ["YO"], text: ["yo"], pending: [] });
    pipeline.connection.events.onError({ code: "session_limit_reached", message: "Busy.", fatal: false });

    expect(statuses).toEqual(["requesting-camera", "loading-model", "connecting"]);
    expect(heard).toEqual([{ glosses: ["YO"], text: ["yo"], pending: [] }]);
    // A throwing app callback is reported, and the event still goes out.
    expect(reportError).toHaveBeenCalledOnce();
    expect(errors).toHaveLength(1);
  });

  it("starts a new session when its key changes, and releases everything when removed", async () => {
    const { element, pipeline } = await mount({ "api-key": "pulsa_pk_test_one" });
    element.setAttribute("api-key", "pulsa_pk_test_two");
    await settle();
    expect(pipeline.connections.map((connection) => connection.options.apiKey)).toEqual([
      "pulsa_pk_test_one",
      "pulsa_pk_test_two",
    ]);
    expect(pipeline.connections[0]!.closed).toBe(true);

    element.remove();
    expect(pipeline.connection.closed).toBe(true);
    expect(pipeline.camera.stopped).toBe(true);
  });

  it("does not restart when only its look changes", async () => {
    const { element, pipeline } = await mount({ "api-key": "pulsa_pk_test_key" });
    element.setAttribute("locale", "en");
    element.setAttribute("show-glosses", "");
    element.setAttribute("mirrored", "false");
    await settle();
    expect(pipeline.connections).toHaveLength(1);
  });

  it("mirrors frames while left-handed, switching without a new session", async () => {
    const { element, pipeline } = await mount({ "api-key": "pulsa_pk_test_key", "left-handed": "" });
    pipeline.connection.becomes("ready");
    pipeline.cameraDeliversFrame(0);
    element.removeAttribute("left-handed");
    await settle();
    pipeline.cameraDeliversFrame(33);

    expect(pipeline.connection.options.leftHanded).toBe(true);
    expect(pipeline.extractor.mirrored).toEqual([true, false]);
    expect(pipeline.connection.resets).toEqual([undefined]);
    expect(pipeline.connections).toHaveLength(1);
  });

  it("resets the sentence on request", async () => {
    const { element, pipeline } = await mount({ "api-key": "pulsa_pk_test_key" });
    element.reset();
    expect(pipeline.connection.resets).toEqual([undefined]);
  });
});
