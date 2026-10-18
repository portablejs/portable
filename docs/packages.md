# Portable: package philosophy and list

How the repository is built and tested is in [architecture.md](architecture.md).

## Philosophy

In the tradition of sindresorhus and TJ Holowaychuk, and closest in spirit to Remix v3 (`remix-run/remix`, about 50 packages, most with no outside dependencies, layered on each other and re-exported by one `remix` package).

1. **Purpose-sized, not function-sized.** A package solves a problem a developer would name: "split a stream into lines", "compose an email", "verify DKIM". It is not one function (no `is-odd`) and it is not a grab bag. Rough test: if it is under ~50 lines with no edge cases worth a test suite, it is an internal helper. If its README needs two unrelated "what it's for" headings, it is two packages.
2. **Compose upward.** Higher packages are built from lower Portable packages, and the dependency graph is a strict layer DAG (§Layers). This is how Remix's `response` sits on `headers` + `mime` + `html-template`, and how our `mail` sits on `mime-headers` + `base64` + `quoted-printable`.
3. **No dependencies outside the family.** The one exception is crypto: it defaults to WebCrypto and is pluggable, and a package that needs an incremental hash takes `@noble/hashes` as an optional peer.
4. **Web standards are the API.** Inputs and outputs are `Uint8Array`, `string`, `ReadableStream`, `Request`/`Response`, `Headers`, `Blob`/`File`. Streaming transforms are `TransformStream` subclasses used like the platform's own (`stream.pipeThrough(new Lines.DecoderStream())`, as with `TextDecoderStream` and Deno's `TextLineStream`). Where a platform type is close, extend it rather than invent one, as Remix's `SuperHeaders extends Headers` does.
5. **One thing well, then 1.0.** Small stable API, explicit about what it does not do, and a "Replaces X" migration table in each README.
6. **Same coverage as what we replace.** A package that replaces a popular library solves the same problem with its own API and implementation, and covers every case that library's tests cover, with a `PARITY.md` mapping each upstream test to ours or to the reason it doesn't apply (details in [architecture.md](architecture.md#parity-with-the-replaced-library)). Upstream benchmarks are ported too, and every package is benchmarked against the library it replaces ([architecture.md](architecture.md#benchmarks)). It reaches 1.0 only when those tests and the oracle tests both pass and performance is comparable or better.
7. **Don't duplicate neighbors.** If Remix, noble, jose, fflate or another web-standard package already does it well, we point to it (§Not building).
8. **One umbrella package for discovery.** `portable` (unscoped, currently unclaimed on npm) re-exports every package as a subpath (`portable/lines`, `portable/mail`), exactly like `remix/headers`. Individual `@portable/*` packages stay the real units.

9. **`/node` entrypoints where Node genuinely helps (deferred; low priority, not in the first builds).** The main entry of every package is web-standard only. A package may add a `/node` subpath, exported under the `node` condition, when Node has something better or users need a bridge. It is the only code allowed to import `node:*` (oxlint override on `src/node/**`), it never changes the main API, and no other Portable package imports it. Current candidates:
   - `streams/node`: Node stream ⇄ web stream conversion (below).
   - `dns/node`: a resolver backed by `node:dns/promises`, so Node users skip DNS-over-HTTPS.
   - `png/node`: sync inflate/deflate via `node:zlib`, so Node users get a sync API without adding fflate.

## Layers, bottom up

Arrows show internal dependencies. Nothing depends upward.

```
L3  mailauth ─────────────────────────────────────────────┐
     ├ dmarc ── spf                                       │
     └ arc ──── dkim                                      │
L2  mail     dns      dkim     webhooks   oauth1          │
L1  json-stream   jsonl   mime-headers   mime-stream   image-size   exif   png
L0  streams   lines   base64   quoted-printable   charset   dns-packet
```

### L0: primitives (zero dependencies of any kind)

| Package | Purpose | Replaces (monthly downloads) |
| --- | --- | --- |
| `@portable/streams` | Stream plumbing. **Collect**: a stream into bytes, text, JSON or an array with a `maxBytes` guard. **Combine**: concatenate, merge, byte-limit. **Bridge** (see below): streams ⇄ iterables, async iterables and generators. | get-stream 900M, bl 360M, concat-stream 171M, raw-body (limit handling), merge2 / merge-stream, stream-to-array, it-to-stream |
| `@portable/lines` | Split byte or text streams into lines. Handles CRLF/LF/CR, a `maxLength` guard, and a trailing line with no newline. `new Lines.DecoderStream()`. | split2 406M, byline, readline (for streams) |
| `@portable/base64` | base64 and base64url, with optional line wrapping (MIME's 76 columns) and streaming encode/decode. Uses native `Uint8Array.fromBase64` when present. | libbase64 29M, base64-js, js-base64 |
| `@portable/quoted-printable` | Quoted-printable encode/decode with soft line breaks, as a function and as a stream. | libqp 30M, quoted-printable |
| `@portable/charset` | Encode text into legacy charsets (the half `TextDecoder` does not cover), with charset label normalization. One subpath per charset family so tables stay out of bundles that don't use them. | iconv-lite 1.29B (encode side) |
| `@portable/dns-packet` | DNS wire format encode/decode with dns-packet's record coverage. | dns-packet 79M |
| `@portable/bytes` | `toHex`/`fromHex` (native where present, strict parsing), `concat`, `equal` and `timingSafeEqual`. Other packages use it instead of private copies. | uint8array-extras (these functions), hand-written hex and compare loops |
| `@portable/random` | Unbiased `int`, `float`, `string` from an alphabet, `shuffle` and `pick` over `crypto.getRandomValues`, and `seeded(seed)` with the same API for tests. | random-int, crypto-random-string, seedrandom, nanoid's `customAlphabet` |
| `@portable/timers` | `sleep`, `retry` with backoff and jitter, and `poll` until a value appears, all cancellable with `AbortSignal`. Timeouts use `AbortSignal.timeout` and `AbortSignal.any`. | p-retry, async-retry, delay, p-wait-for |

#### `streams` bridge API

The platform has half of this, unevenly: `ReadableStream.from()` and `for await (const chunk of stream)` are not in every target browser yet, and neither handles cleanup the way people expect. The bridge fills that in with native fast paths where they exist:

| Function | Does |
| --- | --- |
| `fromIterable(iterable)` | `ReadableStream` from any `Iterable` or `AsyncIterable` (arrays, generators, async generators). Pull-based, so it respects backpressure; cancelling the stream calls the iterator's `return()` so `finally` blocks in generators run. |
| `toAsyncIterable(stream)` | Async iterator over a `ReadableStream`. Breaking out of `for await` cancels the stream (or, with `{ preventCancel: true }`, just releases the lock). |
| `transform(async function* (source) { ... })` | Build a `TransformStream` from an async generator that reads `source` and `yield`s output, which is the easiest way to write a stateful transform. Errors and cancellation propagate both ways. |
| `map`, `filter`, `tap`, `batch(n)` | Small `TransformStream` factories for the through2 cases. |
| `toArray`, `toBytes`, `toText`, `toJson` | Collectors, which accept a stream or any async iterable. |

**Node interop (deferred, low priority)** will live in one quarantined subpath, `@portable/streams/node`, the same way ox ships `ox/node`. It is the only place in the repo allowed to import `node:*` (an oxlint override scoped to `src/node/**`), it is exported under the `node` condition only, and nothing else in the family imports it:

| Function | Does |
| --- | --- |
| `toWeb(readable)` / `fromWeb(stream)` | Node `Readable` ⇄ `ReadableStream<Uint8Array>`, built on `Readable.toWeb` / `Readable.fromWeb` but fixing their gaps: `Buffer` and string chunks normalized to plain `Uint8Array`, object mode handled, errors and destroy/cancel propagated both ways. |
| `toWebWritable(writable)` / `fromWebWritable(stream)` | Node `Writable` ⇄ `WritableStream`. |
| `toWebTransform(duplex)` / `fromWebTransform(transform)` | Node `Transform`/`Duplex` ⇄ `TransformStream`, so an existing through2-style transform can be dropped into `pipeThrough`. |
| `pipeToNodeResponse(stream, res)` | Write a web stream into an `http.ServerResponse` with backpressure, for people mid-migration. |

The portable half needs no special support: a Node `Readable` is already an async iterable, so `fromIterable(nodeReadable)` works everywhere.

```ts
import { fromIterable, transform, toText } from '@portable/streams'

async function* rows() { yield 'a'; yield 'b' }

const upper = transform(async function* (source) {
  for await (const chunk of source) yield chunk.toUpperCase()
})

await toText(fromIterable(rows()).pipeThrough(upper)) // 'AB'
```

### L1: formats (built on L0)

| Package | Purpose | Depends on | Replaces |
| --- | --- | --- | --- |
| `@portable/json-stream` | Streaming JSON: a streaming parser that emits values at selected paths from one large JSON document, and an async `stringify` that walks an object tree containing promises, async iterables, streams or thunks, writing JSON as far as it can and pausing at each unresolved value, for output any JSON parser can read. For typed, out-of-order streaming, use turbo-stream (§Not building). | (none) | JSONStream 53M, stream-json 45M, json-stream-stringify, @worker-tools/json-stream |
| `@portable/sse` | Server-sent events: `DecoderStream` and `EncoderStream`, and `connect(request)`, a reconnecting client that returns a stream and accepts any `Request` (POST, headers). | `lines`, `timers` | eventsource-parser, eventsource, @microsoft/fetch-event-source |
| `@portable/csv` | RFC 4180 CSV and TSV decode and encode, as functions and as `DecoderStream`/`EncoderStream`, with a `maxLength` guard. | (none) | csv-parse, csv-stringify, papaparse, fast-csv |
| `@portable/compress` | One-shot gzip, deflate and deflate-raw on `CompressionStream`, a `maxLength` cap on decompression against zip bombs, larger output chunks than `DecompressionStream`'s 4 KB, and `crc32`. | `streams` | pako and fflate (simple one-shot use), node:zlib's sync helpers |
| `@portable/idna` | UTS #46 `toUnicode` and `toAscii` for domain names. The platform's `URL` only converts to ASCII. | (none) | punycode, tr46 |
| `@portable/jsonl` | JSON Lines (NDJSON) decode and encode streams: `new Jsonl.DecoderStream()` parses one value per line, and `new Jsonl.EncoderStream()` writes one per line. | (none) | ndjson 10.5M, the `jsonl` modules of stream-json |
| `@portable/mime-headers` | Email header values: fold/unfold (RFC 5322), encoded-words (RFC 2047), parameter encoding (RFC 2231), address list parse/format. | `base64`, `quoted-printable`; `charset` as optional peer | libmime 37M, addressparser, email-addresses |
| `@portable/mime-stream` | Walk a MIME message as a stream of parts (headers + body chunks) and write it back out, for in-flight transforms such as stripping attachments or hashing bodies. Full parsing to objects stays with postal-mime. | `lines`, `mime-headers` | mailsplit 2.7M |
| `@portable/image-size` | Image type and dimensions from header bytes or a stream, reading only what it needs. | (none) | image-size 133M |
| `@portable/exif` | EXIF/TIFF metadata from JPEG, TIFF, HEIC and WebP. | (none) | exif-parser 17M |
| `@portable/png` | PNG decode/encode to RGBA, deflate via `CompressionStream` by default or a passed-in `{ inflate, deflate }` for sync use. | (none) | pngjs 283M |

### L2: purposes

| Package | Purpose | Depends on | Replaces / fills |
| --- | --- | --- | --- |
| `@portable/mail` | Compose a raw RFC 5322 message as a `ReadableStream`: text/html alternatives, attachments, inline images, custom headers. No transport. | `mime-headers`, `base64`, `quoted-printable`, `streams` | nodemailer's MailComposer |
| `@portable/dns` | DNS lookups where there is no DNS: `resolveTxt`, `resolveMx` and friends over DNS-over-HTTPS, behind a resolver interface `node:dns/promises` also fits. | `dns-packet` | node:dns on Workers and browsers |
| `@portable/dkim` | DKIM sign and verify, with streaming body hashes. Keys via WebCrypto (RSA) or noble (ed25519); DNS via an injected resolver. | `mime-headers`, `mime-stream`, `base64`; crypto peer | DKIM in mailauth, nodemailer |
| `@portable/webhooks` | Verify signed webhooks: Standard Webhooks plus Stripe, GitHub, Slack and Svix schemes, with timing-safe compare and replay window. | `base64`; crypto peer | per-provider SDK verifiers |
| `@portable/oauth1` | OAuth 1.0a request signing (HMAC-SHA1, RSA-SHA1, PLAINTEXT) producing `Headers` or a signed `Request`. | `base64`; crypto peer | oauth-1.0a, oauth |

### L3: suites

| Package | Purpose | Depends on |
| --- | --- | --- |
| `@portable/spf` | Evaluate SPF for a sender IP and domain, with RFC 7208 lookup limits. | `dns` |
| `@portable/dmarc` | Resolve and evaluate DMARC policy and alignment from SPF and DKIM results. Organizational domain via a passed-in public-suffix function (tldts fits). | `dns`, `spf`, `dkim` |
| `@portable/arc` | ARC seal and verify. | `dkim` |
| `@portable/mailauth` | One `authenticate(message, { resolver, ip, helo, sender })` returning SPF, DKIM, DMARC, ARC and BIMI results in mailauth's shape. This is the motivating gap: mailauth (3.5M) is the only complete implementation and it is Node-only. | all of the above |

## Later, once the core is proven

| Package | Purpose | Notes |
| --- | --- | --- |
| `@portable/xml-c14n` → `@portable/xml-dsig` → `@portable/saml` | XML canonicalization, XML signatures, then SAML assertions | replaces xml-crypto 21M; biggest effort, needs a careful XML parser choice |
| `@portable/google-auth` | Service-account access tokens | possibly just a documented `jose` recipe; build only if the recipe proves too fiddly |
| `@portable/xlsx` | Streaming xlsx writer | replaces exceljs 72M for the write path; zips with fflate as a peer |

## Not building (point to these instead)

Everything in Kevin's original list (jose, noble, fflate, modern-tar, multitars, aws4fetch, otpauth, cbor-x, @msgpack/msgpack, postal-mime), plus what Remix v3 already covers, which drops two packages from revision 1:

| Need | Use | Effect on our list |
| --- | --- | --- |
| content-disposition (651M) parse/format with RFC 8187 `filename*` | `@remix-run/headers` (`ContentDisposition`) | `@portable/content-disposition` dropped |
| cookie-signature (587M) sign/unsign | `@remix-run/cookie` (WebCrypto HMAC) | `@portable/cookie-signature` dropped |
| HTTP header parsing (Accept, Cache-Control, Range, If-None-Match, Vary, Set-Cookie) | `@remix-run/headers` | out of scope |
| MIME types by extension (mime, mime-types) | `@remix-run/mime` | out of scope |
| multipart/form-data (busboy) | `@remix-run/multipart-parser`, `@remix-run/form-data-parser` | out of scope |
| tar parsing | `@remix-run/tar-parser` or modern-tar | out of scope |
| Serialize objects with promises, Dates, Maps etc. and stream them, resolving out of order as promises settle | turbo-stream (Jacob Ebey, Remix; used by React Router's data loading) | not rebuilt; `json-stream`'s async `stringify` covers only the narrower case of plain, in-order JSON any parser can read |
| OAuth 2 clients (authorization code with PKCE, token refresh, discovery) | oauth4webapi, or arctic for provider presets | out of scope; both already use only web APIs and have no dependencies. `oauth1` stays, because OAuth 1.0a signs requests and shares no code with OAuth 2 |
| WebAuthn server verification (CBOR, COSE keys, authenticatorData) | `ox/webauthn` (`Registration.verify`, `Authentication.verify`), plus ox's `Cbor` and `CoseKey` | not built. ox verifies ES256 only, which every passkey provider supports. |
| etag (507M) | For files, `@remix-run/response` already sets ETags; for arbitrary bodies, an ETag is one `crypto.subtle.digest` call | not a package by rule 1; a README recipe instead |

## Build order

1. L0 in parallel: `lines`, `streams`, `base64`, `quoted-printable`, `dns-packet`, then `charset` (needs its table generator).
2. L1: `json-stream`, `mime-headers`, then `image-size`, `exif`, `png`.
3. L2: `mail` and `dns` first (pure composition of what exists), then `dkim`, `webhooks`, `oauth1`.
4. L3: `spf`, `dkim`-based `arc`, `dmarc`, then `mailauth`.
5. `mime-stream` lands just before `dkim` needs it.

The scaffold PR proves the pipeline with `lines` (the first package and a 406M replacement), instead of `content-disposition` from revision 1.

## Questions for Kevin

1. Claim `portable` (unscoped) on npm now for the umbrella package? It is currently unregistered.
2. Is dropping `content-disposition` and `cookie-signature` in favor of Remix's packages right, or do you want standalone versions with no Remix dependency?
3. Package names: `mime-headers` / `mime-stream`, or shorter `mail-headers` / `mail-stream`?
