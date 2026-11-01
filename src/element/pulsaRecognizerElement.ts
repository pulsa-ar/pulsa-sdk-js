/**
 * `<pulsa-recognizer>`: the camera feed, pulsa's logo, and optionally the recognised
 * glosses. Reports through callback properties and through DOM events of the same names.
 *
 *   <pulsa-recognizer api-key="pulsa_pk_..." vocabulary="YO,DOLOR" show-glosses></pulsa-recognizer>
 */

import { explainError, messagesFor, resolveLocale, type Messages } from "../i18n/messages";
import { browserDependencies, Recognizer, type RecognizerDependencies } from "../recognizer/recognizer";
import type {
  FinishedSentence,
  PulsaError,
  RecognizerCallbacks,
  RecognizerStatus,
  Sentence,
  Sign,
} from "../types";
import { ARTWORK } from "./assets";
import { STYLES } from "./styles";

export const ELEMENT_NAME = "pulsa-recognizer";

/** The DOM events the element dispatches; each `detail` is what the matching callback gets. */
export interface PulsaRecognizerEventMap {
  "pulsa-ready": CustomEvent<readonly Sign[]>;
  "pulsa-sentence": CustomEvent<Sentence>;
  "pulsa-sentence-finished": CustomEvent<FinishedSentence>;
  "pulsa-status": CustomEvent<RecognizerStatus>;
  "pulsa-error": CustomEvent<PulsaError>;
}

// Changing any of these starts a new session; the rest only change how it looks.
const SESSION_ATTRIBUTES = new Set(["api-key", "endpoint", "vocabulary"]);
const WIDE_ENOUGH_FOR_FULL_LOGO_PX = 480;
const READY_BADGE_MS = 2500;
const EMPTY_SENTENCE: Sentence = { glosses: [], text: [], pending: [] };

interface Screen {
  readonly image?: string;
  readonly spinner?: boolean;
  readonly title: string;
  readonly detail?: string;
}

export class PulsaRecognizerElement extends HTMLElement implements RecognizerCallbacks {
  static readonly observedAttributes = ["api-key", "endpoint", "vocabulary", "locale", "show-glosses", "mirrored"];

  onReady: ((vocabulary: readonly Sign[]) => void) | undefined;
  onSentence: ((sentence: Sentence) => void) | undefined;
  onSentenceFinished: ((sentence: FinishedSentence) => void) | undefined;
  onStatus: ((status: RecognizerStatus) => void) | undefined;
  onError: ((error: PulsaError) => void) | undefined;

  /** What sessions are built on; replaced only by tests. */
  dependencies: RecognizerDependencies = browserDependencies;

  private recognizer: Recognizer | null = null;
  // Whether a session was attempted since connecting; until then attributes just accumulate.
  private started = false;
  private currentStatus: RecognizerStatus | null = null;
  private lastError: PulsaError | null = null;
  private sentence: Sentence = EMPTY_SENTENCE;
  private signTexts = new Map<string, string>();
  private readyBadgeUntil = 0;
  private readyBadgeTimer: ReturnType<typeof setTimeout> | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private readonly parts: ReturnType<typeof buildShadowDom>;

  constructor() {
    super();
    this.parts = buildShadowDom(this.attachShadow({ mode: "open" }));
  }

  get status(): RecognizerStatus | null {
    return this.currentStatus;
  }

  connectedCallback(): void {
    this.setAttribute("role", "region");
    this.observeWidth();
    this.render();
    // Lets a framework set callback properties before the first session starts.
    queueMicrotask(() => this.isConnected && this.restart());
  }

  disconnectedCallback(): void {
    this.stopSession();
    this.started = false;
    this.currentStatus = null;
    if (this.readyBadgeTimer !== null) clearTimeout(this.readyBadgeTimer);
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
  }

  attributeChangedCallback(name: string, previous: string | null, next: string | null): void {
    if (previous === next) return;
    if (SESSION_ATTRIBUTES.has(name) && this.isConnected && this.started) {
      this.restart();
    } else {
      this.render();
    }
  }

  /** Clears the sentence and keeps recognising. */
  reset(): void {
    this.recognizer?.reset();
  }

  private restart(): void {
    this.stopSession();
    this.started = true;
    this.sentence = EMPTY_SENTENCE;
    const apiKey = this.getAttribute("api-key")?.trim();
    if (!apiKey) {
      this.showStatus("error");
      this.showError({ code: "missing_api_key", message: "Set the api-key attribute.", fatal: true });
      return;
    }
    const endpoint = this.getAttribute("endpoint")?.trim();
    const vocabulary = parseVocabulary(this.getAttribute("vocabulary"));
    this.recognizer = new Recognizer(
      this.parts.video,
      {
        apiKey,
        ...(endpoint ? { endpoint } : {}),
        ...(vocabulary === undefined ? {} : { vocabulary }),
      },
      {
        onReady: (signs) => this.showReady(signs),
        onSentence: (sentence) => this.showSentence(sentence),
        onSentenceFinished: (sentence) => this.emit("pulsa-sentence-finished", sentence, this.onSentenceFinished),
        onStatus: (status) => this.showStatus(status),
        onError: (error) => this.showError(error),
      },
      this.dependencies,
    );
    void this.recognizer.start();
  }

  private stopSession(): void {
    this.recognizer?.stop();
    this.recognizer = null;
    this.lastError = null;
  }

  private showReady(signs: readonly Sign[]): void {
    this.signTexts = new Map(signs.map((sign) => [sign.gloss, sign.text]));
    this.emit("pulsa-ready", signs, this.onReady);
  }

  private showSentence(sentence: Sentence): void {
    this.sentence = sentence;
    this.render();
    this.emit("pulsa-sentence", sentence, this.onSentence);
  }

  private showStatus(status: RecognizerStatus): void {
    if (status === "ready" && this.currentStatus !== "ready") {
      this.flashReadyBadge();
    }
    if (status !== "error") {
      this.lastError = null;
    }
    this.currentStatus = status;
    this.render();
    this.emit("pulsa-status", status, this.onStatus);
  }

  private showError(error: PulsaError): void {
    if (error.fatal) {
      this.lastError = error;
      this.render();
    }
    this.emit("pulsa-error", error, this.onError);
  }

  private flashReadyBadge(): void {
    this.readyBadgeUntil = Date.now() + READY_BADGE_MS;
    if (this.readyBadgeTimer !== null) clearTimeout(this.readyBadgeTimer);
    this.readyBadgeTimer = setTimeout(() => this.render(), READY_BADGE_MS);
  }

  private emit<Detail>(type: keyof PulsaRecognizerEventMap, detail: Detail, callback?: (detail: Detail) => void): void {
    try {
      callback?.(detail);
    } catch (error) {
      // An app's callback failing must not stop recognition; the browser still logs it.
      if (typeof reportError === "function") reportError(error);
      else console.error(error);
    }
    this.dispatchEvent(new CustomEvent(type, { detail, bubbles: true, composed: true }));
  }

  private observeWidth(): void {
    if (typeof ResizeObserver === "undefined" || this.resizeObserver !== null) return;
    this.resizeObserver = new ResizeObserver(([entry]) => {
      this.toggleAttribute("data-wide", (entry?.contentRect.width ?? 0) >= WIDE_ENOUGH_FOR_FULL_LOGO_PX);
    });
    this.resizeObserver.observe(this);
  }

  private render(): void {
    const messages = messagesFor(resolveLocale(this.getAttribute("locale") ?? document.documentElement.lang));
    this.setAttribute("aria-label", messages.componentLabel);
    this.renderScreen(screenFor(this.currentStatus, this.lastError, messages));
    this.renderBadge(messages);
    this.renderGlosses();
  }

  private renderScreen(screen: Screen | null): void {
    const { screen: container, screenImage, screenSpinner, screenTitle, screenDetail } = this.parts;
    container.toggleAttribute("data-visible", screen !== null);
    if (screen === null) return;
    screenImage.hidden = screen.image === undefined;
    screenImage.src = screen.image ?? "";
    screenSpinner.hidden = !screen.spinner;
    screenTitle.textContent = screen.title;
    screenDetail.textContent = screen.detail ?? "";
    screenDetail.hidden = screen.detail === undefined;
  }

  private renderBadge(messages: Messages): void {
    const { badge, badgeImage, badgeText } = this.parts;
    const reconnecting = this.currentStatus === "reconnecting";
    const justReady = this.currentStatus === "ready" && Date.now() < this.readyBadgeUntil;
    badge.toggleAttribute("data-visible", reconnecting || justReady);
    badgeImage.hidden = !justReady;
    badgeImage.src = justReady ? ARTWORK.characters.ok : "";
    badgeText.textContent = reconnecting ? messages.status.reconnecting : messages.status.ready;
  }

  private renderGlosses(): void {
    const { glosses } = this.parts;
    const chips = [
      ...this.sentence.text.map((text) => chip(text, false)),
      ...this.sentence.pending.map((gloss) => chip(this.signTexts.get(gloss) ?? gloss, true)),
    ];
    glosses.replaceChildren(...chips);
    glosses.toggleAttribute("data-visible", chips.length > 0);
  }
}

/** The full-cover screen for a status, or null when the camera feed should show. */
export function screenFor(
  status: RecognizerStatus | null,
  error: PulsaError | null,
  messages: Messages,
): Screen | null {
  switch (status) {
    case null:
    case "ready":
    case "reconnecting":
      return null;
    case "requesting-camera":
      return { image: ARTWORK.characters.pleaseCamera, title: messages.status[status] };
    case "loading-model":
    case "connecting":
      return { spinner: true, title: messages.status[status] };
    case "camera-denied":
      return { image: ARTWORK.characters.noCameraAccess, title: messages.status[status] };
    case "offline":
      return { image: ARTWORK.characters.noInternetAccess, title: messages.status[status] };
    case "error":
      return {
        image: ARTWORK.characters.question,
        title: messages.status.error,
        detail: explainError(messages, error?.code ?? "fallback"),
      };
  }
}

/** `"YO, DOLOR,,AYUDAR"` -> `["YO", "DOLOR", "AYUDAR"]`; absent or blank means every sign. */
export function parseVocabulary(attribute: string | null): string[] | undefined {
  const signs = (attribute ?? "").split(",").map((sign) => sign.trim()).filter((sign) => sign.length > 0);
  return signs.length > 0 ? signs : undefined;
}

function chip(text: string, pending: boolean): HTMLElement {
  const element = document.createElement("span");
  element.className = pending ? "gloss pending" : "gloss";
  element.textContent = text;
  return element;
}

function buildShadowDom(root: ShadowRoot) {
  const style = document.createElement("style");
  style.textContent = STYLES;

  const video = document.createElement("video");
  video.autoplay = true;
  video.muted = true;
  video.playsInline = true;
  video.setAttribute("aria-hidden", "true");

  const screen = element("div", "screen");
  const screenImage = image("");
  const screenSpinner = element("div", "spinner");
  const screenTitle = element("div", "title");
  const screenDetail = element("div", "detail");
  screen.append(screenImage, screenSpinner, screenTitle, screenDetail);
  screen.setAttribute("role", "status");

  const badge = element("div", "badge");
  const badgeImage = image("");
  const badgeText = element("span", "badge-text");
  badge.append(badgeImage, badgeText);
  badge.setAttribute("role", "status");

  const glosses = element("div", "glosses");
  glosses.setAttribute("aria-live", "polite");

  const brand = element("div", "brand");
  brand.append(image(ARTWORK.icon, "icon", "pulsa"), image(ARTWORK.logo, "logo", "pulsa"));

  root.append(style, video, glosses, badge, brand, screen);
  return { video, screen, screenImage, screenSpinner, screenTitle, screenDetail, badge, badgeImage, badgeText, glosses };
}

function element(tag: "div" | "span", className: string): HTMLElement {
  const created = document.createElement(tag);
  created.className = className;
  return created;
}

function image(source: string, className = "", alt = ""): HTMLImageElement {
  const created = document.createElement("img");
  created.src = source;
  created.alt = alt;
  if (className) created.className = className;
  return created;
}

declare global {
  interface HTMLElementTagNameMap {
    [ELEMENT_NAME]: PulsaRecognizerElement;
  }
  interface HTMLElementEventMap extends PulsaRecognizerEventMap {}
}
