# Decisions

Calls made without the owner's input, with the options considered and the reason for the choice. Newest first. Change any of them by replying in the project thread or editing this file.

## Tests are a separate workspace package in `packages/<name>/test/`

- **Options:** `src/_test/` inside each package (the first layout); a sibling `test/` directory with its own `package.json` (the owner's suggestion).
- **Trade-offs:** a separate package keeps upstream libraries, their `@types` and Node types out of the published `package.json`, and makes tests import the package by name through its `exports` map. It adds one workspace package per package. Unexported code can still be tested by importing it by path.
- **Chosen:** `test/`, named `@portable/<name>-test`. Shared tools (Vitest, TypeScript, Playwright, `@types/node`) stay in the root. `tsconfig.test.json` type-checks every test directory, which `tsc -b` didn't do before.

## `@portable/json-stream` API

- **`ParserStream({ paths })` emits `{ path, value }` for values at JSONPath expressions; `NdjsonDecoderStream` and `NdjsonEncoderStream` handle NDJSON; `encode(value)` returns a `ReadableStream<string>`.** The API review may rename these; `encode` returning a stream differs from other packages' `encode`.
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
- **The decode benchmark allows 50%, not 25%.** Plain Node on the build is 1.8× faster than dns-packet, but Vitest's export getters make our source 20% slower inside the benchmark (see papercuts.md).

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

## No mapper argument in `LineStream`

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
- **Trade-offs:** `LineStream` is about 8% slower than split2 on Node, mostly because Web Streams cost more per chunk than Node streams. Requiring a win would block a correct package on Node-specific overhead.
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
