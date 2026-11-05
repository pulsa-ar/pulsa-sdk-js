/** The types an app integrating the SDK sees. */

/** A sign the session can recognise: its gloss, and the text to print for it. */
export interface Sign {
  readonly gloss: string;
  readonly text: string;
}

/**
 * The sentence so far, always whole: the recogniser can replace its last word, so never
 * append to an earlier one. `pending` holds glosses not yet committed.
 */
export interface Sentence {
  readonly glosses: readonly string[];
  /** The words to print. Not one per gloss: signs LSA combines into one meaning print as one word. */
  readonly text: readonly string[];
  readonly pending: readonly string[];
}

/** A sentence the signer has finished, reported once. */
export interface FinishedSentence {
  readonly glosses: readonly string[];
  /** As in {@link Sentence.text}. */
  readonly text: readonly string[];
}

export interface PulsaError {
  /** Stable and machine-readable, e.g. `invalid_key`, `camera_denied`. */
  readonly code: string;
  readonly message: string;
  /** True when the component has stopped and will not recover on its own. */
  readonly fatal: boolean;
  readonly details?: Readonly<Record<string, unknown>>;
}

export type RecognizerStatus =
  | "requesting-camera"
  | "loading-model"
  | "connecting"
  | "ready"
  | "reconnecting"
  | "offline"
  | "camera-denied"
  | "error";

export interface RecognizerCallbacks {
  /** A session started; these are the signs it recognises. Called again after reconnecting. */
  onReady?: ((vocabulary: readonly Sign[]) => void) | undefined;
  onSentence?: ((sentence: Sentence) => void) | undefined;
  onSentenceFinished?: ((sentence: FinishedSentence) => void) | undefined;
  onStatus?: ((status: RecognizerStatus) => void) | undefined;
  onError?: ((error: PulsaError) => void) | undefined;
}
