# Portable: package philosophy and list

[architecture.md](architecture.md) covers how the repository is built and tested.

## Philosophy

The packages are small and each does one thing, like much of npm's most-used code. The project most like Portable is Remix v3 (`remix-run/remix`, about 50 packages, most with no outside dependencies, layered on each other and re-exported by one `remix` package).

1. **One package per problem.** A package solves a problem a developer would name: "split a stream into lines", "compose an email", "verify DKIM". It is not one function (no `is-odd`) and it is not a grab bag. As a rough test, code under about 50 lines with no edge cases worth a test suite is an internal helper. If its README needs two unrelated "what it's for" headings, it is two packages.
2. **Compose upward.** A higher package builds on Portable packages in lower layers, and the dependency graph is a strict layer DAG (§Layers). Remix's `response` builds on `headers`, `mime`, and `html-template` this way, and our `mail` builds on `mime-headers`, `base64`, and `quoted-printable`.
3. **No dependencies outside the family.** The one exception is crypto: it defaults to WebCrypto and is pluggable, and a package that needs an incremental hash takes `@noble/hashes` as an optional peer.
4. **Web standards are the API.** Inputs and outputs are `Uint8Array`, `string`, `ReadableStream`, `Request`/`Response`, `Headers`, `Blob`/`File`. Streaming transforms are `TransformStream` subclasses used like the platform's own (`stream.pipeThrough(new Lines.DecoderStream())`, as with `TextDecoderStream` and Deno's `TextLineStream`). Where a platform type is close, extend it rather than invent one, as Remix's `SuperHeaders extends Headers` does.
5. **A small, stable API before 1.0.** Each package documents what it does not do. Its README lists the libraries it replaces, and its "Why use this over" section lists the differences that are easy to miss when switching from them.
6. **Same coverage as what we replace.** A package that replaces a popular library solves the same problem with its own API and implementation, and covers every case that library's tests cover, with a `PARITY.md` mapping each upstream test to ours or to the reason it doesn't apply (details in [architecture.md](architecture.md#parity-with-the-replaced-library)). We port upstream benchmarks too, and benchmark every package against the library it replaces ([architecture.md](architecture.md#benchmarks)). It reaches 1.0 only when those tests and the oracle tests both pass and performance is comparable or better.
7. **Don't rebuild existing web-standard packages.** If Remix, noble, jose, fflate, or another web-standard package already does it well, we point to it (§Not building).
8. **One umbrella package for discovery.** `portable` (unscoped, currently unclaimed on npm) re-exports every package as a subpath (`portable/lines`, `portable/mail`), exactly like `remix/headers`. We still publish and version each `@portable/*` package on its own.

9. **`/node` entrypoints where Node helps.** The main entry of every package is web-standard only. A package may add a `./node` subpath when Node has a better API, or to convert between Node and web types. It is the only code allowed to import `node:*` (an oxlint override on that package's `src/node/**`), it never changes the main API, and no other Portable package imports it. `streams/node` and `sockets/node` exist, and `streams/node` is described below. The other candidates:
   - `dns/node`: a resolver backed by `node:dns/promises`, so Node users skip DNS-over-HTTPS.
   - `png/node`: sync inflate/deflate via `node:zlib`, so Node users get a sync API without adding fflate.

## Layers, bottom up

Each line lists the `@portable/*` packages a package depends on, from its `package.json`. Nothing depends on a higher layer.

```
L3  mail-auth     → arc, dkim, dmarc, spf, mime-headers, timers
    arc           → dkim, base64, bytes, timers
    dmarc         → spf, dns, idna, timers
    spf           → dns, idna, ip, timers
L2  dkim          → dns, idna, web-crypto, base64, bytes, timers
    mail          → mime-headers, quoted-printable, idna, base64, bytes, timers
    dns           → dns-packet, idna, ip, base64
    oauth1, webhooks → web-crypto, base64, bytes, timers
    web-push      → base64, bytes, timers
    password      → base64, bytes, timers
    smtp          → base64, bytes, sockets
    rdap          → idna, ip, timers
L1  mime-stream   → mime-headers, bytes, streams
    mime-headers  → base64, bytes
    rpc           → jsonl
    sse           → timers, bytes, streams
    websockets    → timers, bytes
    dns-packet    → ip, bytes
    compress, image-size, png → bytes
    csv, exif, json-stream, jsonl → bytes, streams
    rate-limit    → timers
    idna
L0  base64, binary, charset, lines, quoted-printable → bytes, streams
    ip, sockets, streams, web-crypto → bytes
    bytes, log, queue, random, timers
    errors        (every package except dmarc, log, mail-auth, quoted-printable, random and rate-limit depends on it for its error classes or its dispose helpers)
```

### L0: primitives (no dependencies, apart from `bytes` and `streams`)

| Package | Purpose | Replaces (monthly downloads) |
| --- | --- | --- |
| `@portable/streams` | Stream plumbing. **Collect**: a stream into bytes, a `Blob`, text, JSON, or an array with a `maxBytes` guard. **Combine**: concatenate, merge, byte-limit. **Split**: `tee` into any number of branches, reading the source only as fast as the slowest branch. **Bridge** (see below): convert between streams and iterables, async iterables, or generators. **`abortable`**: makes a hand-written `Transformer` cancellable with an `AbortSignal`. Every stream transform in the family uses it. | get-stream 900M, bl 360M, concat-stream 171M, stream-to-array, merge2, merge-stream, through2, raw-body (limit handling) |
| `@portable/lines` | Split byte or text streams into lines. Handles CRLF/LF/CR, a `maxLength` guard, and a trailing line with no newline. `new Lines.DecoderStream()`. | split2 406M, byline |
| `@portable/binary` | A `Reader` and a `Writer` for binary protocols: integers of 1 to 8 bytes in either byte order, floats, varints (LEB128, zigzag, and SLEB128, as numbers or bigints), UTF-8 and null-terminated strings, with offsets you can move back to fill in a length. `FrameDecoderStream` and `FrameEncoderStream` split a byte stream into length-prefixed frames, with a `maxBytes` guard. | smart-buffer, varint, length-prefixed-stream, it-length-prefixed, hand-written `DataView` code |
| `@portable/base64` | base64 and base64url, with optional line wrapping (MIME's 76 columns) and streaming encode/decode. Uses native `Uint8Array.fromBase64` when present. | libbase64 29M, base64-js, js-base64 |
| `@portable/quoted-printable` | Quoted-printable encode/decode with soft line breaks, as a function and as a stream. | libqp 30M, quoted-printable |
| `@portable/charset` | Encode text into legacy charsets (the half `TextDecoder` does not cover), with charset label normalization. One subpath per charset family so tables stay out of bundles that don't use them. | iconv-lite 1.29B (encode side) |
| `@portable/bytes` | `toHex`/`fromHex` (native where present, strict parsing), `concat`, `equal`, and `timingSafeEqual`. Other packages use it instead of private copies. | uint8array-extras (these functions), `crypto.timingSafeEqual` from `node:crypto` |
| `@portable/random` | Unbiased `int`, `float`, `string` from an alphabet, `shuffle`, and `pick` over `crypto.getRandomValues`, and `seeded(seed)` with the same API for tests. | random-int, crypto-random-string, nanoid's `customAlphabet`, seedrandom, lodash's `random`, `sample`, and `shuffle` |
| `@portable/ip` | IPv4 and IPv6 parse and format (strict about leading zeros), CIDR matching, special-purpose range classification, and reverse-DNS names. `spf`, `dns`, and `dns-packet` use it. | ip, ipaddr.js, is-ip, ip-cidr, cidr-tools, ip-range-check |
| `@portable/log` | Namespaced logging with `debug`, `info`, `warn`, and `error` levels, turned on with debug's `DEBUG` patterns from an environment variable or `localStorage`. A change to `localStorage.debug` applies without a reload, and `subscribe` sends records to other outputs. | debug |
| `@portable/sockets` | The WinterTC Sockets API types `Sockets.Connect` and `Sockets.Socket`. Protocol clients such as smtp take a `connect` function of type `Sockets.Connect`, so you can pass `connect` from `cloudflare:sockets` unchanged. `@portable/sockets/node` has a `connect` for Node, Bun, and Deno, built on `node:net`, and `node:tls`, that verifies certificates and sends SNI for `startTls()`. | @arrowood.dev/socket |
| `@portable/queue` | In-memory concurrency control: a queue with `concurrency`, a rate limit (`interval`, `intervalCap`) and pause/resume, `limit`, `map`, and `once`, cancellable with `AbortSignal`. | p-limit, p-queue, p-map, p-throttle |
| `@portable/web-crypto` | Helpers over `crypto.subtle` that take and return `Uint8Array`: `digest`, `hmac`, `hkdf`, keys from 32-byte seeds for Ed25519 and X25519, `publicKeyOf`, keys from PEM text with `importPem`, and ECDSA signatures between DER and raw `r \|\| s`. | ecdsa-sig-formatter, hand-written WebCrypto wrappers |
| `@portable/errors` | The error classes that every package's errors extend, and `Errors.is`, which matches an error's kind across two copies of a package. Its `./internal` entry holds the dispose helpers for long-lived objects. | none (shared by the family) |
| `@portable/timers` | `sleep`, `retry` with backoff and jitter, `poll` until a value appears, and `debounce` and `throttle`, all cancellable with `AbortSignal`. `backoff` turns a `Delay` into wait times for websockets and sse. | delay, p-retry, async-retry, p-wait-for, lodash.debounce, lodash.throttle, throttle-debounce, p-debounce |

#### `streams` bridge API

`ReadableStream.from()` and `for await (const chunk of stream)` are not in every target browser yet. The bridge works without them and uses the native functions where they exist:

| Function | Does |
| --- | --- |
| `fromIterable(iterable)` | `ReadableStream` from any `Iterable` or `AsyncIterable` (arrays, generators, async generators). Pull-based, so it respects backpressure; cancelling the stream calls the iterator's `return()` so `finally` blocks in generators run. |
| `toAsyncIterable(stream)` | Async iterator over a `ReadableStream`. Breaking out of `for await` cancels the stream (or, with `{ preventCancel: true }`, just releases the lock). |
| `transform(async function* (source) { ... })` | Build a `{ readable, writable }` pair for `pipeThrough` from an async generator that reads `source` and `yield`s output, which is the shortest way to write a stateful transform. Errors and cancellation propagate both ways. |
| `map`, `filter`, `tap`, `batch(n)` | Small `TransformStream` factories for the through2 cases. |
| `toArray`, `toBytes`, `toBlob`, `toText`, `toJson` | Collectors, which accept a stream or any async iterable. |

**Node interop** is in one subpath, `@portable/streams/node`, as ox ships `ox/node`. Its `src/node/**` is the only code in the package allowed to import `node:*`, and no other Portable package imports it. It's a plain `./node` export, without a `node` condition ([decision](decisions.md#portablestreamsnode-is-a-plain-subpath-export)). It has only the conversion that Node's built-ins lack ([decision](decisions.md#portablestreamsnode-has-only-towebs-two-functions)):

| Function | Does |
| --- | --- |
| `toWeb(readable)` / `toWebObjects(readable)` | Converts a Node `Readable` of bytes to a `ReadableStream<Uint8Array>`, or an object-mode one to a `ReadableStream<unknown>`. `Buffer` chunks become plain `Uint8Array`s, and strings from `setEncoding` are encoded back to their bytes. The `Readable` is read only when the stream is read. Errors, `destroy()`, and cancel propagate in both directions, and both take `signal`. |

For the other directions, `Readable.fromWeb`, `Writable.toWeb`, `Writable.fromWeb`, `Duplex.toWeb`, and `Duplex.fromWeb` in `node:stream` already work.

A Node `Readable` is already an async iterable, so `fromIterable(nodeReadable)` also works without the `./node` subpath.

```ts
import * as Streams from '@portable/streams';

async function* rows() {
  yield 'a';
  yield 'b';
}

const upper = Streams.transform(async function* (source: AsyncIterable<string>) {
  for await (const chunk of source) {
    yield chunk.toUpperCase();
  }
});

await Streams.toText(Streams.fromIterable(rows()).pipeThrough(upper)); // 'AB'
```

### L1: formats (built on L0)

| Package | Purpose | Depends on | Replaces |
| --- | --- | --- | --- |
| `@portable/json-stream` | Streaming JSON: a streaming parser that emits values at selected paths from one large JSON document, and `encodeStream`, which walks an object tree containing promises, async iterables, streams, or thunks, writing JSON as far as it can and pausing at each unresolved value, for output any JSON parser can read. For typed, out-of-order streaming, use turbo-stream (§Not building). | `bytes`, `streams` | JSONStream 53M, stream-json 45M, json-stream-stringify, @worker-tools/json-stream |
| `@portable/websockets` | A reconnecting WebSocket client as one `readable`/`writable` pair that spans reconnects, with an `open` hook for handshakes, a queue for writes made while disconnected, backpressure, and `fromSocket` for server-side sockets. | `bytes`, `timers` | reconnecting-websocket, partysocket, websocket-ts |
| `@portable/sse` | Server-sent events: `DecoderStream` and `EncoderStream`, and `connect(request)`, a reconnecting client that returns a stream and accepts any `Request` (POST, headers). | `bytes`, `streams`, `timers` | eventsource-parser, eventsource, @microsoft/fetch-event-source, the event writers in better-sse and hono |
| `@portable/csv` | RFC 4180 CSV and TSV decode and encode, as functions and as `DecoderStream`/`EncoderStream`, with a `maxLength` guard. | `bytes`, `streams` | csv-parse, csv-stringify, papaparse, fast-csv |
| `@portable/compress` | One-shot gzip, deflate, and deflate-raw on `CompressionStream`, a `maxBytes` cap on decompression against zip bombs, larger output chunks than `DecompressionStream`'s 4 KB, and `crc32`. | `bytes` | pako and fflate (one-shot use), node:zlib's sync helpers |
| `@portable/rpc` | Typed JSON-RPC 2.0 over `MessagePort`, windows, WebSocket, and HTTP, with streaming results. | `jsonl` | comlink, penpal, post-me, birpc, json-rpc-2.0, tRPC (simple cases) |
| `@portable/idna` | UTS #46 `toUnicode` and `toAscii` for domain names. The platform's `URL` only converts to ASCII. | (none) | punycode, tr46 |
| `@portable/jsonl` | JSON Lines (NDJSON) decode and encode streams: `new Jsonl.DecoderStream()` parses one value per line, and `new Jsonl.EncoderStream()` writes one per line. | `bytes`, `streams` | ndjson 10.5M, the `jsonl` modules of stream-json |
| `@portable/mime-headers` | Email header values: fold/unfold (RFC 5322), encoded-words (RFC 2047), parameter encoding (RFC 2231), address list parse/format. Other charsets come from a `charset` option, which accepts the `@portable/charset` encoders. | `base64`, `bytes` | libmime 37M, addressparser, email-addresses |
| `@portable/mime-stream` | Walk a MIME message as a stream of parts (headers + body chunks) and write it back out, for in-flight transforms such as stripping attachments or hashing bodies. Full parsing to objects stays with postal-mime. | `bytes`, `mime-headers`, `streams` | mailsplit 2.7M |
| `@portable/image-size` | Image type and dimensions from header bytes or a stream, reading only what it needs. | `bytes` | image-size 133M |
| `@portable/exif` | EXIF/TIFF metadata from JPEG, TIFF, PNG, WebP, HEIC, and AVIF, and stripping it from JPEG, PNG, and WebP. | `bytes`, `streams` | exif-parser 17M |
| `@portable/png` | PNG decode/encode to RGBA, deflate via `CompressionStream` by default or a passed-in `{ inflate, deflate }` for sync use. | `bytes` | pngjs 283M |
| `@portable/dns-packet` | DNS wire format encode/decode with dns-packet's record coverage. | `bytes`, `ip` | dns-packet 79M |
| `@portable/rate-limit` | Rate limiting with a pluggable async store (in-memory store included; recipes for KV, Durable Objects, and Upstash), plus the `RateLimit`, `RateLimit-Policy`, and `Retry-After` header fields. | `timers` | rate-limiter-flexible, limiter, bottleneck's reservoir options |

### L2: purposes

| Package | Purpose | Depends on | Replaces / fills |
| --- | --- | --- | --- |
| `@portable/mail` | Compose a raw RFC 5322 message as a `ReadableStream`: text/html alternatives, attachments, inline images, custom headers. No transport. | `base64`, `bytes`, `idna`, `mime-headers`, `quoted-printable`, `timers` | nodemailer's MailComposer |
| `@portable/smtp` | SMTP client (RFC 5321) over an injected socket in the WinterTC Sockets API shape, such as one from `cloudflare:sockets` or `@portable/sockets/node`: STARTTLS, AUTH, PIPELINING, streaming dot-stuffing, per-recipient results. | `base64`, `bytes`, `sockets` | nodemailer's SMTP transport, smtp-connection |
| `@portable/web-push` | Send Web Push messages with aes128gcm encryption (RFC 8291) and VAPID (RFC 8292) on WebCrypto and `fetch`. | `base64`, `bytes`, `timers` | web-push |
| `@portable/rdap` | RDAP lookups for domains, IPs, and ASNs with IANA bootstrap and normalized results. | `idna`, `ip`, `timers` | whoiser, whois-json, node-rdap |
| `@portable/dns` | DNS lookups in runtimes without a DNS API: `resolveTxt`, `resolveMx`, and the other `node:dns/promises` methods over DNS-over-HTTPS, behind a resolver interface that `node:dns/promises` also matches. | `base64`, `dns-packet`, `idna`, `ip` | node:dns/promises where it doesn't exist, tangerine, dohjs |
| `@portable/dkim` | DKIM sign and verify with RSA and Ed25519 keys on WebCrypto. The body hash uses `crypto.subtle.digest` by default, or an incremental hasher such as noble's `sha256.create()`. DNS goes through an injected resolver. | `base64`, `bytes`, `dns`, `idna`, `timers`, `web-crypto` | DKIM in mailauth, nodemailer's DKIM signer |
| `@portable/webhooks` | Verify and sign webhooks: Standard Webhooks plus Stripe, GitHub, and Slack schemes, or any HMAC-SHA256 sender, with timing-safe compare and a replay window. | `base64`, `bytes`, `timers`, `web-crypto` | standardwebhooks, svix's `Webhook`, Stripe's `constructEvent`, @octokit/webhooks-methods, @slack/bolt's request verification |
| `@portable/oauth1` | OAuth 1.0a request signing (HMAC-SHA1, HMAC-SHA256, RSA-SHA1, PLAINTEXT) producing `Headers` or a signed `Request`. | `base64`, `bytes`, `timers`, `web-crypto` | oauth-1.0a, oauth |
| `@portable/password` | Password `hash`, `verify`, and `needsRehash` with PBKDF2-SHA256 on WebCrypto, stored in the PHC string format. | `base64`, `bytes`, `timers` | node:crypto `pbkdf2`, pbkdf2, pbkdf2-password, hand-written hash formats |

### L3: suites

| Package | Purpose | Depends on | Replaces |
| --- | --- | --- | --- |
| `@portable/spf` | Evaluate SPF for a sender IP and domain, with RFC 7208 lookup limits. | `dns`, `idna`, `ip`, `timers` | mailauth's SPF module |
| `@portable/dmarc` | Resolve and evaluate DMARC policy and alignment from SPF and DKIM results. The organizational domain comes from a DNS tree walk (RFC 9989) by default, or from a passed-in public-suffix function such as tldts. | `dns`, `idna`, `spf`, `timers` | mailauth's DMARC module |
| `@portable/arc` | ARC seal and verify (RFC 8617), with RFC behavior only. Reuses dkim's canonicalization and signing through `@portable/dkim/internal`. | `base64`, `bytes`, `dkim`, `timers` | mailauth's ARC parts |
| `@portable/mail-auth` | One `authenticate(message, { resolver, ip, helo, sender, authservId })` that returns SPF, DKIM, DMARC, and ARC results, writes Authentication-Results, and can ARC-seal the message. No BIMI. This package is the reason for the project: mailauth (3.5M) is the only complete implementation, and it runs only in Node. | `arc`, `dkim`, `dmarc`, `mime-headers`, `spf`, `timers` | mailauth's `authenticate` |

## Later, once the core is proven

| Package | Purpose | Notes |
| --- | --- | --- |
| `@portable/xml-c14n` → `@portable/xml-dsig` → `@portable/saml` | XML canonicalization, XML signatures, then SAML assertions | replaces xml-crypto 21M; biggest effort, needs a careful XML parser choice. Skipped for now (2026-10-18). |
| `@portable/google-auth` | Service-account access tokens | possibly just a documented `jose` recipe; build only if the recipe proves too fiddly |
| `@portable/xlsx` | Streaming xlsx writer | replaces exceljs 72M for the write path; zips with fflate as a peer |
| Document formats (pdf, docx) | Read or write office documents | parked with xlsx until later (2026-10-18) |
| `@portable/http-signatures` | RFC 9421 HTTP Message Signatures and `Content-Digest` (RFC 9530) on WebCrypto | parked: most ActivityPub servers still use draft-cavage signatures, and Web Bot Auth is new. Revisit if RFC 9421 adoption grows. |
| Partial JSON | Snapshots of an incomplete JSON document as deltas arrive, such as streamed tool-call arguments | parked until there is a strong use case (2026-10-19) |

## Not building (point to these instead)

These libraries already run in every runtime with no Node dependencies: jose, noble, fflate, modern-tar, multitars, aws4fetch, otpauth, cbor-x, @msgpack/msgpack and postal-mime. Remix v3 also covers the needs below, so the list has no `content-disposition` or `cookie-signature` package:

| Need | Use | Effect on our list |
| --- | --- | --- |
| content-disposition (651M) parse/format with RFC 8187 `filename*` | `@remix-run/headers` (`ContentDisposition`) | `@portable/content-disposition` dropped |
| cookie-signature (587M) sign/unsign | `@remix-run/cookie` (WebCrypto HMAC) | `@portable/cookie-signature` dropped |
| HTTP header parsing (Accept, Cache-Control, Range, If-None-Match, Vary, Set-Cookie) | `@remix-run/headers` | out of scope |
| MIME types by extension (mime, mime-types) | `@remix-run/mime` | out of scope |
| multipart/form-data (busboy) | `@remix-run/multipart-parser`, `@remix-run/form-data-parser` | out of scope |
| tar parsing | `@remix-run/tar-parser` or modern-tar | out of scope |
| Serialize objects with promises, Dates, Maps etc. and stream them, resolving out of order as promises settle | turbo-stream (used by React Router's data loading) | not rebuilt; `JsonStream.encodeStream` covers only the narrower case of plain, in-order JSON any parser can read |
| OAuth 2 clients (authorization code with PKCE, token refresh, discovery) | oauth4webapi, or arctic for provider presets | out of scope; both already use only web APIs and have no dependencies. `oauth1` stays, because OAuth 1.0a signs requests and shares no code with OAuth 2 |
| WebAuthn server verification (CBOR, COSE keys, authenticatorData) | `ox/webauthn` (`Registration.verify`, `Authentication.verify`), plus ox's `Cbor` and `CoseKey` | not built. ox verifies ES256 only, which every passkey provider supports. |
| etag (507M) | For files, `@remix-run/response` already sets ETags; for arbitrary bodies, an ETag is one `crypto.subtle.digest` call | not a package by rule 1; a README recipe instead |

## Build order

1. L0 in parallel: `lines`, `streams`, `base64`, `quoted-printable`, `dns-packet`, then `charset` (needs its table generator).
2. L1: `json-stream`, `mime-headers`, then `image-size`, `exif`, `png`.
3. L2: `mail` and `dns` first (pure composition of what exists), then `dkim`, `webhooks`, `oauth1`.
4. L3: `spf`, `dkim`-based `arc`, `dmarc`, then `mail-auth`.
5. We build `mime-stream` just before `dkim` needs it.

We built `lines` first and used it to try out the build, test, and release setup.

## Open questions

1. Claim `portable` (unscoped) on npm now for the umbrella package? It is currently unregistered.
2. Should `content-disposition` and `cookie-signature` get standalone packages with no Remix dependency, instead of pointing to Remix's packages?
