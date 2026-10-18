# Decisions

Calls made without the owner's input, with the options considered and the reason for the choice. Newest first. Change any of them by replying in the project thread or editing this file.

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
