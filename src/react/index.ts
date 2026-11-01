/**
 * `<PulsaRecognizer>` for React 18 and up: the `<pulsa-recognizer>` element, with props
 * instead of attributes and a ref with `reset()`.
 *
 *   <PulsaRecognizer apiKey="pulsa_pk_..." showGlosses onSentenceFinished={(s) => ...} />
 */

import {
  createElement,
  forwardRef,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  type CSSProperties,
  type ForwardedRef,
} from "react";

import { ELEMENT_NAME, type PulsaRecognizerElement } from "../index";
import type { Locale } from "../i18n/messages";
import type { RecognizerCallbacks } from "../types";

export interface PulsaRecognizerProps extends RecognizerCallbacks {
  apiKey: string;
  /** Narrows what the key allows; omit for every sign it allows. */
  vocabulary?: readonly string[];
  showGlosses?: boolean;
  locale?: Locale;
  /** Mirrors the preview like a selfie camera; on by default. */
  mirrored?: boolean;
  endpoint?: string;
  className?: string;
  style?: CSSProperties;
}

export interface PulsaRecognizerHandle {
  /** Clears the sentence and keeps recognising. */
  reset(): void;
}

function PulsaRecognizerComponent(props: PulsaRecognizerProps, ref: ForwardedRef<PulsaRecognizerHandle>) {
  const { apiKey, vocabulary, showGlosses, locale, mirrored, endpoint, className, style } = props;
  const element = useRef<PulsaRecognizerElement>(null);

  useImperativeHandle(ref, () => ({ reset: () => element.current?.reset() }), []);

  // Callbacks are properties, set on every render so the latest closures are the ones called.
  // A layout effect runs before the element's first session starts, so no status is missed.
  useLayoutEffect(() => {
    const current = element.current;
    if (current === null) return;
    current.onReady = props.onReady;
    current.onSentence = props.onSentence;
    current.onSentenceFinished = props.onSentenceFinished;
    current.onStatus = props.onStatus;
    current.onError = props.onError;
  });

  return createElement(ELEMENT_NAME, {
    ref: element,
    "api-key": apiKey,
    vocabulary: vocabulary?.join(","),
    "show-glosses": showGlosses ? "" : undefined,
    locale,
    mirrored: mirrored === false ? "false" : undefined,
    endpoint,
    className,
    style,
  });
}

export const PulsaRecognizer = forwardRef(PulsaRecognizerComponent);
PulsaRecognizer.displayName = "PulsaRecognizer";

export type { FinishedSentence, PulsaError, RecognizerStatus, Sentence, Sign } from "../types";
