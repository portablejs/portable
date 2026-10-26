---
description: Packages from other projects that we use instead of building our own. They run in browsers, Cloudflare Workers, Node, Bun, and Deno.
---

# Recommended packages

We don't build a Portable package when a good one already exists. The packages on this page run unchanged in browsers, Cloudflare Workers, Node 24+, Bun, and Deno. They're built on web-standard APIs such as `fetch`, Web Streams, and `crypto.subtle`, and most have no dependencies. Use them alongside Portable packages.

Before listing a package, we called its main entry point in Chromium; in workerd, the Cloudflare Workers runtime, without the `nodejs_compat` flag; and in Node, Bun, and Deno. If a package also has a subpath that imports `node:*` modules, its entry below says so.

## HTTP servers and requests

The `@remix-run/*` packages come from Remix 3. The `remix` package also re-exports each of them under a subpath, such as `remix/headers` or `remix/router` for fetch-router.

- [`@remix-run/fetch-router`](https://www.npmjs.com/package/@remix-run/fetch-router) routes a `Request` to a handler that returns a `Response`, with typed route maps and middleware. You can pass `router.fetch` to a Worker's `fetch` handler, `Bun.serve`, or `Deno.serve`. On Node, serve it with [`@remix-run/node-fetch-server`](https://www.npmjs.com/package/@remix-run/node-fetch-server).
- [`@remix-run/headers`](https://www.npmjs.com/package/@remix-run/headers) parses and formats `Accept`, `Cache-Control`, `Content-Disposition`, `Range`, `Set-Cookie`, and other headers, and its `SuperHeaders` class extends `Headers`. Its `ContentDisposition` class parses and formats that header, including RFC 8187 `filename*` parameters, so we dropped our planned content-disposition package.
- [`@remix-run/cookie`](https://www.npmjs.com/package/@remix-run/cookie) signs and verifies cookies with HMAC from `crypto.subtle`. It replaces cookie-signature, so we dropped our planned cookie-signature package too.
- [`@remix-run/response`](https://www.npmjs.com/package/@remix-run/response) builds `Response` objects. `createFileResponse` from `@remix-run/response/file` serves a `File` with ETags, `Last-Modified`, conditional requests, and `Range`. The `@remix-run/response/compress` subpath imports `node:zlib`, so it doesn't run in browsers or in Workers without `nodejs_compat`.
- [`@remix-run/lazy-file`](https://www.npmjs.com/package/@remix-run/lazy-file) has `LazyFile` and `LazyBlob`. They work like `File` and `Blob`, but they don't read their content until you read the file or blob, and a `slice` of one is lazy too. Pass a `LazyFile` to `createFileResponse` to serve a large file without reading it into memory.
- [`@remix-run/mime`](https://www.npmjs.com/package/@remix-run/mime) maps file names to MIME types, as mime and mime-types do.
- [`@remix-run/multipart-parser`](https://www.npmjs.com/package/@remix-run/multipart-parser) replaces busboy. It streams the parts of a `multipart/form-data` body and limits the number of parts and their size. Its `/node` subpath reads Node streams. [`@remix-run/form-data-parser`](https://www.npmjs.com/package/@remix-run/form-data-parser) builds on it to return `FormData` and pass each uploaded file to your handler, so an upload doesn't have to fit in memory.
- [`aws4fetch`](https://www.npmjs.com/package/aws4fetch) signs requests with AWS Signature Version 4 on `crypto.subtle` and sends them with `fetch`. It works with AWS and with S3-compatible APIs such as Cloudflare R2.

## Crypto and auth

- [`jose`](https://www.npmjs.com/package/jose) signs, verifies, encrypts, and decrypts JWTs, JWS, and JWE, and fetches remote JWK sets. It uses `crypto.subtle` in every runtime. [`@portable/web-crypto`](/packages/web-crypto) converts ECDSA signatures between DER and the raw form that JWS uses, but it doesn't create or verify JWTs, so use jose for those.
- [`@noble/hashes`](https://www.npmjs.com/package/@noble/hashes) and [`@noble/curves`](https://www.npmjs.com/package/@noble/curves) are audited JavaScript implementations of hashes and elliptic curves. Use them when `crypto.subtle` lacks the algorithm, such as BLAKE3, scrypt, or secp256k1, or when you need a sync or incremental hash. Portable packages that hash or sign accept noble functions in their `digest`, `hmac`, and `hasher` options.
- [`otpauth`](https://www.npmjs.com/package/otpauth) generates and checks HOTP and TOTP codes, and reads and writes the `otpauth://` URIs that authenticator apps scan. It depends on `@noble/hashes`.
- [`oauth4webapi`](https://www.npmjs.com/package/oauth4webapi) is an OAuth 2 and OpenID Connect client. It supports the authorization code flow with PKCE, token refresh, discovery, and DPoP.
- [`arctic`](https://www.npmjs.com/package/arctic) has OAuth 2 clients set up for providers such as Apple, GitHub, and Google. It depends only on the `@oslojs/*` packages, which also use only web APIs. Our [`oauth1`](/packages/oauth1) package covers OAuth 1.0a, where the client signs every request. That protocol shares no code with OAuth 2, so neither OAuth 2 library handles it.
- [`ox/webauthn`](https://www.npmjs.com/package/ox) verifies passkey registrations and sign-ins on the server, and ox's `Cbor` and `CoseKey` modules read the data a passkey sends. It verifies only ES256, which every passkey provider supports. ox has several dependencies, so import `ox/webauthn` to keep the rest of ox out of your bundle.

## Files, archives, and compression

- [`fflate`](https://www.npmjs.com/package/fflate) reads and writes zip files, and compresses in JavaScript when you need a sync result. For gzip and deflate, [`@portable/compress`](/packages/compress) calls the platform's `CompressionStream` and ships no compression code.
- [`modern-tar`](https://www.npmjs.com/package/modern-tar) reads and writes tar archives as Web Streams. Its `modern-tar/fs` subpath packs and unpacks directories with `node:fs`.
- [`@remix-run/tar-parser`](https://www.npmjs.com/package/@remix-run/tar-parser) streams the entries of a tar archive, with limits on entry count and size.
- [`multitars`](https://www.npmjs.com/package/multitars) reads and writes multipart bodies and tar archives with Web Streams.

## Data formats

- [`cbor-x`](https://www.npmjs.com/package/cbor-x) encodes and decodes CBOR (RFC 8949), including its tag extensions.
- [`@msgpack/msgpack`](https://www.npmjs.com/package/@msgpack/msgpack) encodes and decodes MessagePack, including from a stream.
- [`turbo-stream`](https://www.npmjs.com/package/turbo-stream) writes values to a stream, including values that contain promises, `Date`, `Map`, `Set`, and other types. It sends each promise's value as soon as the promise settles, so the values can arrive in any order. React Router uses it to stream loader data. [`@portable/json-stream`](/packages/json-stream) writes plain JSON in order, so any JSON parser can read its output.
- [`postal-mime`](https://www.npmjs.com/package/postal-mime) parses an email message into its headers, text, HTML, and attachments. To read a large message part by part as a stream, use [`@portable/mime-stream`](/packages/mime-stream).
