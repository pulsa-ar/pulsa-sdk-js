# pulsa SDK

Argentine Sign Language (LSA) recognition in the browser. `<pulsa-recognizer>` shows the
camera, runs [MediaPipe](https://ai.google.dev/edge/mediapipe) on the device, streams the
landmarks to the pulsa API, and tells your app which signs it read.

Only landmarks leave the device, never video.

## Install

```bash
npm install @pulsa/sdk
```

Or without a bundler:

```html
<script type="module" src="https://cdn.jsdelivr.net/npm/@pulsa/sdk@0.1.0/dist/pulsa.js"></script>
```

You need a publishable API key from pulsa. A **test key** (`pulsa_pk_test_...`) works from
`localhost` on any port and from the demo at https://demo.pulsa.ar, where you can try it
before writing any code. A **live key** (`pulsa_pk_live_...`) works only from the sites it was
issued for.

## Use

### HTML

```html
<pulsa-recognizer api-key="pulsa_pk_test_..." show-glosses></pulsa-recognizer>

<script type="module">
  import "@pulsa/sdk";

  const recognizer = document.querySelector("pulsa-recognizer");
  recognizer.onSentence = ({ glosses, text, pending }) => {
    // The whole sentence so far. Replace what you show; the last word can change.
  };
  recognizer.onSentenceFinished = ({ glosses, text }) => {
    // The signer finished a sentence. Reported once per sentence.
  };
</script>
```

The same reports are also DOM events: `pulsa-sentence`, `pulsa-sentence-finished`,
`pulsa-ready`, `pulsa-status`, `pulsa-error`, each with its payload in `event.detail`.

### React

```tsx
import { PulsaRecognizer } from "@pulsa/sdk/react";

<PulsaRecognizer
  apiKey="pulsa_pk_test_..."
  showGlosses
  onSentenceFinished={({ glosses }) => console.log(glosses)}
/>;
```

To clear the sentence, pass a `ref` and call `ref.current.reset()`.

## Options

| Attribute | React prop | Default | |
|---|---|---|---|
| `api-key` | `apiKey` | | Required. A publishable key. |
| `vocabulary` | `vocabulary` | everything the key allows | Comma-separated glosses (`YO,DOLOR`). Narrows recognition: signs outside it are ignored. |
| `show-glosses` | `showGlosses` | off | Shows the sentence over the camera feed; pending signs are lighter. |
| `locale` | `locale` | the page's `lang`, else `es` | `es` or `en`, for the component's own messages. |
| `mirrored` | `mirrored` | on | Mirrors the preview like a selfie camera. Recognition is unaffected. |
| `endpoint` | `endpoint` | `wss://api.pulsa.ar/v1/stream` | For local development against your own server. |

## Callbacks

| | Payload |
|---|---|
| `onSentence` | `{ glosses, text, pending }`: the whole sentence so far. |
| `onSentenceFinished` | `{ glosses, text }`: a finished sentence, once. |
| `onReady` | The signs this session recognises, as `{ gloss, text }`. Called again after a reconnect. |
| `onStatus` | `requesting-camera`, `loading-model`, `connecting`, `ready`, `reconnecting`, `offline`, `camera-denied` or `error`. |
| `onError` | `{ code, message, fatal, details? }`. When `fatal` is true, the component has stopped; fix the cause and set the attributes again. |

Error codes include `invalid_key`, `origin_not_allowed`, `vocabulary_not_allowed`,
`camera_denied`, `camera_unavailable` and `session_limit_reached` (not fatal: the component
retries).

## Behaviour

- **Sessions** last 10 minutes and are renewed automatically. A new session starts with an
  empty sentence, and you will get an empty `onSentence`.
- **Network loss**: the component reconnects with backoff, and shows a non-blocking badge, or
  a full "no internet" screen while the browser is offline.
- **Frame rate**: the component sends at most 30 frames per second, and sends capture
  timestamps. The server resamples them, so slower devices (10–20 fps) still work.
- **Camera**: the page must be served over https, or from localhost. Removing the element
  from the page stops the camera.
- **Privacy**: only 225 numbers per frame (pose and hand positions) are sent, never images.

## Development

```bash
npm install
npm test            # unit tests
npm run typecheck
npm run build       # dist/: npm entries, the standalone dist/pulsa.js, type declarations
npm run dev         # examples/ at http://localhost:5173, against the source
npm run build:demo  # examples/ built into demo-dist/, as published
```

The example page is the demo. Under `npm run dev` it talks to a local pulsa server at
`ws://localhost:8000/v1/stream`; built, to `wss://api.pulsa.ar`. It reads nothing from its
address, so a shared link can neither carry a key nor point one at another server.

To release, bump `version` in `package.json` and push a matching `v*` tag. The tag publishes
the package to npm (`.github/workflows/publish.yml`, through npm trusted publishing, so no npm
token exists) and the demo to https://demo.pulsa.ar (`.github/workflows/demo.yml`). A
published version can never be replaced, so a fix is always a new version.

The wire protocol is specified in [PROTOCOL.md](PROTOCOL.md).
`test/fixtures/landmark-frame.hex` was written by the server's encoder, so the client's
encoder is tested against the server's exact bytes.

## License

[MIT](LICENSE)
