/** What the client does when the server, or the network, ends a session. */

export const CloseCode = {
  SESSION_EXPIRED: 4000,
  UNAUTHORIZED: 4001,
  ORIGIN_NOT_ALLOWED: 4003,
  HELLO_TIMEOUT: 4008,
  IDLE: 4011,
  SESSION_LIMIT_REACHED: 4029,
  BAD_REQUEST: 4400,
  UNSUPPORTED_PROTOCOL: 4426,
} as const;

export type ReconnectAction =
  // The session simply ran its length; start the next one at once.
  | "immediately"
  // Something transient: the network, a restart, a busy key.
  | "with-backoff"
  // Nothing was sent for a while; reconnect when frames flow again.
  | "when-frames-resume"
  // Retrying cannot help: bad key, wrong origin, a protocol mismatch.
  | "never";

const ACTIONS: ReadonlyMap<number, ReconnectAction> = new Map([
  [CloseCode.SESSION_EXPIRED, "immediately"],
  [CloseCode.UNAUTHORIZED, "never"],
  [CloseCode.ORIGIN_NOT_ALLOWED, "never"],
  [CloseCode.HELLO_TIMEOUT, "with-backoff"],
  [CloseCode.IDLE, "when-frames-resume"],
  [CloseCode.SESSION_LIMIT_REACHED, "with-backoff"],
  [CloseCode.BAD_REQUEST, "never"],
  [CloseCode.UNSUPPORTED_PROTOCOL, "never"],
]);

export function reconnectActionFor(closeCode: number): ReconnectAction {
  // Unlisted codes are the network's or the server's (1006, 1011, 1012...): transient.
  return ACTIONS.get(closeCode) ?? "with-backoff";
}

const FIRST_RETRY_MS = 1_000;
const LONGEST_RETRY_MS = 30_000;
// Spread retries so clients dropped together do not return together.
const JITTER = 0.2;

/**
 * How long to wait before reconnect attempt `attempt` (0-based): doubling from one second
 * to thirty, give or take a fifth.
 */
export function backoffDelayMs(attempt: number, random: () => number = Math.random): number {
  const base = Math.min(LONGEST_RETRY_MS, FIRST_RETRY_MS * 2 ** attempt);
  return Math.round(base * (1 - JITTER + 2 * JITTER * random()));
}
