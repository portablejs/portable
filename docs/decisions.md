# Decisions

Calls made without the owner's input, with the options considered and the reason for the choice. Newest first. Change any of them by replying in the project thread or editing this file.

## `Crypto.derToRawEcdsa` accepts only strict DER

- **Options:** accept what ecdsa-sig-formatter's `derToJose` accepts (BER lengths, extra leading zeros, negative and empty INTEGERs); accept only DER.
- **Trade-offs:** a lenient parser converts a few more signatures from broken signers. It also gives one signature several encodings, and `derToJose` drops a non-zero top byte of an oversized INTEGER and returns a different signature. Wycheproof flags all of these as invalid.
- **Chosen:** strict DER. Every Wycheproof case flagged `BerEncodedSignature`, `InvalidEncoding` or `MissingZero` throws `InvalidInputError`. The README lists what `derToJose` accepts and we reject.

## `Crypto.importSeed` returns a non-extractable private key by default

- **Options:** extractable by default, which needs one `importKey`; non-extractable by default, which imports the key a second time after reading its public key.
- **Trade-offs:** the second import makes `importSeed` about 40% slower (8,100 instead of 12,900 calls a second on Node). An extractable key can be exported by any code that holds it.
- **Chosen:** non-extractable, as `crypto.subtle` keys are by default for code that doesn't ask. `extractable: true` skips the second import.

## `Crypto` keeps the function names from the package brief

- **Options:** `derToRawEcdsa`, `rawToDerEcdsa` and `publicKeyOf` as the approved brief names them; names built from the `encode`, `decode`, `parse` and `format` verbs in AGENTS.md.
- **Trade-offs:** both sides of the ECDSA conversion are bytes, so neither direction is an `encode` or a `decode` of a value, and `decodeDer` would hide which form comes out. The brief's names say both forms.
- **Chosen:** the brief's names. Each async function still takes `signal`, checked before and after the `crypto.subtle` call, since WebCrypto calls can't be cancelled.

## `Crypto.hmac` and `Crypto.hkdf` take key bytes, not a `CryptoKey`

- **Options:** also accept an imported `CryptoKey` so a caller can reuse it; take bytes or a string only.
- **Trade-offs:** a reused key saves one `importKey` per call, but a `CryptoKey` carries its own hash, which could disagree with the `hash` argument. A caller who reuses a key can call `crypto.subtle.sign` directly.
- **Chosen:** bytes or a string only.

## `@portable/rdap` API

- **`domain(name)`, `ip(address)` and `asn(number)`, each returning a plain normalized object with `raw`.** node-rdap's `nameserver()` and `entity()` were left out: a domain result already lists its nameservers and entities, and entity handles can be routed only for the eight RFC 8521 tags.
- **Four error classes.** `InvalidInputError` and `UnsupportedError` (no server in the bootstrap file) are the shared names. `NotFoundError` is separate from `ResponseError` because "is this name registered?" is the most common question a caller asks. A rejected `fetch` passes through unchanged. `@portable/dns` wraps it in `QueryError` to copy Node's error codes, and RDAP has no such codes to copy.
- **Registrar referrals are followed by default, and a failed referral is reported in `referral.error` instead of rejecting.** Registrar servers fail more often than registries, and the registry's answer is still correct. The other option was to reject, which would make a `.com` lookup fail whenever the registrar's server is down.
- **The merged result takes entities from the registrar and everything else from the registry.** A registry entity is kept when the registrar's response has none of its roles. Taking the whole registrar response was simpler, but registrars report their own expiration dates (MarkMonitor's `google.com` expiration is a day earlier than Verisign's), and the registry is the authority for them.
- **Bootstrap files are cached for 24 hours in a `WeakMap` keyed by the `fetch` function, with no TTL option.** A module-level cache leaked bootstrap files between tests that pass different fetches, and node-rdap needs `flushCaches()` for that. 24 hours is IANA's `max-age`. Concurrent lookups share one request, and it is aborted only when every lookup waiting for it has aborted.
- **Entities are flattened depth first, and each jCard property gives its first value.** A registrar's abuse contact is nested inside the registrar entity, and callers look for it with `roles.includes('abuse')`. Several emails or phones per entity are in `raw`.
- **A date without a time zone is read as UTC.** `new Date('2020-01-02T03:04:05')` uses the machine's zone, so the same response gave different `Date`s on different machines.
- **IDNA uses `URL`'s host parser, and IP addresses use a private parser, until `@portable/idna` and `@portable/ip` are on `main`.** Both are in progress. The parser is about 100 lines with the longest-prefix match, and swapping it for `@portable/ip` changes no behavior the tests check.

## `@portable/web-push` sends aes128gcm only, with no GCM keys

- **Options:** support aesgcm and GCM API keys as web-push does; aes128gcm and VAPID only.
- **Trade-offs:** aesgcm is the draft encoding from before RFC 8291, and every current browser accepts aes128gcm. GCM shut down in 2019 and FCM's legacy server keys in 2024, so web-push's GCM branches can't send anything today.
- **Chosen:** aes128gcm and VAPID only. `vapid` is a required option of each call instead of module state.

## `WebPush.send` returns `{ kind: 'gone' }` for 404 and 410, and throws for other errors

- **Options:** throw for every non-2xx, as web-push does; return every status as a result; return 404 and 410 as a result and throw for the rest.
- **Trade-offs:** a gone subscription is routine and every caller must handle it by deleting the subscription, so it belongs in the result type, where TypeScript shows it. Other statuses (400, 403, 413, 429, 5xx) mean the send failed, and AGENTS.md says errors are thrown.
- **Chosen:** `{ kind: 'sent', status } | { kind: 'gone', status }`, and `ResponseError` with `status`, `headers` and `body` for the rest. A malformed subscription throws `InvalidInputError`, which callers can also treat as a reason to delete it.

## `WebPush.toRequest` returns a `Request`

- **Options:** only `encrypt`, as the brief listed; a `generateRequestDetails`-style plain object; a `Request`.
- **Trade-offs:** a caller with its own transport needs the VAPID header and the other headers as well as the body, so `encrypt` alone isn't enough. A `Request` can be passed to any `fetch`, put on a queue after `arrayBuffer()`, or have headers added.
- **Chosen:** export both `encrypt` and `toRequest`. `send` calls `toRequest`, then `fetch`.

## `WebPush` reuses a VAPID token for an hour

- **Options:** sign a new JWT for every message, as web-push does; reuse it per push service origin.
- **Trade-offs:** Apple's documentation asks senders not to refresh tokens more often than once an hour. Reuse also skips an ECDSA signature per message. A reused token has at least 11 hours left, and RFC 8292 allows up to 24.
- **Chosen:** reuse for an hour, keyed by audience, subject and keys, with up to 64 tokens kept.

## `WebPush` rejects payloads over 3993 bytes and `http:` endpoints

- **Options:** follow web-push and send whatever the caller gives; check against the RFC limits.
- **Trade-offs:** push services must accept a 4096-byte body (RFC 8291 §4), which leaves 3993 bytes of payload, and FCM and Apple reject larger ones. An endpoint comes from a browser, so an `http:` endpoint either is a mistake or points the server at an internal address. Rejecting `http:` means a local test push service needs `https:` or a `fetch` that rewrites the URL.
- **Chosen:** throw a `RangeError` for a larger payload and `InvalidInputError` for a non-`https:` endpoint.

## `@portable/web-push` benchmarks against direct WebCrypto calls

- **Options:** require being within 25% of web-push; compare with the same WebCrypto calls made directly and show web-push for reference.
- **Trade-offs:** web-push uses synchronous `node:crypto`. On Node every WebCrypto call goes through the thread pool, and an encryption needs 9 of them, so the same work is about 3.5 times slower one at a time and 1.4 times slower in a batch of 64. No change to the package can close that gap without a JavaScript AES-GCM and ECDH, which AGENTS.md doesn't allow without a dependency. The `webhooks` benchmarks made the same call for `node:crypto` HMAC.
- **Chosen:** the 25% assertions compare with direct WebCrypto calls, and the README shows web-push's numbers.

## `@portable/rate-limit`: GCRA and a compare-and-set store

- **Algorithm options:** GCRA; a token bucket; fixed or sliding windows, as rate-limiter-flexible does.
- **Trade-offs:** a token bucket stores two numbers per key (tokens and the last refill time), so a store must update both atomically. Windows are one counter but let a client make twice the limit across a boundary. GCRA allows exactly what a token bucket of size `burst` refilling at `limit / period` allows, and stores one number, the time at which the key's allowance is full again.
- **Chosen:** GCRA. With one number, a store needs only `get` and a compare-and-set by value, which memory, a Durable Object and a Redis Lua script all support. Comparing values instead of versions is safe because `take` computes its result from the value alone, so an unchanged value means an unchanged decision.
- **Store shape:** `get(key)` and `set(key, value, { expected, ttl })`, rather than an atomic `increment` with a TTL. An increment fits a counter, not GCRA, and Workers KV supports neither, so its recipe ignores `expected`. Both methods may return a plain value, so the memory store skips two `await`s per `take`; that took `take` from 1.9× slower than rate-limiter-flexible's memory limiter to 8% slower.
- **Units:** `period`, `resetAt` and `retryAfter` are milliseconds, as `AbortSignal.timeout` takes, and `headers` rounds them up to the seconds the draft asks for. `resetAt` is a Unix time, so it stays correct after the result is passed around.
- **A cost larger than `burst`** resolves with `allowed: false` and `retryAfter: Infinity` instead of throwing, because costs often come from request sizes, and a caller sends a 429 either way. `headers` leaves out `Retry-After` then.
- **Float rounding:** a TAT near `Date.now()` has a resolution of about 0.0002 ms, so summing an inexact `period / limit` could deny the last request of a burst. `take` allows each request up to `min(0.01 ms, interval / 2)` early.
- **Left out:** `blockDuration`, key prefixes, queues that wait for allowance, and a `delete`. The README shows each with `take`.

## `JsonStream.DecoderStream` and `JsonStream.encodeStream`

- **Options for the writer:** keep `encode`; `encodeStream`; an `EncoderStream` class.
- **Trade-offs:** every other `encode` returns a string or bytes, so `JsonStream.encode` returning a `ReadableStream<string>` breaks what a caller learned from `Base64.encode`. `EncoderStream` is a `TransformStream` everywhere else, used with `pipeThrough`, but this function takes one value, not a stream of them; `Jsonl.EncoderStream` is the transform for many values. `encodeStream` needed the `Stream` suffix rule to cover a stream output as well as a stream input.
- **Chosen:** `encodeStream(value)`. AGENTS.md now says the suffix marks a variant whose bytes or text are a stream, in either direction, so `parseStream` and `encodeStream` mirror each other.
- **The reader is `DecoderStream`, not `ParserStream`,** because AGENTS.md keeps `parse` for packages that only read, and json-stream also writes. With the default `paths: ['$']` it emits every top-level value, as `Jsonl.DecoderStream` does for each line.
- **`InvalidInputError` and `TruncatedError` extend `Error`,** as in every other package, and so does `Jsonl.InvalidInputError`. They extended `TypeError`, so a caller that treated `TypeError` as a bug in its own code also caught bad input.

## Build `@portable/bytes` instead of pointing to uint8array-extras

Kevin approved this on 2026-10-18 after the niftysim, fast.domains and loess audits. All three apps hand-write hex encoding, concatenation and a constant-time compare, and Portable had six private `concat` copies plus hex and compare code in webhooks. uint8array-extras has no constant-time compare and no strict hex parsing, and our packages can't depend on it under the no-outside-dependencies rule. The package stays small: base64 remains in `@portable/base64`, and random bytes come from `crypto.getRandomValues`.

## `LineStream` is `Lines.DecoderStream`

- **Options:** keep `LineStream`; `Lines.DecoderStream`; `Lines.SplitterStream`.
- **Trade-offs:** `LineStream` describes itself when read alone and echoes Deno's `TextLineStream`, but callers write `Lines.LineStream`, which repeats the package name. `SplitterStream` avoids that and still says what the transform does. `DecoderStream` gives every transform that turns bytes into values the same name, as `Base64`, `QuotedPrintable` and `Jsonl` already do, but it has no `EncoderStream` to pair with, and "decode" says less about a string input, which is only split.
- **Chosen:** `Lines.DecoderStream`. A caller who has used `Jsonl.DecoderStream` can guess it, and the transform does decode: byte chunks go through `TextDecoder` with the `encoding` option. AGENTS.md now says a transform from bytes or text to values is a `DecoderStream`.

## README package stats

- **One benchmark per package for the speed column.** `scripts/readme-stats.ts` lists the test and the library it compares against for each package. Where the main replaced library leans on a native API, the column uses the library the benchmark's own assertion names: base64 compares with base64-js, because libbase64 decodes with Node's `Buffer` and is about 16× faster in Node than any JavaScript decoder. image-size uses the PNG fixture, because image-size reads all of `large.jpg` and the 4,000× result says little about typical files.
- **`pnpm bench` writes `.bench/report.json` with Vitest's JSON reporter.** Vitest 5 ignores `benchmark.outputJson`, so that setting is removed. The JSON reporter includes each test's `benchmarks`.
- **Coverage is measured in Node only.** Browser coverage would need the Istanbul provider or Playwright's V8 coverage, and only a few native paths, such as `Uint8Array.prototype.toBase64`, run only in browsers.
- **Bundle size is measured with Vite's `build` from `vite-plus`,** which bundles with rolldown, so no new dependency is needed. `scripts/bundle-size.ts` builds one entry per library, `import * as m from '<pkg>'; globalThis.__size = m`, so the whole public API is kept. It runs from the package's `test/` directory, so it bundles the same upstream versions the tests install, with their dependencies, and resolves `@portable/*` to the built `dist/`. The build uses Vite's browser conditions and `browser` fields, minifies, and the size is the gzip (level 6) of all output chunks. Node builtins are left external, and a library is marked "Node only" if it imports one or its output uses `Buffer`. Its size then leaves out whatever a browser polyfill would add. An optional peer such as `@noble/hashes` is not counted, because our packages don't import it.

## Crypto defaults to WebCrypto, with no `/core` entry

The owner made this call for `@portable/webhooks` and `@portable/oauth1`, and docs/architecture.md now states it as the rule.

- **Options:** `@noble/hashes` in every runtime, the earlier default; export conditions that give browsers, Workers and Deno a WebCrypto build and Node and Bun a noble build, as octokit and Stripe do; WebCrypto in every runtime, with the `hmac` or `digest` option for a caller who wants noble.
- **Trade-offs:** noble HMAC-SHA256 adds about 3.0 kB gzipped to a browser bundle and needs an optional peer. Node's WebCrypto HMAC is about 7× slower than noble's. Export conditions avoid both costs but give each runtime different code, which tests in one runtime don't cover.
- **Chosen:** WebCrypto everywhere, because it is the platform API and Node's implementation is expected to get faster. Neither package has a noble dependency or peer any more. `/core` existed to keep the noble default out of bundles, so it is gone, and the option is the only way to pass another function. A browser bundle of `verify` from webhooks is 4.7 kB gzipped, and of `sign` from oauth1 5.1 kB, neither with noble code.
- **On Node:** a webhooks verification with the default is 1.6× faster than Stripe's `constructEventAsync` and about 1.8× slower than standardwebhooks. An oauth1 GET header is about 5× slower than oauth-1.0a with `node:crypto`. With noble passed in, both are faster than the library they replace. The benchmarks assert against the noble path where the upstream library hashes in JavaScript or `node:crypto`, and against the default where it uses WebCrypto.
- **The webhooks CryptoKey cache stays.** It holds up to 16 imported keys and clears itself when full. Without it, a verification on Node was 2.9× slower, and an HMAC in Chromium took 12 µs instead of 6 µs.

## `@portable/mime-headers` API

- **Two verb pairs.** Encoded words use `encodeWord`, `encodeWords` and `decodeWords`, because RFC 2047 is an encoding of text. Structured values use `parseValue`/`formatValue` and `parseAddresses`/`formatAddresses`, because the text is a syntax people read and write. AGENTS.md now has a rule for the `parse`/`format` pair. Also offered: one `encode`/`decode` pair for everything, which would hide that `parseAddresses` discards comments and whitespace.
- **Charsets come from a caller-supplied `CharsetEncoder`,** not an optional dependency on `@portable/charset`. Decoding uses `TextDecoder`, which covers every charset a mail client meets, and only encoding into a legacy charset needs a table. Callers such as `mail` pass `@portable/charset`, and the package stays free of dependencies.
- **No dependency on `@portable/quoted-printable`.** RFC 2047 Q encoding writes `_` for a space and has a smaller set of safe characters than quoted-printable, so sharing the encoder would need options that only this package uses.
- **Strict address parsing is an option on `parseAddresses`,** not a separate validator. email-addresses' strict RFC 5322 mode and addressparser's lenient mode share one grammar here, and the option only rejects what the lenient parser repairs.
- **Different from upstream:** quotes around a local part are removed, `<x@evil.com @good.com>` keeps only the first address, UTF-8 addresses are accepted (RFC 6532), and `formatValue` writes RFC 2231 continuations for long parameters.

## `@portable/spf` API

- **`Spf.check({ ip, sender, helo }, { resolver, receiver, signal })`, named after RFC 7208's `check_host()`.** `verify` was passed over because in webhooks it throws on failure, and an SPF `fail` is a result, not an error. `check` rejects only for an invalid `ip`.
- **The resolver is required, with no default.** A default of `Dns.createResolver()` would save one line, but the resolver decides who sees the client's IP through `%{i}` in `exists` lookups, mail servers usually have their own resolver, and it would put DNS-over-HTTPS code into Node bundles. `Spf.Resolver` is a `Pick` of five `Dns.Resolver` methods, so `node:dns/promises` and small test fakes both fit.
- **RFC 7208 behavior only.** There is no lenient mode like mailauth's default and no options for the lookup limits. A syntax error anywhere gives `permerror`, and empty answers and `EBADNAME` count as void lookups.
- **No Received-SPF or Authentication-Results headers.** The result's `identity` and `domain` are enough for `@portable/mailauth` to build them.

## `@portable/dns` API

- **`createResolver({ endpoints, fetch, timeout })` returns Node's method names** (`resolve4`, `resolveTxt`, `resolveMx`, ... `reverse`) plus `query(name, type)` for the whole decoded packet. The `Resolver` type has the one-argument methods, which `node:dns/promises` also fits, so SPF, DMARC and DKIM accept either. Code moving from Node changes only how the resolver is built.
- **`QueryError` copies Node's `code`, `syscall`, `hostname` and message,** so existing `ENOTFOUND`/`ENODATA` handling keeps working. An abort rejects with `signal.reason`, as `fetch` does.
- **GET requests with ID 0,** so responses can be cached and browsers send no CORS preflight. A truncated response is an error, and the next endpoint is tried.
- **No cache, `ttl` option, `resolveAny` or `resolveTlsa`;** `query()` covers them.
- **Different from Node:** TXT is decoded as UTF-8, only records on the question's CNAME chain are returned, and a CNAME-only answer gives `ENODATA`.

## `@portable/oauth1` API

- **`sign(request, options)` returns a new signed `Request`; `authorization(request, options)` returns only the header value.** oauth-1.0a's `authorize` and `toHeader` were the alternatives. Inputs are `Request` objects, so what gets signed is exactly the URL and body `fetch` sends, at about 10 µs per POST for reading the body.
- **The option is `signatureMethod`, defaulting to HMAC-SHA1,** because `method` reads as the HTTP method. oauth-1.0a defaults to PLAINTEXT.
- **The pluggable function is a hash (`digest`), and HMAC is built on it,** so one function serves the signature and the body hash and has the shape of noble's hashes and `crypto.subtle.digest`. It costs about 15 lines of HMAC code, checked against WebCrypto and `node:crypto`.
- **The default is `crypto.subtle.digest`,** as for every package (see the decision above). On Node an HMAC takes about 60 µs with it and 8 µs with noble passed as `digest`.
- **The signed form POST benchmark allows 50%.** Reading the body and building a second `Request` in undici costs more than oauth-1.0a's string handling; hashing is not the gap.
- **No HTTP client.** `fetch` follows redirects with the old signature, and the README shows how to re-sign.

## `@portable/webhooks` API

- **One `verify(input, { scheme, secret })` with `scheme: 'standard' | 'svix' | 'stripe' | 'github' | 'slack'`,** not a function per provider, so there is one result type, one error class and one set of options. `sign` mirrors it and returns the provider's headers.
- **The default is WebCrypto `importKey` plus `sign`, with a cache of imported keys** (see the decision above). Commit 6950f78 briefly made `@noble/hashes` the default, which is 1.6× faster than standardwebhooks on Node. A caller can still pass it as `hmac`.
- **`verify` returns `{ body, id, timestamp }` as text, not parsed JSON,** because Slack commands and GitHub form deliveries aren't JSON, and the `id` lets callers drop replays.
- **One `VerificationError` with a `reason`** (`missing-header`, `malformed-header`, `signature`, `timestamp`) instead of the shared error names, because every failure maps to the same 4xx. Mistakes in the call throw `TypeError` or `RangeError`. The signature is checked first, so `timestamp` always means a genuine but stale message.
- **The tolerance applies in both directions;** Stripe and Slack accept any future timestamp. No SHA-1 for GitHub, which always sends SHA-256.
- **Benchmarks assert only against WebCrypto or pure-JS implementations.** Libraries on `node:crypto` are 3 to 8× faster on Node than any web-standard HMAC, so they are listed for reference.

## Tests are a separate workspace package in `packages/<name>/test/`

- **Options:** `src/_test/` inside each package (the first layout); a sibling `test/` directory with its own `package.json` (the owner's suggestion).
- **Trade-offs:** a separate package keeps upstream libraries, their `@types` and Node types out of the published `package.json`, and makes tests import the package by name through its `exports` map. It adds one workspace package per package. Unexported code can still be tested by importing it by path.
- **Chosen:** `test/`, named `@portable/<name>-test`. Shared tools (Vitest, TypeScript, Playwright, `@types/node`) stay in the root. `tsconfig.test.json` type-checks every test directory, which `tsc -b` didn't do before.

## `@portable/json-stream` API

- **`DecoderStream({ paths })` emits `{ path, value }` for values at JSONPath expressions, and `encodeStream(value)` returns a `ReadableStream<string>`.** Line-delimited JSON moved to its own package, `@portable/jsonl`, with `Jsonl.DecoderStream` and `Jsonl.EncoderStream`: it is a problem developers name on its own, and the move gives it the same names as the other codecs. It is named for JSON Lines (`.jsonl`), the name OpenAI, Hugging Face and agent transcripts use, rather than NDJSON, the older name kept by the `ndjson` npm package and Elasticsearch; the owner chose it. Both names are the same format.
- **No runtime dependency on `lines` or `streams`.** Splitting on `\n` inline is faster, and `encode` needs its own pull source so cancelling can interrupt a pending read.
- **Functions in the value are thunks,** called when the writer reaches them, so work such as a query starts only when needed. `JSON.stringify` drops functions instead.
- **Matched values are built with `JSON.parse` on the matched slice,** which is faster and parses exactly like `JSON.parse`. A syntax error inside a match is reported when that value ends, not at the bad character.
- **Streams and async iterables are always written as arrays.** No `cycle` option: a circular structure or a BigInt fails as in `JSON.stringify`.

## `@portable/png` API

- **Async `decode`/`encode` use `DecompressionStream`/`CompressionStream`; `decodeSync`/`encodeSync` require a zlib function** (fflate's or `node:zlib`'s). One function with mixed return types or overloads was the alternative.
- **Output is always 8-bit RGBA,** and `encode` takes `{ width, height, data }`, so a canvas `ImageData` or a decode result can be passed as is. 16-bit precision is lost, and there is no 16-bit or palette writing.
- **No compression level option,** because `CompressionStream` has none. Callers set a level inside their own `deflate`.
- **Rows are filtered by the smallest signed-byte sum,** as libpng does.
- **The `DecompressionStream` decode benchmark allows 50%.** Node's `DecompressionStream` hands zlib one 16 KiB chunk at a time to the thread pool, which adds 10 to 25 ms on a 1024×1024 image. With `node:zlib` our decoder is faster than pngjs (28 ms vs 40 ms).
- **Different from pngjs on purpose:** a `tRNS` pixel keeps its color with alpha 0, gray output uses BT.709 luma, bytes after `IEND` are ignored, and a header claiming more pixels than the data holds throws before allocating (pngjs tried to allocate 40 GB).

## `@portable/charset` API

- **Charset objects imported from subpaths, plus `load(label)` for labels known only at runtime.** A registry keyed by string would pull every table into every bundle. `encode` from the root is 1.0 kB gzipped, one single-byte charset adds 0.6 kB, and the largest family (gbk or big5) is 18 kB.
- **WHATWG labels win over iconv-lite's.** `latin1`, `ascii` and `iso-8859-1` encode as windows-1252, and `gb2312` as GBK, because that is how browsers and `TextDecoder` read them back.
- **An unmappable character becomes `'?'` by default,** as in iconv-lite, which can't inject markup into CSV or email. `'html'`, `'error'` and a function are the other options.
- **No `decode`;** `TextDecoder` covers it. No base64, hex or binary codecs either; those are other packages.
- **Tables are packed varints,** so gb18030 is 17 kB gzipped against iconv-lite's 32 kB. Each charset costs 128 kB of memory after first use.
- **Phase 2, not built yet:** DOS code pages (cp437, cp850), UTF-7, UTF-32 and CESU-8.

## `@portable/base64` API

- **Three decode modes.** `'loose'` (the default) and `'strict'` match the platform's `fromBase64` `lastChunkHandling`. `'mime'` follows RFC 2045 and libbase64: it skips unknown characters, reads both alphabets and never throws. Making libbase64's lenient behavior the default was rejected because silently dropped characters hide corrupt data (base64-js #81).
- **Native `toBase64`/`fromBase64` are used when the runtime has them.** Node 24 doesn't, so Node runs the JavaScript fallback, and Chromium's tests check the fallback against the native methods on over 1,000 inputs. The stream decoder always uses the JavaScript code, to avoid a second path to test.
- **Plain encode and decode have no 25% benchmark assertion against libbase64 and `Buffer`.** Both call C++ `Buffer`, about 6× faster than our JavaScript on Node. The comparisons with base64-js, js-base64 and libbase64's wrapping and streams are asserted, and we win them.
- **`omitPadding` defaults to false even for base64url,** as on the platform, unlike `Buffer` and js-base64. **Wrapping is off by default.**
- **The oracle is libbase64 1.3.3,** because 1.4.x is less than a day old. The cases come from 1.4.1's tests.

## `@portable/dns-packet` API

- **`encode(packet, { compress, framing })` and `decode(bytes, { framing })` are the whole API.** `framing: 'tcp'` replaces `streamEncode`/`streamDecode`. `encodingLength`, writing at an offset and `encode.bytes` are dropped, because `encode` returns an exactly sized array.
- **Compression is off by default.** Queries rarely gain anything from it, and dns-packet's default made output depend on name order.
- **Code tables and flag bits are internal.** Packets carry a `flags` object of booleans, and unnamed codes use RFC 3597 names (`TYPE65534`). An unknown name throws.
- **TXT decodes to `Uint8Array[]`,** which keeps binary and DNS-SD data intact. `@portable/dns` can turn it into text.
- **CAA `flags` keeps the whole byte** and SVCB/HTTPS stay raw bytes, so DNSSEC-signed data re-encodes exactly.
- **No subpath for decode-only use:** encode and decode together are 6.6 kB minified and gzipped, and decode alone 5.7 kB.

## `@portable/quoted-printable` API

- **The oracle is libqp 3.0.1, copied into `test/fixtures/`.** 3.0.1 fixes chunk-dependent output, split UTF-8 sequences and a boundary injection, but it was published hours ago and `minimumReleaseAge` refuses it, tarball URLs included. libqp 2.1.3 is installed from npm for the cases 3.0.1 didn't change. Replace the copy with `libqp@^3.0.1` once it is a day old.
- **A bad `lineLength` throws a `RangeError`.** libqp quietly treats bad values as 76 or 4. A bad option is a programming mistake, so it doesn't need its own error class.
- **No `lineEnding` option,** unlike base64. RFC 2045 requires CRLF for soft breaks, and hard breaks are kept as they are in the input.
- **Strings are UTF-8 in both directions.** libqp's `decode` reads each character's low byte.
- **Linear-time tests run only in Node and retry up to 3 times,** because other processes on the machine made linear runs measure up to 24× slower. A quadratic regression (about 64×) still fails every attempt.

## `@portable/image-size` API

- **`parse(bytes)` and `parseStream(stream, { maxBytes })`.** `parseStream` cancels the stream once it knows the size: it reads 5 KB of a 730 KB JPEG. It takes only a `ReadableStream`, and callers pass `blob.stream()` or `response.body`. `imageSizeFromFile`, `disableTypes` (global state) and `types` were dropped.
- **HEIF size comes from the primary item, with clean aperture and rotation applied.** image-size takes the first or largest `ispe`, which reports a 16×64 image as 63×64 and lists every tile of a tiled photo. HEIF results have no `images` list.
- **A cut-off box-based file throws `TruncatedError`.** When the input ends while searching for a box, a cut file and one missing the box look the same. `TruncatedError` means a prefix of a valid file is never reported as malformed.
- **The oracle runs against npm's image-size 2.0.4,** which is newer than the last public GitHub commit (2.0.2).

## `@portable/exif` API

- **`parse(bytes)` returns one tag object per IFD** (`ifd0`, `exif`, `gps`, `interop`, `ifd1`) plus `latitude`, `longitude`, `imageSize` and `thumbnail`. A merged object lets the thumbnail's `Orientation` replace the image's (exif-parser #30), and GPS and interop tag ids collide.
- **Dates stay strings,** and `parseDate(value, { offset })` turns one into a `Date`. EXIF dates have no time zone, so building a `Date` while parsing would hide a guess.
- **Rationals are numbers** (n/d), as in exif-parser and exif-reader. **Binary values are `Uint8Array` views** into the input, not copies.
- **Only a bad TIFF header or an unknown format throws.** A bad IFD or value skips that item, so damaged files still return what can be read.
- **Tag names are ExifTool's**, as exif-parser and exifr use, plus the EXIF 2.31 and 2.32 tags. Unknown tags are keyed by hex id.

## `@portable/streams` API

- **Chunk types:** only `Uint8Array` and `string`; anything else throws a `TypeError`. get-stream also accepts `ArrayBuffer`, `DataView` and other typed arrays, but the API conventions say bytes are `Uint8Array`, and raw-body's `NaN` length bug came from mixed chunk types. Some callers have to wrap chunks.
- **`transform()` returns `{ readable, writable }`, not a `TransformStream`.** Support for `Transformer.cancel` varies between runtimes, and the generator needs to see cancellation so its `finally` blocks run. The pair still works with `pipeThrough`. Cancelling the output ends `source` instead of throwing into it, as through2 does, so code after the `for await` loop still runs.
- **Operators are factories, not classes.** `map`, `filter`, `tap`, `batch` and `limitBytes` take a function or a number, like the array and iterator helpers. AGENTS.md now allows this for generic operators.
- **`MaxBytesError` is its own class,** because hitting a limit is not truncated, invalid or unsupported input.
- **`concat` and `merge` replace merge2's nested arrays:** `merge2(a, [b, c])` is `concat(a, merge(b, c))`.
- **No limit on `toArray` and no `bufferedData` on errors.** The memory risk is in bytes, and keeping partial data on the error would hold up to `maxBytes` after the caller has given up.
- **`toText` decodes chunk by chunk.** Joining the bytes and decoding once was 37% slower than get-stream.

## Workers tests are not set up yet

- **Options:** `@cloudflare/vitest-pool-workers` in its own workspace package pinned to Vitest 4; a custom script that bundles the conformance tests and runs them in Miniflare; wait.
- **Trade-offs:** the pool-workers package supports only Vitest 4, and Vite+ ships Vitest 5, so the first option means two Vitest versions in one repo. A custom runner is more code to maintain.
- **Chosen:** wait, and rely on the lint rules that reject Node APIs. Revisit when pool-workers supports Vitest 5 or when a package depends on a Workers-specific behavior.

## `maxLength` in `@portable/lines` applies to every line

- **Options:** copy split2, which only checks the unfinished line at the end of each chunk; check every line.
- **Trade-offs:** copying split2 makes the oracle tests match in every case, but then whether a long line is caught depends on chunk boundaries, which the caller doesn't control.
- **Chosen:** check every line. The difference is documented in the README and `PARITY.md`, and the oracle test leaves out `maxLength`.

## No mapper argument in `Lines.DecoderStream`

- **Options:** keep split2's `split2(mapper)`; leave mapping to another `TransformStream`.
- **Trade-offs:** a mapper is shorter to write, but it is a second job inside a package meant for one, and `@portable/streams` will have `map()`.
- **Chosen:** no mapper. The README shows the `TransformStream` equivalent.

## Empty lines are kept by default

- **Options:** split2 keeps them; byline drops them.
- **Chosen:** keep them, as split2 does, because split2 has far more users and dropping data by default is surprising. `skipEmpty: true` gives byline's behavior.

## Git hooks through Vite+ instead of simple-git-hooks

- **Options:** simple-git-hooks with nano-staged (what ox uses); Vite+'s built-in `vp config` hooks and `vp staged`.
- **Trade-offs:** Vite+ already bundles lint-staged and installs a hook dispatcher, so it needs no extra dependencies. simple-git-hooks is better known.
- **Chosen:** Vite+. Hook scripts are plain files in `.vite-hooks/`.

## Benchmarks fail only when the original is more than 25% faster

- **Options:** require us to be faster; allow any slowdown; allow a fixed margin.
- **Trade-offs:** `Lines.DecoderStream` is about 8% slower than split2 on Node, mostly because Web Streams cost more per chunk than Node streams. Requiring a win would block a correct package on Node-specific overhead.
- **Chosen:** a 25% margin, which still catches real regressions. Benchmarks are not in the git hooks, because timing on a laptop is noisy.

## TypeScript 6, not 7

- **Options:** TypeScript 7 (the Go port, now `latest`); TypeScript 6.
- **Trade-offs:** zile and other tools call TypeScript's JavaScript API, which TypeScript 7 doesn't have. arktype keeps TypeScript 6 around for the same reason.
- **Chosen:** 6.0.3 for `tsc` and zile. `vp check` already type-checks with the Go toolchain through tsgolint.

## Open questions from the package plan

- **Umbrella `portable` package:** not claimed yet. It needs an npm publish from the owner's account, and nothing depends on it until several packages exist.
- **content-disposition and cookie-signature:** point to `@remix-run/headers` and `@remix-run/cookie` instead of building them. Both are maintained, dependency-free and web-standard.
- **Package names:** `mime-headers` and `mime-stream`. MIME is the format they handle, and the same code applies to non-mail MIME such as `multipart/related`.
- **`@portable/dns`:** yes, as a separate package from `dns-packet`, because SPF and DMARC need a resolver and `dns-packet` users don't.
- **License:** MIT, the same as almost every library we replace.

## Agent skills live in `.agents/pstack/`

- **Options:** `.claude/pstack/` (the first instruction); `.agents/pstack/` (the follow-up).
- **Chosen:** `.agents/pstack/` holds the copies. `.claude/skills/<name>` and `.agents/skills/<name>` are symlinks, so Claude Code and agents that read `.agents/skills` both find them. AGENTS.md is the guide, and CLAUDE.md imports it with `@AGENTS.md`.

## `Exif.parseStream` limits memory, not bytes read

- **Options:** `maxBytes` as the most bytes read from the stream, as in `ImageSize.parseStream`; `maxBytes` as the most bytes held in memory at once.
- **Trade-offs:** WebP files usually store the `EXIF` chunk after the image data, and PNG files may store `eXIf` after `IDAT`. A limit on bytes read would fail on those files at any default small enough to matter, even though `parseStream` skips the image data without keeping it. Callers who need to limit the download can pipe the body through `Streams.limitBytes`.
- **Chosen:** bytes held in memory, with a 16 MiB default. TIFF files and HEIF files with `mdat` before `meta` are held whole, so the limit applies to them.

## `Exif.parseStream` reads the thumbnail only from the EXIF data

- **Options:** keep every byte up to the thumbnail; take `thumbnail.bytes` from the EXIF segment or chunk only.
- **Trade-offs:** `parse` slices the thumbnail from the whole input, so in a malformed JPEG whose IFD1 points past the APP1 segment it still returns bytes. Keeping everything up to that point would undo the skipping.
- **Chosen:** the EXIF segment or chunk only. In valid files the thumbnail is inside it, and `parseStream` returns the same result as `parse` on every fixture.

## `Streams.tee` defaults to 16 chunks or 64 KiB

- **Options:** no default, so every caller picks a limit; the platform default of 1 chunk; `Infinity`, as the platform's `tee()` behaves; Node's stream defaults of 16 objects or 64 KiB.
- **Trade-offs:** 1 chunk makes the fastest branch wait for the slowest on every chunk, which loses most of the point of reading branches at the same time. `Infinity` brings back the unbounded buffering that `tee` exists to prevent. A required option adds a decision to every call, when most callers only need some bound.
- **Chosen:** Node's defaults, 16 chunks with `unit: 'chunks'` and 65536 bytes with `unit: 'bytes'`. Node users already know these numbers, and they bound memory to 16 chunks or 64 KiB for each slow branch.
