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
| Layer | Package | Replaces | Status |
| --- | --- | --- | --- |
| L0 | [`@portable/streams`](packages/streams) | get-stream, concat-stream, merge2, through2 | Built |
| L0 | [`@portable/lines`](packages/lines) | split2, byline | Built |
| L0 | [`@portable/base64`](packages/base64) | libbase64, base64-js, js-base64 | Built |
| L0 | [`@portable/quoted-printable`](packages/quoted-printable) | libqp, quoted-printable | Built |
| L0 | [`@portable/charset`](packages/charset) | iconv-lite (encoding) | Built |
| L0 | [`@portable/dns-packet`](packages/dns-packet) | dns-packet | Built |
| L0 | `@portable/bytes` | uint8array-extras | In progress |
| L0 | `@portable/random` | random-int, crypto-random-string, seedrandom | In progress |
| L0 | `@portable/ip` | ip, ipaddr.js, ip-cidr | In progress |
| L0 | `@portable/queue` | p-limit, p-queue, p-map | In progress |
| L0 | `@portable/password` | node:crypto pbkdf2 | In progress |
| L0 | `@portable/timers` | p-retry, async-retry, delay, p-wait-for | In progress |
| L1 | [`@portable/json-stream`](packages/json-stream) | JSONStream, stream-json, json-stream-stringify | Built |
| L1 | `@portable/websocket` | reconnecting-websocket, partysocket | In progress |
| L1 | `@portable/sse` | eventsource, eventsource-parser, @microsoft/fetch-event-source | In progress |
| L1 | `@portable/csv` | csv-parse, papaparse, fast-csv | In progress |
| L1 | `@portable/compress` | pako, fflate (one-shot use) | In progress |
| L1 | `@portable/idna` | punycode, tr46 | In progress |
| L1 | [`@portable/jsonl`](packages/jsonl) | ndjson, stream-json's `jsonl` | Built |
| L1 | `@portable/mime-headers` | libmime, addressparser, email-addresses | Built |
| L1 | `@portable/mime-stream` | mailsplit | In progress |
| L1 | [`@portable/image-size`](packages/image-size) | image-size | Built |
| L1 | [`@portable/exif`](packages/exif) | exif-parser, exif-reader | Built |
| L1 | [`@portable/png`](packages/png) | pngjs | Built |
| L2 | `@portable/mail` | nodemailer's MailComposer | In progress |
| L2 | `@portable/smtp` | nodemailer's SMTP transport | In progress |
| L2 | [`@portable/dns`](packages/dns) | `node:dns/promises` over DNS-over-HTTPS, tangerine | Built |
| L2 | `@portable/dkim` | DKIM in mailauth and nodemailer | In progress |
| L2 | [`@portable/webhooks`](packages/webhooks) | standardwebhooks, svix, Stripe and octokit verifiers | Built |
| L2 | [`@portable/oauth1`](packages/oauth1) | oauth-1.0a, oauth | Built |
| L3 | `@portable/spf` | mailauth's SPF | Built |
| L3 | `@portable/dmarc` | mailauth's DMARC | In progress |
| L3 | `@portable/arc` | mailauth's ARC | Planned |
| L3 | `@portable/mailauth` | mailauth | Planned |
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
