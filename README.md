# Portable

Small npm packages that run unchanged in browsers, Cloudflare Workers, Deno, Bun and Node 24+. They use only web-standard APIs (Web Streams, `Uint8Array`, `TextEncoder`, `fetch`, `crypto.subtle`), are ESM-only, and have no runtime dependencies outside `@portable/*`. Each one replaces a popular Node-only library with a smaller API that does the same job.

Read [docs/packages.md](docs/packages.md) for what each package does and why it exists, [docs/architecture.md](docs/architecture.md) for how the repo is built and tested, and [AGENTS.md](AGENTS.md) for the rules contributors and agents follow.

## Packages

Nothing is published to npm yet. **Built** means the package is on `main` with its tests passing in Node and Chromium, every case from the replaced library's tests covered, and a benchmark against that library.

| Layer | Package | Replaces | Status |
| --- | --- | --- | --- |
| L0 | [`@portable/streams`](packages/streams) | get-stream, concat-stream, merge2, through2 | Built |
| L0 | [`@portable/lines`](packages/lines) | split2, byline | Built |
| L0 | [`@portable/base64`](packages/base64) | libbase64, base64-js | In progress |
| L0 | [`@portable/quoted-printable`](packages/quoted-printable) | libqp, quoted-printable | Built |
| L0 | `@portable/charset` | iconv-lite (encoding) | In progress |
| L0 | [`@portable/dns-packet`](packages/dns-packet) | dns-packet | Built |
| L1 | `@portable/json-stream` | JSONStream, stream-json, ndjson | In progress |
| L1 | `@portable/mime-headers` | libmime, addressparser, email-addresses | Planned |
| L1 | `@portable/mime-stream` | mailsplit | Planned |
| L1 | [`@portable/image-size`](packages/image-size) | image-size | Built |
| L1 | [`@portable/exif`](packages/exif) | exif-parser, exif-reader | Built |
| L1 | `@portable/png` | pngjs | In progress |
| L2 | `@portable/mail` | nodemailer's MailComposer | Planned |
| L2 | `@portable/dns` | `node:dns` over DNS-over-HTTPS | Planned |
| L2 | `@portable/dkim` | DKIM in mailauth and nodemailer | Planned |
| L2 | `@portable/webhooks` | per-provider webhook SDKs | Planned |
| L2 | `@portable/oauth1` | oauth-1.0a | Planned |
| L3 | `@portable/spf` | mailauth's SPF | Planned |
| L3 | `@portable/dmarc` | mailauth's DMARC | Planned |
| L3 | `@portable/arc` | mailauth's ARC | Planned |
| L3 | `@portable/mailauth` | mailauth | Planned |

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
