import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  MAX_BUFFERED_BYTES,
  RecognitionConnection,
  type ConnectionEvents,
  type ConnectionStatus,
} from "../src/connection/recognitionConnection";
import { CloseCode } from "../src/protocol/closePolicy";
import { LANDMARK_VALUES } from "../src/protocol/landmarkFrame";
import type { FinishedSentence, PulsaError, Sentence } from "../src/types";
import { FakeSocket } from "./fakeSocket";

const FRAME = { width: 640, height: 480 };
const LANDMARKS = new Float32Array(LANDMARK_VALUES);

class Recorder implements ConnectionEvents {
  statuses: ConnectionStatus[] = [];
  sentences: Sentence[] = [];
  finished: FinishedSentence[] = [];
  errors: PulsaError[] = [];
  readyCount = 0;
  onStatus = (status: ConnectionStatus) => void this.statuses.push(status);
  onReady = () => void (this.readyCount += 1);
  onSentence = (sentence: Sentence) => void this.sentences.push(sentence);
  onSentenceFinished = (sentence: FinishedSentence) => void this.finished.push(sentence);
  onError = (error: PulsaError) => void this.errors.push(error);
}

function connect(vocabulary?: string[]) {
  const sockets: FakeSocket[] = [];
  const events = new Recorder();
  const connection = new RecognitionConnection(
    {
      endpoint: "wss://api.example/v1/stream",
      apiKey: "pulsa_pk_test_key",
      ...(vocabulary === undefined ? {} : { vocabulary }),
      createSocket: (url) => {
        const socket = new FakeSocket(url);
        sockets.push(socket);
        return socket;
      },
      random: () => 0.5,
    },
    events,
  );
  connection.open(FRAME);
  const latest = () => sockets[sockets.length - 1]!;
  return { connection, events, sockets, latest };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("opening a session", () => {
  it("says hello with the key, frame size and vocabulary, then reports ready", () => {
    const { events, latest } = connect(["YO", "DOLOR"]);
    latest().serverAccepts();

    expect(latest().binaryType).toBe("arraybuffer");
    expect(latest().sentMessages).toEqual([
      {
        type: "hello",
        protocol: 1,
        auth: { api_key: "pulsa_pk_test_key" },
        frame: FRAME,
        vocabulary: ["YO", "DOLOR"],
      },
    ]);
    expect(events.statuses).toEqual(["connecting", "ready"]);
    expect(events.readyCount).toBe(1);
  });

  it("drops frames until the session is ready", () => {
    const { connection, latest } = connect();
    expect(connection.sendFrame(0, LANDMARKS)).toBe(false);
    latest().serverOpens();
    expect(connection.sendFrame(33, LANDMARKS)).toBe(false);
    latest().serverSends({ type: "ready", session_id: "s", model: "m", expires_at: "", vocabulary: [] });
    expect(connection.sendFrame(66, LANDMARKS)).toBe(true);
    expect(latest().sentFrames).toHaveLength(1);
  });
});

describe("streaming", () => {
  it("relays sentences and finished sentences, and ignores unknown messages", () => {
    const { events, latest } = connect();
    latest().serverAccepts();
    latest().serverSends({ type: "sentence", glosses: ["YO"], text: ["yo"], pending: ["DOLOR"] });
    latest().serverSends({ type: "translation", spanish: "Me duele." });
    latest().serverSends({ type: "sentence_finished", glosses: ["YO", "DOLOR"], text: ["yo", "dolor"] });

    expect(events.sentences).toEqual([{ glosses: ["YO"], text: ["yo"], pending: ["DOLOR"] }]);
    expect(events.finished).toEqual([{ glosses: ["YO", "DOLOR"], text: ["yo", "dolor"] }]);
  });

  it("skips frames while the network is not keeping up", () => {
    const { connection, latest } = connect();
    latest().serverAccepts();
    latest().bufferedAmount = MAX_BUFFERED_BYTES + 1;
    expect(connection.sendFrame(0, LANDMARKS)).toBe(false);
    latest().bufferedAmount = 0;
    expect(connection.sendFrame(33, LANDMARKS)).toBe(true);
  });

  it("sends a reset, with a new frame size when the camera changed", () => {
    const { connection, latest } = connect();
    latest().serverAccepts();
    connection.reset();
    connection.reset({ width: 480, height: 640 });
    expect(latest().sentMessages.slice(1)).toEqual([
      { type: "reset" },
      { type: "reset", frame: { width: 480, height: 640 } },
    ]);
  });
});

describe("when a session ends", () => {
  it("starts the next one at once after expiry, at the latest frame size, and clears the sentence", () => {
    const { connection, events, sockets, latest } = connect();
    latest().serverAccepts();
    latest().serverSends({ type: "sentence", glosses: ["YO"], text: ["yo"], pending: [] });
    connection.reset({ width: 480, height: 640 });

    latest().serverCloses(CloseCode.SESSION_EXPIRED);
    expect(sockets).toHaveLength(2);
    latest().serverAccepts();

    expect(latest().sentMessages[0]).toMatchObject({ frame: { width: 480, height: 640 } });
    expect(events.sentences.at(-1)).toEqual({ glosses: [], text: [], pending: [] });
    expect(events.statuses).toEqual(["connecting", "ready", "reconnecting", "ready"]);
  });

  it("retries transient failures with growing delays, and starts over once one succeeds", () => {
    const { sockets, latest } = connect();
    latest().serverCloses(1006);
    expect(sockets).toHaveLength(1);
    vi.advanceTimersByTime(999);
    expect(sockets).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(sockets).toHaveLength(2);

    latest().serverCloses(1006);
    vi.advanceTimersByTime(1999);
    expect(sockets).toHaveLength(2);
    vi.advanceTimersByTime(1);
    expect(sockets).toHaveLength(3);

    latest().serverAccepts();
    latest().serverCloses(1012);
    vi.advanceTimersByTime(1000);
    expect(sockets).toHaveLength(4);
  });

  it.each([
    [CloseCode.UNAUTHORIZED, "invalid_key"],
    [CloseCode.ORIGIN_NOT_ALLOWED, "origin_not_allowed"],
    [CloseCode.BAD_REQUEST, "vocabulary_not_allowed"],
  ])("gives up on close code %i and reports the server's reason", (code, reason) => {
    const { events, sockets, latest } = connect();
    latest().serverOpens();
    latest().serverSends({ type: "error", code: reason, message: "No.", details: { signs: ["X"] } });
    latest().serverCloses(code);
    vi.advanceTimersByTime(60_000);

    expect(sockets).toHaveLength(1);
    expect(events.statuses.at(-1)).toBe("failed");
    expect(events.errors).toEqual([{ code: reason, message: "No.", details: { signs: ["X"] }, fatal: true }]);
  });

  it("reports a busy key without giving up", () => {
    const { events, sockets, latest } = connect();
    latest().serverOpens();
    latest().serverSends({ type: "error", code: "session_limit_reached", message: "Busy." });
    latest().serverCloses(CloseCode.SESSION_LIMIT_REACHED);
    vi.advanceTimersByTime(1000);

    expect(events.errors).toEqual([{ code: "session_limit_reached", message: "Busy.", fatal: false }]);
    expect(sockets).toHaveLength(2);
  });

  it("waits for frames to resume after going idle, then reconnects", () => {
    const { connection, events, sockets, latest } = connect();
    latest().serverAccepts();
    latest().serverCloses(CloseCode.IDLE);
    vi.advanceTimersByTime(60_000);
    expect(sockets).toHaveLength(1);
    expect(events.statuses.at(-1)).toBe("idle");

    expect(connection.acceptsFrames).toBe(true);
    expect(connection.sendFrame(0, LANDMARKS)).toBe(false);
    expect(sockets).toHaveLength(2);
  });

  it("stays closed after close(), whatever the old socket does next", () => {
    const { connection, sockets, latest } = connect();
    latest().serverAccepts();
    const socket = latest();
    connection.close();
    socket.serverCloses(1006);
    vi.advanceTimersByTime(60_000);

    expect(socket.closedWith).toBe(1000);
    expect(sockets).toHaveLength(1);
    expect(connection.currentStatus).toBe("closed");
  });
});
