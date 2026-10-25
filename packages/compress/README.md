# @portable/compress

One-shot gzip and deflate, a decompression stream with an output limit, and CRC-32, built on the platform's `CompressionStream` and `DecompressionStream`, so it ships no compression code of its own. Runs in browsers, Cloudflare Workers, Deno, Bun and Node 24+.

Replaces the one-shot use of [pako](https://www.npmjs.com/package/pako) and [fflate](https://www.npmjs.com/package/fflate), and `node:zlib`'s `gzipSync`, `gunzipSync`, `deflateSync`, `inflateSync` and `crc32`.

```sh
npm install @portable/compress
```

```ts
import * as Compress from '@portable/compress';

const gzipped = await Compress.encode('hello world');
const bytes = await Compress.decode(gzipped, { maxBytes: 10_000_000 });

const response = await fetch('https://example.com/export.ndjson.gz');
const body = response.body!.pipeThrough(new Compress.DecoderStream({ maxBytes: 1_000_000_000 }));
```

## API

| Export | Description |
| --- | --- |
| `encode(data, { format, signal })` | Compresses a `Uint8Array` or a string (as UTF-8). Returns `Promise<Uint8Array>`. |
| `decode(data, { format, maxBytes, signal })` | Decompresses a `Uint8Array`. Returns `Promise<Uint8Array>`. A gzip file with several members decodes to all of them joined. |
| `new DecoderStream({ format, maxBytes, signal })` | A `TransformStream<Uint8Array, Uint8Array>` that decompresses. |
| `crc32(data, previous?)` | The CRC-32 of a `Uint8Array` or a string (as UTF-8). Pass the previous result to continue a checksum over several pieces. |
| `Format` | `'gzip' \| 'deflate' \| 'deflate-raw'`: gzip (RFC 1952), zlib (RFC 1950) and raw deflate (RFC 1951), the formats the platform supports. |

| Option | Default | Description |
| --- | --- | --- |
| `format` | `'gzip'` | The compressed format. |
| `maxBytes` | `Infinity` | The most bytes the output may hold. Past it, `decode` rejects and `DecoderStream` fails and cancels its input, both with `MaxBytesError`. |
| `signal` | | When it aborts, `encode` and `decode` reject with `signal.reason`, and `DecoderStream` fails with it and cancels its input. |

There is no compression level option and no dictionary, because `CompressionStream` has neither. To compress a stream, use the platform's `CompressionStream`.

### Errors

| Error | When |
| --- | --- |
| `TruncatedError` | The input ended before the compressed stream did. |
| `InvalidInputError` | The input is malformed, fails its checksum, or has bytes after its end. |
| `MaxBytesError` | The output grew past `maxBytes`. Its `maxBytes` property holds the limit. |

The platform reports every failure as a `TypeError`, and each of these errors stores that `TypeError` as its `cause`.

## Types

| Type | Description |
| --- | --- |
| `Compress.Format` | `'gzip'`, `'deflate'` (zlib) or `'deflate-raw'`. |

## Why use this over pako, fflate and node:zlib

pako and fflate implement deflate in JavaScript, although every runtime already ships it natively. pako is 45 kB minified (13 kB gzipped), and fflate ships its own inflate and deflate too. `node:zlib` doesn't run in browsers, and Cloudflare Workers need the `nodejs_compat` flag for it.

- `decode` checks the gzip CRC-32 and length. fflate checks neither, so corrupt data decodes to wrong bytes, and fflate allocates its output from the length field, so a forged length gives truncated output (fflate #161, #181).
- `maxBytes` stops a zip bomb. pako and fflate have no output limit (pako #310).
- `decode` and `DecoderStream` throw `TruncatedError` for truncated input instead of returning partial output, and `InvalidInputError` for a bad trailer, in every runtime. Deno's `DecompressionStream` returns partial output for a cut-short deflate stream and reports a bad gzip trailer as input that ended early, so on Deno they check the end of the stream and the trailer themselves.
- `decode` reads every member of a multi-member gzip file, such as BGZF or `cat a.gz b.gz`. fflate returns only the first member (fflate #102), and `DecompressionStream` throws.
- `DecoderStream` joins input chunks that arrive while the decompressor is busy. `DecompressionStream`'s output chunks are only as large as the input chunk allows, so 1 KiB network chunks of gzip give about 4 KiB of output each, and every chunk adds the per-chunk cost of the decompressor and of each later stage. On Node, 32 MB of gzipped JSON sent as 1 KiB chunks, followed by three more transforms, decoded in 196 ms with `DecoderStream` and 253 ms with `DecompressionStream`, with 3,728 output chunks instead of 8,346.

In Node, `decode` gunzips more slowly than fflate and `node:zlib`, because Node's `DecompressionStream` passes each 16 KiB of output through the libuv thread pool, and on a busy machine each pass waits for a thread. `crc32` runs in JavaScript at about the speed of the `crc-32` package, and `node:zlib`'s runs in native code.

<!-- bench:start -->
| Benchmark | Library | Ops/s | Relative | |
| --- | --- | ---: | --- | --- |
| Gzip 1 MB of text | `node:zlib` | 46.3 | 1.1× faster | ████████████ |
|  | **@portable/compress** | 42.3 |  | ███████████ |
|  | fflate | 22.8 | 1.9× slower | █████▉ |
|  | pako | 21.7 | 1.9× slower | █████▋ |
| | | | | |
| Gunzip 1 MB of text | `node:zlib` | 523 | 2.9× faster | ████████████ |
|  | fflate | 228 | 1.3× faster | █████▎ |
|  | **@portable/compress** | 181 |  | ████▏ |
|  | pako | 135 | 1.3× slower | ███▏ |
| | | | | |
| Gunzip a stream of 1 KiB chunks | `node:zlib` | 113 | same | ████████████ |
|  | **@portable/compress** | 111 |  | ███████████▊ |
|  | `DecompressionStream` | 96.7 | 1.1× slower | ██████████▎ |
|  | fflate | 54.7 | 2.0× slower | █████▊ |
| | | | | |
| CRC-32 of 1 MB | `node:zlib` | 4,250 | 3.3× faster | ████████████ |
|  | crc-32 | 1,410 | 1.1× faster | ████ |
|  | **@portable/compress** | 1,290 |  | ███▋ |

Operations per second from `pnpm bench`, higher is better, in Node 24.22.0, on Intel(R) Xeon(R) Processor @ 2.10GHz (4 cores). Each benchmark lists only the libraries that can do the same work, fastest first. The relative speed compares each library with @portable/compress, and the bars are scaled to the fastest library.

| Library | Version | Minified and gzipped | Runtime dependencies | Node built-ins | TypeScript types |
| --- | --- | ---: | ---: | --- | --- |
| @portable/compress | – | 2.4 kB | 2 | none | included |
| pako | 3.0.2 | 13 kB | 0 | none | included |
| fflate | 0.8.3 | 12 kB | 0 | none | included |
| crc-32 | 1.2.2 | 1.1 kB | 0 | none | included |
| `node:zlib` | – | built in | – | Node only | – |
| `DecompressionStream` | – | built in | – | none | – |

Sizes cover the imports in the usage example, or the equivalent imports of each library, bundled for the browser by `scripts/bundle-size.ts`. Runtime dependencies count every package installed with the published package. A library that uses Node built-ins needs polyfills in a browser and the `nodejs_compat` flag in Cloudflare Workers.
<!-- bench:end -->

Differences to check when you switch:

- pako, fflate and `node:zlib` have sync functions. Every function here is async, because `CompressionStream` is.
- The `strategy` option of pako, fflate and `node:zlib` has no equivalent. Keep fflate if you need a level, a dictionary or a strategy.
- `node:zlib` and pako ignore bytes after the end of the data, including a second zlib stream and zero padding after a gzip member. `decode` and `DecoderStream` fail with `InvalidInputError` on them.
- `zlib.createGunzip()` reads every gzip member. `DecoderStream` reads one, as `DecompressionStream` does, and fails with `InvalidInputError` on a second. `decode` reads them all.
- pako decodes a zlib stream whose header declares a smaller window than the data uses. `decode` decodes it too in Chromium, and throws `InvalidInputError` in Node.
