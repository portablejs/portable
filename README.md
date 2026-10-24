# <picture><source media="(prefers-color-scheme: dark)" srcset="assets/logo-dark.svg"><img src="assets/logo-light.svg" alt="" style="height: 1cap"></picture>&nbsp; Portable

Small npm packages that run unchanged in browsers, Cloudflare Workers, Deno, Bun and Node 24+.

```ts
import * as Compress from '@portable/compress'
import * as Csv from '@portable/csv'
import * as Streams from '@portable/streams'

const response = await fetch('https://example.com/orders.csv.gz')
const orders = await Streams.toArray(
  response
    .body!.pipeThrough(new Compress.DecoderStream({ maxBytes: 100_000_000 }))
    .pipeThrough(new Csv.DecoderStream({ header: true }))
    .pipeThrough(Streams.filter((order) => order.status === 'paid')),
)
```

This code runs unchanged in a browser, a Cloudflare Worker, Deno, Bun and Node. It needs no polyfills, no bundler aliases and no `nodejs_compat` flag.

Most npm packages for streams, encodings, email and crypto were written for Node. They import `node:stream`, `node:crypto` or `Buffer`, so a browser bundle needs polyfills and a Cloudflare Worker needs the `nodejs_compat` flag. Portable packages use only the APIs that every runtime has: `fetch`, Web Streams, `Uint8Array`, `TextEncoder` and `crypto.subtle`.

- **Only web APIs.** Lint rejects `node:*` imports, `Buffer`, `process` and DOM globals in package code. The tests run in Node 24 and 26, in Chromium, Firefox and WebKit, and again inside a Web Worker.
- **No outside dependencies.** A package depends only on other `@portable/*` packages. Crypto uses WebCrypto by default, and you can pass a function from `@noble/hashes` or another library instead.
- **Tested against the library it replaces.** Each package's `PARITY.md` maps every test of that library to our test for the same case, or says why the case doesn't apply. Oracle tests compare our output with the library's output.
- **Benchmarked.** Each package README has a table that compares its speed, bundle size and dependency count with the libraries it replaces.
- **One API shape.** You import a package as a namespace (`import * as Base64`), call `encode` and `decode` or `parse` and `format`, pipe through a `DecoderStream` or `EncoderStream`, and pass a `signal` to anything that can be cancelled.

## Packages

Nothing is published to npm yet. `pnpm readme` runs the benchmarks, measures bundle sizes, and rewrites the tables in each package README with the new numbers.

### Streams and bytes

| Package | What it does | Replaces |
| --- | --- | --- |
| [`@portable/streams`](packages/streams) | Collects, combines and transforms web streams and iterables. | get-stream, concat-stream, bl, stream-to-array, merge2, merge-stream, through2 |
| [`@portable/lines`](packages/lines) | Splits a stream of bytes or text into lines. | split2, byline |
| [`@portable/bytes`](packages/bytes) | Hex encoding, concatenation and constant-time comparison of `Uint8Array`s. | uint8array-extras, `crypto.timingSafeEqual` |
| [`@portable/compress`](packages/compress) | gzip and deflate on the platform's `CompressionStream`, a decompression stream with an output limit, and CRC-32. | pako, fflate, the one-shot functions of `node:zlib` |

### Encodings

| Package | What it does | Replaces |
| --- | --- | --- |
| [`@portable/base64`](packages/base64) | base64 and base64url, with MIME line wrapping and streams. | libbase64, base64-js, js-base64 |
| [`@portable/quoted-printable`](packages/quoted-printable) | Quoted-printable encoding and decoding, as functions and streams. | libqp, quoted-printable |
| [`@portable/charset`](packages/charset) | Encodes text into legacy charsets such as Shift_JIS, GBK, Big5 and windows-1251. | the encoding half of iconv-lite |
| [`@portable/idna`](packages/idna) | Converts domain names between Unicode and ASCII by UTS #46. | punycode, tr46 |

### Data formats

| Package | What it does | Replaces |
| --- | --- | --- |
| [`@portable/csv`](packages/csv) | Decodes and encodes CSV, as functions and streams. | csv-parse, csv-stringify, papaparse, fast-csv |
| [`@portable/jsonl`](packages/jsonl) | Decodes and encodes JSON Lines streams. | ndjson, the `jsonl` modules of stream-json |
| [`@portable/json-stream`](packages/json-stream) | Selects values from a large JSON document by JSONPath, and writes JSON from a tree of promises and streams. | JSONStream, stream-json, json-stream-stringify |

### Email

| Package | What it does | Replaces |
| --- | --- | --- |
| [`@portable/mail`](packages/mail) | Builds a raw email message, with attachments and inline images, as a stream. | nodemailer's `MailComposer` |
| [`@portable/mime-headers`](packages/mime-headers) | Encoded words, folding, parameters and address lists in email headers. | libmime, addressparser, email-addresses |
| [`@portable/mime-stream`](packages/mime-stream) | Splits a MIME message into a stream of headers and bodies and writes it back byte for byte. | mailsplit |
| [`@portable/smtp`](packages/smtp) | Sends email over SMTP or LMTP from any runtime with a TCP socket API. | nodemailer's SMTP transport |
| [`@portable/dkim`](packages/dkim) | Signs and verifies DKIM signatures. | the DKIM code of mailauth and nodemailer |
| [`@portable/spf`](packages/spf) | Checks whether a client may send mail for a domain, using SPF. | mailauth's SPF module |
| [`@portable/dmarc`](packages/dmarc) | Checks a message against the DMARC policy of its From domain. | mailauth's DMARC module |
| [`@portable/arc`](packages/arc) | Seals and verifies ARC sets. | mailauth's ARC module |
| [`@portable/mail-auth`](packages/mail-auth) | Checks a received message's SPF, DKIM, DMARC and ARC in one call and writes the Authentication-Results header. | mailauth's `authenticate` |

### DNS and networking

| Package | What it does | Replaces |
| --- | --- | --- |
| [`@portable/dns`](packages/dns) | DNS lookups over DNS-over-HTTPS, with the results and errors of `node:dns/promises`. | tangerine, dohjs, `node:dns/promises` where it doesn't exist |
| [`@portable/dns-packet`](packages/dns-packet) | Encodes and decodes DNS messages in wire format. | dns-packet |
| [`@portable/ip`](packages/ip) | Parses, formats, compares and classifies IPv4 and IPv6 addresses and CIDR blocks. | ip, ipaddr.js, is-ip, ip-cidr, cidr-tools, ip-range-check |
| [`@portable/rdap`](packages/rdap) | Looks up who holds a domain name, an IP address or an AS number over RDAP. | whoiser, whois-json, node-rdap |

### Crypto and auth

| Package | What it does | Replaces |
| --- | --- | --- |
| [`@portable/crypto`](packages/crypto) | Bytes-in, bytes-out helpers over `crypto.subtle`, such as HKDF, Ed25519 keys from seeds and ECDSA signature conversion. | ecdsa-sig-formatter, hand-written WebCrypto wrappers |
| [`@portable/password`](packages/password) | Hashes and verifies passwords with PBKDF2 on WebCrypto. | the PBKDF2 calls of `node:crypto`, pbkdf2, pbkdf2-password |
| [`@portable/webhooks`](packages/webhooks) | Verifies and signs webhooks from Standard Webhooks senders, Stripe, GitHub, Slack and other HMAC-SHA256 senders. | standardwebhooks, svix's `Webhook`, stripe's `constructEvent`, @octokit/webhooks-methods, @slack/bolt's request verification |
| [`@portable/oauth1`](packages/oauth1) | Signs OAuth 1.0a requests. | oauth-1.0a, oauth |
| [`@portable/random`](packages/random) | Unbiased random integers, strings, shuffles and bytes, and a seeded generator for tests. | random-int, crypto-random-string, nanoid's `customAlphabet`, seedrandom, lodash's `random`, `sample` and `shuffle` |

### Realtime

| Package | What it does | Replaces |
| --- | --- | --- |
| [`@portable/websocket`](packages/websocket) | A WebSocket that reconnects, read and written as streams. | reconnecting-websocket, partysocket, websocket-ts |
| [`@portable/sse`](packages/sse) | Reads, writes and reconnects server-sent event streams. | eventsource-parser, the eventsource polyfill, @microsoft/fetch-event-source, the event writers of better-sse |
| [`@portable/rpc`](packages/rpc) | Typed JSON-RPC 2.0 calls between workers, windows, servers and browsers. | comlink, penpal, post-me, birpc, json-rpc-2.0 |
| [`@portable/web-push`](packages/web-push) | Sends Web Push notifications with payload encryption and VAPID. | web-push |

### Images

| Package | What it does | Replaces |
| --- | --- | --- |
| [`@portable/image-size`](packages/image-size) | Reads an image's type and dimensions from its header, from bytes or a stream. | image-size |
| [`@portable/exif`](packages/exif) | Reads EXIF metadata from JPEG, TIFF, PNG, WebP, HEIC and AVIF files, and removes it. | exif-parser, exif-reader |
| [`@portable/png`](packages/png) | Decodes PNG files to RGBA pixels and encodes pixels as PNG. | pngjs |

### Concurrency and timing

| Package | What it does | Replaces |
| --- | --- | --- |
| [`@portable/queue`](packages/queue) | Limits how many async tasks run at once, with priorities and cancellation. | p-limit, p-queue, p-map, p-throttle |
| [`@portable/timers`](packages/timers) | Sleep, retry, poll, debounce and throttle, all cancellable with an `AbortSignal`. | delay, p-retry, async-retry, p-wait-for, lodash.debounce, lodash.throttle, throttle-debounce, p-debounce |
| [`@portable/rate-limit`](packages/rate-limit) | Rate limiting per key with GCRA, in memory, Workers KV, a Durable Object or Redis over HTTP. | rate-limiter-flexible, limiter, bottleneck's reservoir |

Later candidates, such as XML signatures and SAML or an xlsx writer, are listed at the end of [docs/packages.md](docs/packages.md).

## Development

```sh
pnpm install
pnpm check        # format, lint and type-check
pnpm test         # Node and browser tests
pnpm bench        # benchmarks against the replaced libraries
```

Development needs Node 24 and pnpm 11. [docs/packages.md](docs/packages.md) says what each package does and why it exists, and [docs/architecture.md](docs/architecture.md) says how the repo is built and tested. [AGENTS.md](AGENTS.md#commands) lists every command and the rules that contributors and agents follow.

## License

MIT
