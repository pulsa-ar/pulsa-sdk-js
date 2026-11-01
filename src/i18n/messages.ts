/**
 * Every string the component shows, per locale. Kept short: written Spanish is not the
 * first language of many signers, so the characters carry most of the meaning.
 */

import type { RecognizerStatus } from "../types";

export const LOCALES = ["es", "en"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "es";

/** Error codes with their own wording; any other code gets `fallback`. */
export type ExplainedErrorCode =
  | "missing_api_key"
  | "invalid_key"
  | "secret_key_not_allowed"
  | "origin_not_allowed"
  | "vocabulary_not_allowed"
  | "unsupported_protocol"
  | "camera_unavailable";

export interface Messages {
  readonly status: Readonly<Record<RecognizerStatus, string>>;
  readonly errors: Readonly<Record<ExplainedErrorCode | "fallback", string>>;
  readonly componentLabel: string;
}

const MESSAGES: Readonly<Record<Locale, Messages>> = {
  es: {
    status: {
      "requesting-camera": "Permití el acceso a la cámara para empezar",
      "loading-model": "Preparando…",
      connecting: "Conectando…",
      ready: "¡Listo! Ya podés señar",
      reconnecting: "Reconectando…",
      offline: "Sin conexión a internet",
      "camera-denied": "No tenemos acceso a la cámara. Habilitala en la configuración del navegador.",
      error: "Algo salió mal",
    },
    errors: {
      missing_api_key: "Falta la clave de la API (atributo api-key).",
      invalid_key: "La clave de la API no es válida o fue revocada.",
      secret_key_not_allowed: "Usá una clave publicable: las claves secretas no van en el navegador.",
      origin_not_allowed: "Esta clave no está habilitada para este sitio.",
      vocabulary_not_allowed: "La clave no permite algunas de las señas pedidas.",
      unsupported_protocol: "Esta versión del SDK ya no es compatible. Actualizala.",
      camera_unavailable: "No encontramos una cámara disponible.",
      fallback: "No pudimos iniciar el reconocimiento.",
    },
    componentLabel: "Reconocimiento de Lengua de Señas Argentina",
  },
  en: {
    status: {
      "requesting-camera": "Allow camera access to start",
      "loading-model": "Getting ready…",
      connecting: "Connecting…",
      ready: "Ready! Start signing",
      reconnecting: "Reconnecting…",
      offline: "No internet connection",
      "camera-denied": "We can't access the camera. Enable it in your browser settings.",
      error: "Something went wrong",
    },
    errors: {
      missing_api_key: "The API key is missing (api-key attribute).",
      invalid_key: "The API key is invalid or was revoked.",
      secret_key_not_allowed: "Use a publishable key: secret keys don't belong in the browser.",
      origin_not_allowed: "This key isn't enabled for this site.",
      vocabulary_not_allowed: "The key doesn't allow some of the requested signs.",
      unsupported_protocol: "This SDK version is no longer supported. Please update it.",
      camera_unavailable: "No camera is available.",
      fallback: "Recognition couldn't start.",
    },
    componentLabel: "Argentine Sign Language recognition",
  },
};

/** `es`, `es-AR` and `ES` all mean Spanish; anything unknown falls back to it. */
export function resolveLocale(requested: string | null | undefined): Locale {
  const language = requested?.trim().toLowerCase().split("-")[0];
  return LOCALES.find((locale) => locale === language) ?? DEFAULT_LOCALE;
}

export function messagesFor(locale: Locale): Messages {
  return MESSAGES[locale];
}

export function explainError(messages: Messages, code: string): string {
  return code in messages.errors
    ? messages.errors[code as ExplainedErrorCode]
    : messages.errors.fallback;
}
