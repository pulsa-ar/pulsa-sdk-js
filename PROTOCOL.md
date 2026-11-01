# pulsa recognition protocol, version 1

How a client talks to the pulsa API. The SDK implements this; read it if you are writing
another client or debugging one.

A session is one WebSocket. The client sends MediaPipe landmarks for each camera frame, and
the server replies with the sentence it reads from them, as glosses (`YO`, `DOLOR`) and as
printable text (`yo`, `dolor`).

```
client                                   server
  | -- connect wss://api.pulsa.ar/v1/stream -->|
  | -- hello (JSON) ------------------------->|
  |<----------------------------- ready (JSON) |
  | -- landmark frame (binary) -------------->|
  | -- landmark frame (binary) -------------->|
  |<-------------------------- sentence (JSON) |
  | -- ...                                    |
  |<----------------- sentence_finished (JSON) |
  |<-------------------- close (code, reason)  |
```

Control messages are JSON text frames. Landmarks are binary frames.

## Client to server

### `hello`

The first message, within 10 seconds of connecting. Credentials travel here because browsers
cannot set headers on a WebSocket, and URLs end up in logs.

```json
{
  "type": "hello",
  "protocol": 1,
  "auth": { "api_key": "pulsa_pk_test_..." },
  "frame": { "width": 640, "height": 480 },
  "vocabulary": ["YO", "DOLOR", "AYUDAR"]
}
```

| Field | |
|---|---|
| `protocol` | `1`. Any other version is refused with close code `4426`. |
| `auth.api_key` | A publishable key. Secret keys (`pulsa_sk_...`) are refused: they belong on servers. |
| `frame` | The size of the frames MediaPipe sees, in pixels. The model needs their aspect ratio. |
| `vocabulary` | Optional. The only signs to recognise. It can narrow what the key allows, never widen it. Signs outside it are ignored, not read as the nearest allowed one. |

Live keys work only from the origins they were issued for. Test keys also work from
`localhost`, `127.0.0.1` and `[::1]` on any port, and from `https://demo.pulsa.ar`.

### Landmark frame (binary)

One per camera frame, at most 30 per second, after `ready`. 908 bytes, all little-endian:

| Bytes | Type | |
|---|---|---|
| 0–7 | float64 | Capture time in milliseconds, on the client's clock. Must only increase. |
| 8–907 | float32 × 225 | Pose (33 points), then left hand (21), then right hand (21), each `x, y, z` as MediaPipe's Holistic Landmarker reports them. Zeros for anything not detected. |

Send capture times, not send times: the server resamples the stream onto the model's 30 fps
grid by them, so a phone that only manages 12 fps still works, and network jitter does not
distort a sign.

The landmarks must come from the **unmirrored** frame. Mirroring the preview for the signer
is fine; mirroring the input swaps the hands, and with them every handed sign.

The Holistic Landmarker must be the one the model was trained with:
`holistic_landmarker/float16/1/holistic_landmarker.task`, with minimum face detection, pose
detection and hand landmark confidences of 0.5.

### `reset`

```json
{ "type": "reset", "frame": { "width": 480, "height": 640 } }
```

Clears the sentence. `frame` is optional; send it when the camera's frame size changes, for
example when a phone rotates.

## Server to client

### `ready`

```json
{
  "type": "ready",
  "session_id": "4f7c…",
  "model": "quiron-1.0",
  "expires_at": "2026-11-01T15:10:00Z",
  "vocabulary": [{ "gloss": "YO", "text": "yo" }, { "gloss": "DOLOR", "text": "dolor" }]
}
```

The session is open, and `vocabulary` lists the signs it recognises. A session lasts at most
10 minutes, until `expires_at`.

### `sentence`

```json
{ "type": "sentence", "glosses": ["YO", "DOLOR"], "text": ["yo", "dolor"], "pending": ["AYUDAR"] }
```

Sent whenever the sentence or its pending signs change. It is always the **whole** sentence,
because the recogniser can replace its last word, so replace what you show and never append.
`pending` holds glosses seen but not yet committed.

### `sentence_finished`

```json
{ "type": "sentence_finished", "glosses": ["YO", "DOLOR"], "text": ["yo", "dolor"] }
```

The signer has finished a sentence; each finished sentence is reported once.

### `error`

```json
{ "type": "error", "code": "vocabulary_not_allowed", "message": "…", "details": { "signs": ["NADAR"] } }
```

Sent just before the server closes a session, saying why.

### Messages a client does not know

Ignore them. The server may add message types without a new protocol version, such as a
planned `translation` with the sentence in Spanish.

## Close codes

| Code | Meaning | Reconnect? |
|---|---|---|
| 4000 | The session reached 10 minutes | Yes, at once |
| 4001 | Invalid, revoked or secret key | No |
| 4003 | The key is not enabled for this origin | No |
| 4008 | No `hello` within 10 seconds | Yes, with backoff |
| 4011 | No frames for 120 seconds | When frames resume |
| 4029 | The key's limit of concurrent sessions was reached | Yes, with backoff |
| 4400 | Malformed message, or a vocabulary the key does not allow | No |
| 4426 | Unsupported protocol version | No |
| 1011, 1012, network loss | Server error or restart | Yes, with backoff |

Back off exponentially from 1 to 30 seconds, with some jitter. A reconnect starts a new
session, and a new session starts with an empty sentence.

## REST

`GET /v1/vocabulary` with `Authorization: Bearer <publishable key>` returns the signs the
key may use with the model being served:

```json
{ "model": "quiron-1.0", "vocabulary": [{ "gloss": "YO", "text": "yo" }] }
```
