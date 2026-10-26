---
description: For each common task, the web API, Portable package, or other project's package to use so the same code runs in browsers, Cloudflare Workers, Node, Bun, and Deno.
---

# Web platform

The web platform is the set of APIs that browsers, Cloudflare Workers, Node 24+, Bun, and Deno all have, such as `fetch`, Web Streams, and `crypto.subtle`. On this page it also includes the packages built only on those APIs.

For each task that often needs a dependency in a library or server, the tables below give the web API or package that does it. We list a web API when every runtime has one. Otherwise we list another project's package if one already runs in every runtime, and a Portable package if none does. The last column lists packages and Node APIs that you no longer need.

Before we list another project's package, we check that its main entry point runs in Chromium; in workerd, the Cloudflare Workers runtime, without the `nodejs_compat` flag; and in Node, Bun, and Deno. If the package also has a subpath that imports `node:*` modules, the table or the note below it says so.

## Streams and bytes

| Task | Use | Instead of |
| --- | --- | --- |
| Read a stream into bytes, text, or JSON with a size limit | [`streams`](/packages/streams) | get-stream, concat-stream, raw-body |
| Merge, map, or filter streams, or convert a Node stream | [`streams`](/packages/streams) | merge2, through2, `Readable.toWeb` |
| Split a stream into lines | [`lines`](/packages/lines) | split2, byline |
| Read and write binary protocols and length-prefixed frames | [`binary`](/packages/binary) | smart-buffer, varint, it-length-prefixed |
| Convert bytes to and from hex, join them, or compare them in constant time | [`bytes`](/packages/bytes) | `Buffer`, uint8array-extras, `crypto.timingSafeEqual` |
| gzip or deflate bytes | [`compress`](/packages/compress), on the platform's `CompressionStream` | pako, `node:zlib` |
| Read or write zip files, or compress synchronously | [fflate](https://www.npmjs.com/package/fflate) | jszip, adm-zip |
| Read or write tar archives | [modern-tar](https://www.npmjs.com/package/modern-tar) (its `modern-tar/fs` subpath uses `node:fs`), [`@remix-run/tar-parser`](https://www.npmjs.com/package/@remix-run/tar-parser), or [multitars](https://www.npmjs.com/package/multitars) | tar, tar-stream |

## Encodings and text

| Task | Use | Instead of |
| --- | --- | --- |
| base64 and base64url | [`base64`](/packages/base64) | `Buffer`, base64-js, js-base64 |
| Quoted-printable | [`quoted-printable`](/packages/quoted-printable) | libqp, quoted-printable |
| Decode text in a legacy charset | `TextDecoder` | iconv-lite |
| Encode text into a legacy charset such as Shift_JIS | [`charset`](/packages/charset) | iconv-lite |
| Convert domain names to and from Punycode | [`idna`](/packages/idna) | punycode, `node:punycode`, tr46 |

## Data formats

| Task | Use | Instead of |
| --- | --- | --- |
| CSV | [`csv`](/packages/csv) | csv-parse, csv-stringify, papaparse |
| JSON Lines | [`jsonl`](/packages/jsonl) | ndjson |
| Read values from a large JSON stream, or write JSON as a stream | [`json-stream`](/packages/json-stream) | JSONStream, stream-json |
| Stream values that hold promises, `Date`, `Map`, and `Set` | [turbo-stream](https://www.npmjs.com/package/turbo-stream) | superjson |
| CBOR | [cbor-x](https://www.npmjs.com/package/cbor-x) | cbor |
| MessagePack | [`@msgpack/msgpack`](https://www.npmjs.com/package/@msgpack/msgpack) | msgpack-lite |
| Read an image's type and size | [`image-size`](/packages/image-size) | image-size |
| Read or strip EXIF metadata | [`exif`](/packages/exif) | exif-parser |
| Decode and encode PNG pixels | [`png`](/packages/png) | pngjs |

## HTTP servers and requests

The `@remix-run/*` packages come from Remix 3. The `remix` package also re-exports each of them under a subpath, such as `remix/headers` for headers and `remix/router` for fetch-router.

| Task | Use | Instead of |
| --- | --- | --- |
| Route requests with middleware | [`@remix-run/fetch-router`](https://www.npmjs.com/package/@remix-run/fetch-router) | express, koa |
| Parse and format headers such as `Accept`, `Cache-Control`, `Content-Disposition`, and `Range` | [`@remix-run/headers`](https://www.npmjs.com/package/@remix-run/headers) | content-disposition, negotiator |
| Sign and verify cookies | [`@remix-run/cookie`](https://www.npmjs.com/package/@remix-run/cookie) | cookie-signature, cookie-parser |
| Look up a MIME type from a file name | [`@remix-run/mime`](https://www.npmjs.com/package/@remix-run/mime) | mime, mime-types |
| Parse `multipart/form-data` uploads as a stream | [`@remix-run/multipart-parser`](https://www.npmjs.com/package/@remix-run/multipart-parser) or [`@remix-run/form-data-parser`](https://www.npmjs.com/package/@remix-run/form-data-parser) | busboy, multer, formidable |
| Serve a file with ETags and `Range` | [`@remix-run/response/file`](https://www.npmjs.com/package/@remix-run/response) | send, serve-static, etag |
| Stream a large file without reading it into memory | [`@remix-run/lazy-file`](https://www.npmjs.com/package/@remix-run/lazy-file) | `fs.createReadStream` |
| Limit request rates | [`rate-limit`](/packages/rate-limit) | rate-limiter-flexible, limiter |
| Verify and sign webhooks | [`webhooks`](/packages/webhooks) | standardwebhooks, `stripe.webhooks.constructEvent` |
| Sign requests to AWS or S3-compatible storage such as Cloudflare R2 | [aws4fetch](https://www.npmjs.com/package/aws4fetch) | aws4 |

To serve requests with fetch-router, pass `router.fetch` to a Worker's `fetch` handler, to `Bun.serve`, or to `Deno.serve`. On Node, pass it to [`@remix-run/node-fetch-server`](https://www.npmjs.com/package/@remix-run/node-fetch-server). To serve a large file, pass a `LazyFile` to `createFileResponse` from `@remix-run/response/file`. The `@remix-run/response/compress` subpath imports `node:zlib`, so it doesn't run in browsers or in Workers without `nodejs_compat`.

## Crypto and auth

| Task | Use | Instead of |
| --- | --- | --- |
| Hash, HMAC, HKDF, and Ed25519 or X25519 keys as bytes | [`web-crypto`](/packages/web-crypto), on `crypto.subtle` | `node:crypto`, ecdsa-sig-formatter |
| A hash or curve that `crypto.subtle` lacks, or a sync or incremental hash | [`@noble/hashes`](https://www.npmjs.com/package/@noble/hashes) and [`@noble/curves`](https://www.npmjs.com/package/@noble/curves) | `node:crypto` |
| Random UUIDs | `crypto.randomUUID` | uuid's `v4` |
| Random integers, strings, and shuffles | [`random`](/packages/random) | nanoid's `customAlphabet`, crypto-random-string, seedrandom |
| JWT, JWS, JWE, and JWK sets | [jose](https://www.npmjs.com/package/jose) | jsonwebtoken, jwks-rsa |
| Hash passwords | [`password`](/packages/password) | `crypto.pbkdf2`, pbkdf2 |
| One-time passwords (HOTP and TOTP) | [otpauth](https://www.npmjs.com/package/otpauth) | speakeasy, otplib |
| OAuth 2 and OpenID Connect clients | [oauth4webapi](https://www.npmjs.com/package/oauth4webapi), or [arctic](https://www.npmjs.com/package/arctic) for presets such as GitHub and Google | simple-oauth2, client-oauth2 |
| Sign OAuth 1.0a requests | [`oauth1`](/packages/oauth1) | oauth-1.0a |
| Verify passkeys (WebAuthn) on the server | `ox/webauthn` from [ox](https://www.npmjs.com/package/ox) | your own CBOR and COSE key parsing |

## Email

| Task | Use | Instead of |
| --- | --- | --- |
| Compose a message with attachments | [`mail`](/packages/mail) | nodemailer's `MailComposer` |
| Send over SMTP, where the runtime has TCP sockets | [`smtp`](/packages/smtp) | nodemailer's SMTP transport |
| Parse a message into text, HTML, and attachments | [postal-mime](https://www.npmjs.com/package/postal-mime) | mailparser |
| Walk a large message part by part as a stream | [`mime-stream`](/packages/mime-stream) | mailsplit |
| Parse and format addresses and encoded-words | [`mime-headers`](/packages/mime-headers) | libmime, addressparser |
| Check SPF, DKIM, DMARC, and ARC | [`mail-auth`](/packages/mail-auth), or [`spf`](/packages/spf), [`dkim`](/packages/dkim), [`dmarc`](/packages/dmarc), and [`arc`](/packages/arc) on their own | mailauth |

## DNS and networking

| Task | Use | Instead of |
| --- | --- | --- |
| Look up DNS records | [`dns`](/packages/dns) | `node:dns/promises`, tangerine |
| Encode and decode DNS packets | [`dns-packet`](/packages/dns-packet) | dns-packet |
| Parse IP addresses and match CIDR blocks | [`ip`](/packages/ip) | ip, ipaddr.js |
| Look up domain and IP registration | [`rdap`](/packages/rdap) | whoiser |
| Open TCP and TLS connections | [`sockets`](/packages/sockets) | `node:net`, `node:tls` |

## Realtime

| Task | Use | Instead of |
| --- | --- | --- |
| A WebSocket that reconnects | [`websockets`](/packages/websockets) | reconnecting-websocket, partysocket |
| Server-sent events | [`sse`](/packages/sse) | eventsource-parser, eventsource |
| Typed RPC over workers, windows, WebSocket, and HTTP | [`rpc`](/packages/rpc) | comlink, birpc |
| Send Web Push notifications | [`web-push`](/packages/web-push) | web-push |

## Concurrency and timing

| Task | Use | Instead of |
| --- | --- | --- |
| Limit how many tasks run at once | [`queue`](/packages/queue) | p-limit, p-queue |
| Sleep, retry, poll, debounce, and throttle | [`timers`](/packages/timers) | delay, p-retry, lodash.debounce |
| Time out a `fetch` or another call that takes a signal | `AbortSignal.timeout` | p-timeout |

## Errors and logging

| Task | Use | Instead of |
| --- | --- | --- |
| Error classes that work across two copies of a package | [`errors`](/packages/errors) | `instanceof` checks |
| Log by namespace with `DEBUG` patterns | [`log`](/packages/log) | debug |
