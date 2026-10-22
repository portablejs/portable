# <picture><source media="(prefers-color-scheme: dark)" srcset="assets/logo-dark.svg"><img src="assets/logo-light.svg" alt="" style="height: 1cap"></picture>&nbsp; Portable

Small npm packages that run unchanged in browsers, Cloudflare Workers, Deno, Bun and Node 24+. They use only web-standard APIs (Web Streams, `Uint8Array`, `TextEncoder`, `fetch`, `crypto.subtle`), are ESM-only, and have no runtime dependencies outside `@portable/*`. Each one replaces a popular Node-only library with a smaller API that does the same job.

Read [docs/packages.md](docs/packages.md) for what each package does and why it exists, [docs/architecture.md](docs/architecture.md) for how the repo is built and tested, and [AGENTS.md](AGENTS.md) for the rules contributors and agents follow.

## Packages

Nothing is published to npm yet. Each package README has a table of benchmarks against the libraries it replaces and a table of bundle sizes and dependencies. Run `pnpm readme` to measure them again. Some packages fit more than one category, so they are listed under each.

### Streams and bytes

- [`@portable/streams`](packages/streams): collects, combines and transforms web streams and iterables. Replaces get-stream, concat-stream, bl, stream-to-array, merge2, merge-stream and through2.
- [`@portable/lines`](packages/lines): splits a stream of bytes or text into lines. Replaces split2 and byline.
- [`@portable/bytes`](packages/bytes): hex encoding, concatenation and constant-time comparison of `Uint8Array`s. Replaces uint8array-extras and `crypto.timingSafeEqual`.
- [`@portable/errors`](packages/errors): the error classes every package throws, with checks that work across duplicate package copies. Replaces hand-written error classes and `instanceof` checks.
- [`@portable/compress`](packages/compress): gzip and deflate on the platform's `CompressionStream`, a decompression stream with an output limit, and CRC-32. Replaces pako, fflate and the one-shot functions of `node:zlib`.

### Encodings

- [`@portable/base64`](packages/base64): base64 and base64url, with MIME line wrapping and streams. Replaces libbase64, base64-js and js-base64.
- [`@portable/quoted-printable`](packages/quoted-printable): quoted-printable encoding and decoding, as functions and streams. Replaces libqp and quoted-printable.
- [`@portable/charset`](packages/charset): encodes text into legacy charsets such as Shift_JIS, GBK, Big5 and windows-1251. Replaces the encoding half of iconv-lite.
- [`@portable/idna`](packages/idna): converts domain names between Unicode and ASCII by UTS #46. Replaces punycode and tr46.

### Text and data formats

- [`@portable/csv`](packages/csv): decodes and encodes CSV, as functions and streams. Replaces csv-parse, csv-stringify, papaparse and fast-csv.
- [`@portable/jsonl`](packages/jsonl): decodes and encodes JSON Lines streams. Replaces ndjson and the `jsonl` modules of stream-json.
- [`@portable/json-stream`](packages/json-stream): selects values from a large JSON document by JSONPath, and writes JSON from a tree of promises and streams. Replaces JSONStream, stream-json and json-stream-stringify.
- [`@portable/lines`](packages/lines): splits a stream of bytes or text into lines. Replaces split2 and byline.
- [`@portable/sse`](packages/sse): reads and writes server-sent event streams. Replaces eventsource-parser and the event writers of better-sse.

### Email

- [`@portable/mail`](packages/mail): builds a raw email message, with attachments and inline images, as a stream. Replaces nodemailer's `MailComposer`.
- [`@portable/mime-headers`](packages/mime-headers): encoded words, folding, parameters and address lists in email headers. Replaces libmime, addressparser and email-addresses.
- [`@portable/mime-stream`](packages/mime-stream): splits a MIME message into a stream of headers and bodies and writes it back byte for byte. Replaces mailsplit.
- [`@portable/smtp`](packages/smtp): sends email over SMTP or LMTP from any runtime with a TCP socket API. Replaces nodemailer's SMTP transport.
- [`@portable/dkim`](packages/dkim): signs and verifies DKIM signatures. Replaces the DKIM code of mailauth and nodemailer.
- [`@portable/spf`](packages/spf): checks whether a client may send mail for a domain, using SPF. Replaces mailauth's SPF module.
- [`@portable/dmarc`](packages/dmarc): checks a message against the DMARC policy of its From domain. Replaces mailauth's DMARC module.
- [`@portable/arc`](packages/arc): seals and verifies ARC sets. Replaces mailauth's ARC module.
- [`@portable/mail-auth`](packages/mail-auth): checks a received message's SPF, DKIM, DMARC and ARC in one call and writes the Authentication-Results header. Replaces mailauth's `authenticate`.
- [`@portable/quoted-printable`](packages/quoted-printable): quoted-printable encoding and decoding, as functions and streams. Replaces libqp and quoted-printable.
- [`@portable/charset`](packages/charset): encodes text into legacy charsets such as Shift_JIS, GBK, Big5 and windows-1251. Replaces the encoding half of iconv-lite.

### DNS and networking

- [`@portable/dns`](packages/dns): DNS lookups over DNS-over-HTTPS, with the results and errors of `node:dns/promises`. Replaces tangerine, dohjs and `node:dns/promises` where it doesn't exist.
- [`@portable/dns-packet`](packages/dns-packet): encodes and decodes DNS messages in wire format. Replaces dns-packet.
- [`@portable/ip`](packages/ip): parses, formats, compares and classifies IPv4 and IPv6 addresses and CIDR blocks. Replaces ip, ipaddr.js, is-ip, ip-cidr, cidr-tools and ip-range-check.
- [`@portable/rdap`](packages/rdap): looks up who holds a domain name, an IP address or an AS number over RDAP. Replaces whoiser, whois-json and node-rdap.
- [`@portable/idna`](packages/idna): converts domain names between Unicode and ASCII by UTS #46. Replaces punycode and tr46.

### Crypto and auth

- [`@portable/web-crypto`](packages/web-crypto): bytes-in, bytes-out helpers over `crypto.subtle`, such as HKDF, Ed25519 keys from seeds and ECDSA signature conversion. Replaces ecdsa-sig-formatter and hand-written WebCrypto wrappers.
- [`@portable/password`](packages/password): hashes and verifies passwords with PBKDF2 on WebCrypto. Replaces the PBKDF2 calls of `node:crypto`, pbkdf2 and pbkdf2-password.
- [`@portable/webhooks`](packages/webhooks): verifies and signs webhooks from Standard Webhooks senders, Stripe, GitHub, Slack and other HMAC-SHA256 senders. Replaces standardwebhooks, svix's `Webhook`, stripe's `constructEvent`, @octokit/webhooks-methods and @slack/bolt's request verification.
- [`@portable/oauth1`](packages/oauth1): signs OAuth 1.0a requests. Replaces oauth-1.0a and oauth.
- [`@portable/web-push`](packages/web-push): sends Web Push notifications with payload encryption and VAPID. Replaces web-push.
- [`@portable/random`](packages/random): unbiased random integers, strings, shuffles and bytes, and a seeded generator for tests. Replaces random-int, crypto-random-string, nanoid's `customAlphabet`, seedrandom and lodash's `random`, `sample` and `shuffle`.
- [`@portable/dkim`](packages/dkim): signs and verifies DKIM signatures. Replaces the DKIM code of mailauth and nodemailer.

### Realtime

- [`@portable/websockets`](packages/websockets): a WebSocket that reconnects, read and written as streams. Replaces reconnecting-websocket, partysocket and websocket-ts.
- [`@portable/sse`](packages/sse): reads, writes and reconnects server-sent event streams. Replaces eventsource-parser, the eventsource polyfill and @microsoft/fetch-event-source.
- [`@portable/rpc`](packages/rpc): typed JSON-RPC 2.0 calls between workers, windows, servers and browsers. Replaces comlink, penpal, post-me, birpc and json-rpc-2.0.
- [`@portable/web-push`](packages/web-push): sends Web Push notifications with payload encryption and VAPID. Replaces web-push.

### Images

- [`@portable/image-size`](packages/image-size): reads an image's type and dimensions from its header, from bytes or a stream. Replaces image-size.
- [`@portable/exif`](packages/exif): reads EXIF metadata from JPEG, TIFF, PNG, WebP, HEIC and AVIF files, and removes it. Replaces exif-parser and exif-reader.
- [`@portable/png`](packages/png): decodes PNG files to RGBA pixels and encodes pixels as PNG. Replaces pngjs.

### Concurrency and timing

- [`@portable/queue`](packages/queue): limits how many async tasks run at once, with priorities and cancellation. Replaces p-limit, p-queue, p-map and p-throttle.
- [`@portable/timers`](packages/timers): sleep, retry, poll, debounce and throttle, all cancellable with an `AbortSignal`. Replaces delay, p-retry, async-retry, p-wait-for, lodash.debounce, lodash.throttle, throttle-debounce and p-debounce.
- [`@portable/rate-limit`](packages/rate-limit): rate limiting per key with GCRA, in memory, Workers KV, a Durable Object or Redis over HTTP. Replaces rate-limiter-flexible, limiter and bottleneck's reservoir.

Later candidates, such as XML signatures and SAML or an xlsx writer, are listed at the end of [docs/packages.md](docs/packages.md).

## Development

```sh
pnpm install
pnpm check        # format, lint and type-check
pnpm test         # Node and browser tests
pnpm bench        # benchmarks against the replaced libraries
```

Requires Node 24 and pnpm 11. [AGENTS.md](AGENTS.md#commands) lists every command.

## License

MIT
