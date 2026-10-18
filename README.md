# <picture><source media="(prefers-color-scheme: dark)" srcset="assets/logo-dark.svg"><img src="assets/logo-light.svg" alt="" style="height: 1cap"></picture>&nbsp; Portable

Small npm packages that run unchanged in browsers, Cloudflare Workers, Deno, Bun and Node 24+. They use only web-standard APIs (Web Streams, `Uint8Array`, `TextEncoder`, `fetch`, `crypto.subtle`), are ESM-only, and have no runtime dependencies outside `@portable/*`. Each one replaces a popular Node-only library with a smaller API that does the same job.

Read [docs/packages.md](docs/packages.md) for what each package does and why it exists, [docs/architecture.md](docs/architecture.md) for how the repo is built and tested, and [AGENTS.md](AGENTS.md) for the rules contributors and agents follow.

## Packages

Nothing is published to npm yet. **Built** means the package is on `main` with its tests passing in Node and Chromium, every case from the replaced library's tests covered, and a benchmark against that library.

The numbers in the table come from `scripts/readme-stats.ts`. Run `pnpm readme` to measure them again and rewrite the table.

- **Speed** is the package's throughput divided by the replaced library's in one benchmark from `pnpm bench`, run in Node 24 against the built `dist/`. It changes from machine to machine. Where a benchmark also runs the package with `@noble/hashes` in place of its WebCrypto default, the cell shows both ratios.
- **Size** is the whole public API bundled for the browser with its dependencies, minified and gzipped, measured by `scripts/bundle-size.ts` with the same upstream versions the tests install. "Node only" marks a library that imports Node builtins or uses `Buffer`. Its size leaves those out, and a browser bundle would need polyfills for them.
- **Line and branch coverage** come from V8 coverage of each package's `src/` while the Node tests run (`pnpm coverage`). Coverage is measured in Node only, so code that runs only in browsers, such as base64's native `toBase64` path, counts as uncovered.
- **Upstream cases covered** counts the upstream tests in `test/PARITY.md` that map to one of our tests, out of every upstream test listed there. The n/a ones don't apply to this package, such as tests of Node stream internals.
- **Upstream bugs fixed** counts the rows under "Known upstream issues" in the same file.
- Packages that are planned or in progress show "–".

<!-- packages:start -->
| Layer | Package | Replaces | Status | Speed vs replaced library | Size, gzipped | Line coverage | Branch coverage | Upstream cases covered | Upstream bugs fixed |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| L0 | [`@portable/streams`](packages/streams) | get-stream, concat-stream, merge2, through2 | Built | 5.5× faster than get-stream (collect bytes) | 1.9 kB vs 2.1 kB (Node only) get-stream, 1.2 kB (Node only) merge2 | 100.0% | 97.2% | 127 of 152, 25 n/a | 12 |
| L0 | [`@portable/lines`](packages/lines) | split2, byline | Built | 0.9× the speed of split2 (split lines) | 0.6 kB vs 1.1 kB (Node only) split2 | 100.0% | 100.0% | 26 of 37, 11 n/a | 0 |
| L0 | [`@portable/base64`](packages/base64) | libbase64, base64-js, js-base64 | Built | as fast as base64-js (decode 1 MB) | 2.9 kB vs 1.8 kB (Node only) libbase64, 1.1 kB base64-js, 1.8 kB js-base64 | 97.7% | 95.6% | 57 of 71, 14 n/a | 17 |
| L0 | [`@portable/quoted-printable`](packages/quoted-printable) | libqp, quoted-printable | Built | 1.2× faster than libqp 3.0.1 (encode) | 2.1 kB vs 1.9 kB (Node only) libqp, 1.1 kB quoted-printable | 97.8% | 97.7% | 125 of 132, 7 n/a | 16 |
| L0 | [`@portable/charset`](packages/charset) | iconv-lite (encoding) | Built | as fast as iconv-lite (encode windows-1251) | 69 kB vs 153 kB (Node only) iconv-lite | 100.0% | 98.1% | 47 of 64, 17 n/a | 14 |
| L0 | [`@portable/dns-packet`](packages/dns-packet) | dns-packet | Built | 2.1× faster than dns-packet (decode) | 6.7 kB vs 8.7 kB (Node only) dns-packet | 98.6% | 94.4% | 31 of 31, 0 n/a | 17 |
| L0 | [`@portable/bytes`](packages/bytes) | uint8array-extras | Built | – | – | – | – | – | – |
| L0 | [`@portable/random`](packages/random) | random-int, crypto-random-string, seedrandom | Built | – | – | – | – | – | – |
| L0 | [`@portable/ip`](packages/ip) | ip, ipaddr.js, ip-cidr | Built | – | – | – | – | – | – |
| L0 | [`@portable/queue`](packages/queue) | p-limit, p-queue, p-map | Built | – | – | – | – | – | – |
| L0 | [`@portable/password`](packages/password) | node:crypto pbkdf2 | Built | – | – | – | – | – | – |
| L0 | [`@portable/timers`](packages/timers) | p-retry, async-retry, delay, p-wait-for | Built | – | – | – | – | – | – |
| L1 | [`@portable/json-stream`](packages/json-stream) | JSONStream, stream-json, json-stream-stringify | Built | 2.2× faster than JSONStream (parse) | 3.9 kB vs 3.9 kB (Node only) JSONStream, 2.9 kB (Node only) json-stream-stringify | 99.0% | 96.0% | 103 of 123, 20 n/a | 16 |
| L1 | [`@portable/websocket`](packages/websocket) | reconnecting-websocket, partysocket | Built | – | – | – | – | – | – |
| L1 | [`@portable/sse`](packages/sse) | eventsource, eventsource-parser, @microsoft/fetch-event-source | Built | – | – | – | – | – | – |
| L1 | [`@portable/csv`](packages/csv) | csv-parse, papaparse, fast-csv | Built | – | – | – | – | – | – |
| L1 | [`@portable/compress`](packages/compress) | pako, fflate (one-shot use) | Built | – | – | – | – | – | – |
| L1 | [`@portable/idna`](packages/idna) | punycode, tr46 | Built | – | – | – | – | – | – |
| L1 | [`@portable/jsonl`](packages/jsonl) | ndjson, stream-json's `jsonl` | Built | as fast as ndjson (decode) | 0.6 kB vs 13 kB (Node only) ndjson | 100.0% | 100.0% | 13 of 15, 2 n/a | 3 |
| L1 | [`@portable/mime-headers`](packages/mime-headers) | libmime, addressparser, email-addresses | Built | 1.9× faster than libmime 5.4.9 (decode encoded words) | 8.0 kB vs 258 kB (Node only) libmime, 2.6 kB addressparser, 3.1 kB email-addresses | 99.1% | 97.6% | 333 of 389, 56 n/a | 23 |
| L1 | [`@portable/mime-stream`](packages/mime-stream) | mailsplit | Built | – | – | – | – | – | – |
| L1 | [`@portable/image-size`](packages/image-size) | image-size | Built | 5.5× faster than image-size (PNG) | 4.7 kB vs 4.7 kB image-size | 97.6% | 91.6% | 24 of 33, 9 n/a | 17 |
| L1 | [`@portable/exif`](packages/exif) | exif-parser, exif-reader | Built | 3.7× faster than exif-parser (parse) | 7.9 kB vs 7.8 kB exif-parser, 4.7 kB exif-reader | 96.3% | 86.7% | 41 of 53, 12 n/a | 11 |
| L1 | [`@portable/png`](packages/png) | pngjs | Built | 0.8× the speed of pngjs (decode) | 4.3 kB vs 9.1 kB (Node only) pngjs | 99.3% | 92.5% | 18 of 19, 1 n/a | 10 |
| L2 | [`@portable/mail`](packages/mail) | nodemailer's MailComposer | Built | – | – | – | – | – | – |
| L2 | [`@portable/smtp`](packages/smtp) | nodemailer's SMTP transport | Built | – | – | – | – | – | – |
| L2 | [`@portable/dns`](packages/dns) | `node:dns/promises` over DNS-over-HTTPS, tangerine | Built | 1.2× faster than tangerine (resolveTxt) | 8.4 kB vs 563 kB (Node only) tangerine | 99.1% | 96.3% | 50 of 77, 27 n/a | 14 |
| L2 | [`@portable/dkim`](packages/dkim) | DKIM in mailauth and nodemailer | Built | – | – | – | – | – | – |
| L2 | [`@portable/webhooks`](packages/webhooks) | standardwebhooks, svix, Stripe and octokit verifiers | Built | 0.6× default, 1.5× with noble vs standardwebhooks (verify) | 4.3 kB vs 4.6 kB (Node only) standardwebhooks, 20 kB (Node only) svix, 30 kB (Node only) stripe, 0.7 kB @octokit/webhooks-methods | 100.0% | 98.1% | 57 of 67, 10 n/a | 11 |
| L2 | [`@portable/oauth1`](packages/oauth1) | oauth-1.0a, oauth | Built | 0.4× default, 1.2× with noble vs oauth-1.0a (sign a GET) | 4.6 kB vs 1.7 kB oauth-1.0a, 5.2 kB (Node only) oauth | 100.0% | 96.1% | 47 of 65, 18 n/a | 23 |
| L3 | [`@portable/spf`](packages/spf) | mailauth's SPF | Built | 1.6× faster than mailauth (check) | 4.6 kB vs 442 kB (Node only) mailauth | 98.8% | 96.2% | 294 of 301, 7 n/a | 14 |
| L3 | [`@portable/dmarc`](packages/dmarc) | mailauth's DMARC | Built | – | – | – | – | – | – |
| L3 | `@portable/arc` | mailauth's ARC | Planned | – | – | – | – | – | – |
| L3 | `@portable/mailauth` | mailauth | Planned | – | – | – | – | – | – |
| L0 | [`@portable/crypto`](packages/crypto) | hand-written WebCrypto helpers | Built | not measured | not measured | – | – | 12 of 18, 6 n/a | 6 |
| L1 | [`@portable/rate-limit`](packages/rate-limit) | rate-limiter-flexible, limiter | Built | not measured | not measured | – | – | 39 of 59, 20 n/a | 6 |
| L2 | [`@portable/web-push`](packages/web-push) | web-push | Built | not measured | not measured | – | – | 49 of 58, 9 n/a | 13 |
| L2 | [`@portable/rdap`](packages/rdap) | whoiser, whois-json, node-rdap | Built | not measured | not measured | – | – | 77 of 90, 13 n/a | 11 |
| L1 | [`@portable/rpc`](packages/rpc) | comlink, penpal, birpc, json-rpc-2.0, tRPC (simple cases) | Built | – | – | – | – | – | – |
<!-- packages:end -->

Each layer depends only on the layers below it. Later candidates (XML signatures and SAML, an xlsx writer) are listed at the end of [docs/packages.md](docs/packages.md).

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
