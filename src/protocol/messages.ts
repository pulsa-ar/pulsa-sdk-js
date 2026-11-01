/**
 * The wire protocol, version 1, as PROTOCOL.md specifies it. Field names are the server's
 * (snake_case); the SDK's public types are camelCase and live in `../types.ts`.
 */

export const PROTOCOL_VERSION = 1;

export interface FrameSize {
  readonly width: number;
  readonly height: number;
}

export interface HelloMessage {
  readonly type: "hello";
  readonly protocol: number;
  readonly auth: { readonly api_key: string };
  readonly frame: FrameSize;
  readonly vocabulary?: readonly string[];
}

export interface ResetMessage {
  readonly type: "reset";
  readonly frame?: FrameSize;
}

export interface SignMessage {
  readonly gloss: string;
  readonly text: string;
}

export interface ReadyMessage {
  readonly type: "ready";
  readonly session_id: string;
  readonly model: string;
  readonly expires_at: string;
  readonly vocabulary: readonly SignMessage[];
}

export interface SentenceMessage {
  readonly type: "sentence";
  readonly glosses: readonly string[];
  readonly text: readonly string[];
  readonly pending: readonly string[];
}

export interface SentenceFinishedMessage {
  readonly type: "sentence_finished";
  readonly glosses: readonly string[];
  readonly text: readonly string[];
}

export interface ErrorMessage {
  readonly type: "error";
  readonly code: string;
  readonly message: string;
  readonly details?: Readonly<Record<string, unknown>>;
}

export type ServerMessage = ReadyMessage | SentenceMessage | SentenceFinishedMessage | ErrorMessage;

const KNOWN_SERVER_MESSAGES: ReadonlySet<string> = new Set([
  "ready",
  "sentence",
  "sentence_finished",
  "error",
]);

/**
 * A server message, or null for one this version does not know (such as the reserved
 * `translation`), which a client must ignore so the server can add messages safely.
 */
export function parseServerMessage(data: string): ServerMessage | null {
  const parsed: unknown = JSON.parse(data);
  if (typeof parsed !== "object" || parsed === null || !("type" in parsed)) {
    throw new Error("The server sent a message without a type.");
  }
  const type = (parsed as { type: unknown }).type;
  if (typeof type !== "string" || !KNOWN_SERVER_MESSAGES.has(type)) {
    return null;
  }
  return parsed as ServerMessage;
}
