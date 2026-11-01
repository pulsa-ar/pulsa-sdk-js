/**
 * pulsa's browser SDK. Importing it registers `<pulsa-recognizer>`.
 */

import { ELEMENT_NAME, PulsaRecognizerElement } from "./element/pulsaRecognizerElement";

export { ELEMENT_NAME, PulsaRecognizerElement, type PulsaRecognizerEventMap } from "./element/pulsaRecognizerElement";
export { DEFAULT_MEDIAPIPE_ASSETS, type MediaPipeAssets } from "./landmarks/landmarkExtractor";
export { DEFAULT_ENDPOINT } from "./recognizer/recognizer";
export { LOCALES, type Locale } from "./i18n/messages";
export { PROTOCOL_VERSION } from "./protocol/messages";
export type {
  FinishedSentence,
  PulsaError,
  RecognizerCallbacks,
  RecognizerStatus,
  Sentence,
  Sign,
} from "./types";

/** Registers the element; safe to call more than once, e.g. when two bundles include the SDK. */
export function definePulsaRecognizer(): void {
  if (typeof customElements !== "undefined" && !customElements.get(ELEMENT_NAME)) {
    customElements.define(ELEMENT_NAME, PulsaRecognizerElement);
  }
}

definePulsaRecognizer();
