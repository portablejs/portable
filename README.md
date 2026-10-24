# <picture><source media="(prefers-color-scheme: dark)" srcset="assets/logo-dark.svg"><img src="assets/logo-light.svg" alt="" style="height: 1cap"></picture>&nbsp; Portable

Web-standard building blocks for any JavaScript runtime.

For example, this streams a model's reply with three of the packages and saves it as a transcript:

```sh
npm install @portable/sse @portable/jsonl @portable/streams
```

```ts
import * as Jsonl from '@portable/jsonl'
import * as Sse from '@portable/sse'
import * as Streams from '@portable/streams'

// Print a model's reply as it streams in, and save every chunk to a JSON Lines transcript.
const response = await fetch('https://api.example.com/v1/chat/completions', {
  method: 'POST',
  headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
  body: JSON.stringify({ model, messages, stream: true }),
})
const [live, saved] = response
  .body!.pipeThrough(new Sse.DecoderStream())
  .pipeThrough(Streams.filter((event) => event.data !== '[DONE]'))
  .pipeThrough(Streams.map((event) => JSON.parse(event.data)))
  .tee()

const saving = saved.pipeThrough(new Jsonl.EncoderStream()).pipeTo(transcript) // write to a file
const reader = live.getReader()
for (let r = await reader.read(); !r.done; r = await reader.read()) print(r.value.choices[0].delta.content ?? '')
await saving
```

Most npm packages for streams, encodings, email and crypto were written for Node. They import `node:stream`, `node:crypto` or `Buffer`, so a browser bundle needs polyfills and a Cloudflare Worker needs the `nodejs_compat` flag. Portable packages use only the APIs that every runtime has: [`fetch`](https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API), [Web Streams](https://developer.mozilla.org/en-US/docs/Web/API/Streams_API), [`Uint8Array`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Uint8Array), [`TextEncoder`](https://developer.mozilla.org/en-US/docs/Web/API/TextEncoder) and [`crypto.subtle`](https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto).

- **Only web APIs.** Lint rejects `node:*` imports, `Buffer`, `process` and DOM globals in package code. The tests run in Node 24 and 26, Bun, Deno, Chromium, Firefox and WebKit, and inside a Web Worker, and every package is loaded and checked in workerd, the Cloudflare Workers runtime.
- **No outside dependencies.** A package depends only on other `@portable/*` packages. Crypto uses WebCrypto by default, and you can pass a function from `@noble/hashes` or another library instead.
- **Tested against the npm libraries for the same job.** Each package's `PARITY.md` maps every test of those libraries to our test for the same case, or says why the case doesn't apply. Oracle tests compare our output with theirs.
- **Benchmarked.** Each package README has a table that compares its speed, bundle size and dependency count with those libraries.
- **Consistent API.** You import a package as a namespace (`import * as Base64`), call `encode` and `decode` or `parse` and `format`, pipe through a `DecoderStream` or `EncoderStream`, and pass a `signal` to anything that can be cancelled.

## Packages

### Streams and bytes

| Package | What it does |
| --- | --- |
| [`@portable/streams`](packages/streams) | Collects, combines and transforms web streams and iterables. |
| [`@portable/lines`](packages/lines) | Splits a stream of bytes or text into lines. |
| [`@portable/bytes`](packages/bytes) | Hex encoding, concatenation and constant-time comparison of `Uint8Array`s. |
| [`@portable/errors`](packages/errors) | The error classes every package throws. `Errors.is` and `instanceof` match them even when an app has two copies of a package. |
| [`@portable/compress`](packages/compress) | gzip and deflate on the platform's `CompressionStream`, a decompression stream with an output limit, and CRC-32. |

### Encodings

| Package | What it does |
| --- | --- |
| [`@portable/base64`](packages/base64) | base64 and base64url, with MIME line wrapping and streams. |
| [`@portable/quoted-printable`](packages/quoted-printable) | Quoted-printable encoding and decoding, as functions and streams. |
| [`@portable/charset`](packages/charset) | Encodes text into legacy charsets such as Shift_JIS, GBK, Big5 and windows-1251. |
| [`@portable/idna`](packages/idna) | Converts domain names between Unicode and ASCII by UTS #46. |

### Data formats

| Package | What it does |
| --- | --- |
| [`@portable/csv`](packages/csv) | Decodes and encodes CSV, as functions and streams. |
| [`@portable/jsonl`](packages/jsonl) | Decodes and encodes JSON Lines streams. |
| [`@portable/json-stream`](packages/json-stream) | Selects values from a large JSON document by JSONPath, and writes JSON from a tree of promises and streams. |

### Email

| Package | What it does |
| --- | --- |
| [`@portable/mail`](packages/mail) | Builds a raw email message, with attachments and inline images, as a stream. |
| [`@portable/mime-headers`](packages/mime-headers) | Encoded words, folding, parameters and address lists in email headers. |
| [`@portable/mime-stream`](packages/mime-stream) | Splits a MIME message into a stream of headers and bodies and writes it back byte for byte. |
| [`@portable/smtp`](packages/smtp) | Sends email over SMTP or LMTP from any runtime with a TCP socket API. |
| [`@portable/dkim`](packages/dkim) | Signs and verifies DKIM signatures. |
| [`@portable/spf`](packages/spf) | Checks whether a client may send mail for a domain, using SPF. |
| [`@portable/dmarc`](packages/dmarc) | Checks a message against the DMARC policy of its From domain. |
| [`@portable/arc`](packages/arc) | Seals and verifies ARC sets. |
| [`@portable/mail-auth`](packages/mail-auth) | Checks a received message's SPF, DKIM, DMARC and ARC in one call, writes the Authentication-Results header, and ARC-seals it. |

### DNS and networking

| Package | What it does |
| --- | --- |
| [`@portable/dns`](packages/dns) | Looks up DNS records over DNS-over-HTTPS, behind a resolver interface that `node:dns/promises` also fits. |
| [`@portable/dns-packet`](packages/dns-packet) | Encodes and decodes DNS messages in wire format. |
| [`@portable/ip`](packages/ip) | Parses, formats, compares and classifies IPv4 and IPv6 addresses and CIDR blocks. |
| [`@portable/rdap`](packages/rdap) | Looks up who holds a domain name, an IP address or an AS number over RDAP. |

### Crypto and auth

| Package | What it does |
| --- | --- |
| [`@portable/web-crypto`](packages/web-crypto) | Bytes-in, bytes-out helpers over `crypto.subtle`: digests, HMAC, HKDF, Ed25519 and X25519 keys from seeds, and ECDSA signature conversion. |
| [`@portable/password`](packages/password) | Hashes and verifies passwords with PBKDF2 on WebCrypto. |
| [`@portable/webhooks`](packages/webhooks) | Verifies and signs webhooks from Standard Webhooks senders, Stripe, GitHub, Slack and other HMAC-SHA256 senders. |
| [`@portable/oauth1`](packages/oauth1) | Signs OAuth 1.0a requests. |
| [`@portable/random`](packages/random) | Unbiased random integers, strings, shuffles and bytes, and a seeded generator for tests. |

### Realtime

| Package | What it does |
| --- | --- |
| [`@portable/websockets`](packages/websockets) | A WebSocket that reconnects, with a readable stream of incoming messages and a writable stream for outgoing ones. |
| [`@portable/sse`](packages/sse) | Reads, writes and reconnects server-sent event streams. |
| [`@portable/rpc`](packages/rpc) | Typed JSON-RPC 2.0 calls over a `MessagePort`, a window, a WebSocket or HTTP, with streaming results. |
| [`@portable/web-push`](packages/web-push) | Sends Web Push notifications with payload encryption and VAPID. |

### Images

| Package | What it does |
| --- | --- |
| [`@portable/image-size`](packages/image-size) | Reads an image's type and dimensions from its header, from bytes or a stream. |
| [`@portable/exif`](packages/exif) | Reads EXIF metadata from JPEG, TIFF, PNG, WebP, HEIC and AVIF files, and removes it. |
| [`@portable/png`](packages/png) | Decodes PNG files to RGBA pixels and encodes pixels as PNG. |

### Concurrency and timing

| Package | What it does |
| --- | --- |
| [`@portable/queue`](packages/queue) | Limits how many async tasks run at once, with priorities and cancellation. |
| [`@portable/timers`](packages/timers) | Sleep, retry, poll, debounce and throttle, all cancellable with an `AbortSignal`. |
| [`@portable/rate-limit`](packages/rate-limit) | Rate limiting per key with GCRA, in memory, Workers KV, a Durable Object or Redis over HTTP. |

## Contributing

See [docs/architecture.md](docs/architecture.md) for how the repo is built and tested, and [AGENTS.md](AGENTS.md) for the commands and the rules contributors follow.

## License

MIT
