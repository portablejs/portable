---
description: Packages from Portable and other projects that run unchanged in browsers, Cloudflare Workers, Node, Bun, and Deno, listed by task.
---

# Web platform

The web platform is the set of APIs that browsers, Cloudflare Workers, Node 24+, Bun, and Deno all have, such as `fetch`, Web Streams, and `crypto.subtle`. Code built only on those APIs runs in all of them.

The tables below list a package for each task that the platform doesn't do on its own. Some are Portable packages. The others come from other projects, and we didn't build our own because those packages already run everywhere and do what a Portable package would. Before we list one, we check that its main entry point runs in Chromium; in workerd, Cloudflare's Workers runtime, with the `nodejs_compat` flag off; and in Node, Bun, and Deno. If the package also has a subpath that imports `node:*` modules, the notes below its table say so.

## Streams and bytes

| Task | Package |
| --- | --- |
| Read a stream into bytes, text, or JSON with a size limit | [@portable/streams](/packages/streams) |
| Merge, map, or filter streams, or convert a Node stream | [@portable/streams](/packages/streams) |
| Split a stream into lines | [@portable/lines](/packages/lines) |
| Read and write binary protocols and length-prefixed frames | [@portable/binary](/packages/binary) |
| Convert bytes to and from hex, join them, or compare them in constant time | [@portable/bytes](/packages/bytes) |
| gzip or deflate bytes | [@portable/compress](/packages/compress) |
| Compress synchronously, or flush deflate at the end of each message | [fflate](https://www.npmjs.com/package/fflate) |
| Read or write zip files | [@zip.js/zip.js](https://www.npmjs.com/package/@zip.js/zip.js) or [fflate](https://www.npmjs.com/package/fflate) |
| Stream a zip file as a `Response` | [client-zip](https://www.npmjs.com/package/client-zip) |
| Read or write tar archives | [modern-tar](https://www.npmjs.com/package/modern-tar), [@remix-run/tar-parser](https://www.npmjs.com/package/@remix-run/tar-parser), or [multitars](https://www.npmjs.com/package/multitars) |

The `modern-tar/fs` subpath packs and unpacks directories with `node:fs`.

## Encodings and text

| Task | Package |
| --- | --- |
| base64 and base64url | [@portable/base64](/packages/base64) |
| Quoted-printable | [@portable/quoted-printable](/packages/quoted-printable) |
| Encode text into a legacy charset such as Shift_JIS | [@portable/charset](/packages/charset) |
| Convert domain names to and from Punycode | [@portable/idna](/packages/idna) |
| Join and normalize paths and URLs with forward slashes | [pathe](https://www.npmjs.com/package/pathe) |
| Format any value as readable text for logs | [object-inspect](https://www.npmjs.com/package/object-inspect) |

## Data formats

| Task | Package |
| --- | --- |
| CSV | [@portable/csv](/packages/csv) |
| JSON Lines | [@portable/jsonl](/packages/jsonl) |
| Read values from a large JSON stream, or write JSON as a stream | [@portable/json-stream](/packages/json-stream) |
| Stream values that hold promises, `Date`, `Map`, and `Set` | [turbo-stream](https://www.npmjs.com/package/turbo-stream) |
| CBOR | [cbor-x](https://www.npmjs.com/package/cbor-x) |
| MessagePack | [@msgpack/msgpack](https://www.npmjs.com/package/@msgpack/msgpack) |
| Parse and build XML | [fast-xml-parser](https://www.npmjs.com/package/fast-xml-parser) |
| Read XML as a stream of events | [saxes](https://www.npmjs.com/package/saxes) |
| Read an image's type and size | [@portable/image-size](/packages/image-size) |
| Read or strip EXIF metadata | [@portable/exif](/packages/exif) |
| Decode and encode PNG pixels | [@portable/png](/packages/png) |

## HTTP servers and requests

| Task | Package |
| --- | --- |
| Serve a `fetch` handler with the same code in every server runtime | [srvx](https://www.npmjs.com/package/srvx) |
| Route requests with middleware | [@remix-run/fetch-router](https://www.npmjs.com/package/@remix-run/fetch-router) |
| Parse and format headers such as `Accept`, `Cache-Control`, `Content-Disposition`, and `Range` | [@remix-run/headers](https://www.npmjs.com/package/@remix-run/headers) |
| Sign and verify cookies | [@remix-run/cookie](https://www.npmjs.com/package/@remix-run/cookie) |
| Look up a MIME type from a file name | [@remix-run/mime](https://www.npmjs.com/package/@remix-run/mime) |
| Parse `multipart/form-data` uploads as a stream | [@remix-run/multipart-parser](https://www.npmjs.com/package/@remix-run/multipart-parser) or [@remix-run/form-data-parser](https://www.npmjs.com/package/@remix-run/form-data-parser) |
| Serve a file with ETags and `Range` | [@remix-run/response](https://www.npmjs.com/package/@remix-run/response) |
| Stream a large file without reading it into memory | [@remix-run/lazy-file](https://www.npmjs.com/package/@remix-run/lazy-file) |
| Limit request rates | [@portable/rate-limit](/packages/rate-limit) |
| Verify and sign webhooks | [@portable/webhooks](/packages/webhooks) |
| Sign requests to AWS or S3-compatible storage such as Cloudflare R2 | [aws4fetch](https://www.npmjs.com/package/aws4fetch) |
| Call gRPC and Connect services | [@connectrpc/connect](https://www.npmjs.com/package/@connectrpc/connect) |

The @remix-run packages come from Remix 3. The remix package also re-exports each of them under a subpath, such as `remix/headers` for @remix-run/headers and `remix/router` for @remix-run/fetch-router.

To serve requests with fetch-router, pass `router.fetch` to srvx's `serve`, `Bun.serve`, or `Deno.serve`. In a Worker, use `router.fetch` as the `fetch` handler. srvx starts each runtime's own server, and on Node it converts Node's request and response objects to a `Request` and a `Response`. To serve a large file, pass a `LazyFile` to `createFileResponse` from `@remix-run/response/file`. The `@remix-run/response/compress` subpath imports `node:zlib`, so it doesn't run in browsers or in Workers without `nodejs_compat`.

## Crypto and auth

| Task | Package |
| --- | --- |
| Hash, HMAC, HKDF, and Ed25519 or X25519 keys as bytes | [@portable/web-crypto](/packages/web-crypto) |
| A hash or curve that `crypto.subtle` lacks, such as MD5 or secp256k1, or a sync or incremental hash | [@noble/hashes](https://www.npmjs.com/package/@noble/hashes) and [@noble/curves](https://www.npmjs.com/package/@noble/curves) |
| Random integers, strings, and shuffles | [@portable/random](/packages/random) |
| JWT, JWS, JWE, and JWK sets | [jose](https://www.npmjs.com/package/jose) |
| Hash passwords | [@portable/password](/packages/password) |
| Check bcrypt password hashes | [bcryptjs](https://www.npmjs.com/package/bcryptjs) |
| One-time passwords (HOTP and TOTP) | [otpauth](https://www.npmjs.com/package/otpauth) |
| OAuth 2 and OpenID Connect clients | [oauth4webapi](https://www.npmjs.com/package/oauth4webapi), or [arctic](https://www.npmjs.com/package/arctic) for presets such as GitHub and Google |
| Sign OAuth 1.0a requests | [@portable/oauth1](/packages/oauth1) |
| Verify passkeys (WebAuthn) on the server | `ox/webauthn` from [ox](https://www.npmjs.com/package/ox) |

MD5 and SHA-1 are in `@noble/hashes/legacy.js`.

## Email

| Task | Package |
| --- | --- |
| Compose a message with attachments | [@portable/mail](/packages/mail) |
| Send over SMTP, where the runtime has TCP sockets | [@portable/smtp](/packages/smtp) |
| Parse a message into text, HTML, and attachments | [postal-mime](https://www.npmjs.com/package/postal-mime) |
| Walk a large message part by part as a stream | [@portable/mime-stream](/packages/mime-stream) |
| Parse and format addresses and encoded-words | [@portable/mime-headers](/packages/mime-headers) |
| Check SPF, DKIM, DMARC, and ARC | [@portable/mail-auth](/packages/mail-auth), or [@portable/spf](/packages/spf), [@portable/dkim](/packages/dkim), [@portable/dmarc](/packages/dmarc), and [@portable/arc](/packages/arc) on their own |

## DNS and networking

| Task | Package |
| --- | --- |
| Look up DNS records | [@portable/dns](/packages/dns) |
| Encode and decode DNS packets | [@portable/dns-packet](/packages/dns-packet) |
| Parse IP addresses and match CIDR blocks | [@portable/ip](/packages/ip) |
| Look up domain and IP registration | [@portable/rdap](/packages/rdap) |
| Open TCP and TLS connections | [@portable/sockets](/packages/sockets) |

## Realtime

| Task | Package |
| --- | --- |
| A WebSocket client that reconnects | [@portable/websockets](/packages/websockets) |
| A WebSocket server with the same code in every server runtime | [crossws](https://www.npmjs.com/package/crossws) |
| Server-sent events | [@portable/sse](/packages/sse) |
| Typed RPC over workers, windows, WebSocket, and HTTP | [@portable/rpc](/packages/rpc) |
| Send Web Push notifications | [@portable/web-push](/packages/web-push) |

crossws has an adapter for each server runtime, such as `crossws/adapters/cloudflare` and `crossws/adapters/node`, so import the one for the runtime you deploy to.

## Events, concurrency, and timing

| Task | Package |
| --- | --- |
| Emit and listen to events with Node's `EventEmitter` API | [eventemitter3](https://www.npmjs.com/package/eventemitter3) |
| Limit how many tasks run at once | [@portable/queue](/packages/queue) |
| Sleep, retry, poll, debounce, and throttle | [@portable/timers](/packages/timers) |

## Errors and logging

| Task | Package |
| --- | --- |
| Error classes that work across two copies of a package | [@portable/errors](/packages/errors) |
| Log by namespace with `DEBUG` patterns | [@portable/log](/packages/log) |
