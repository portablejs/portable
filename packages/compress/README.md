# @portable/compress

One-shot gzip and deflate, a decompression stream with an output limit, and CRC-32. It uses the platform's `CompressionStream` and `DecompressionStream`, so it ships no compression code of its own. Runs in browsers, Cloudflare Workers, Node 24+, Bun, and Deno.

Replaces the one-shot use of [pako](https://www.npmjs.com/package/pako) and [fflate](https://www.npmjs.com/package/fflate), and `node:zlib`'s `gzipSync`, `gunzipSync`, `deflateSync`, `inflateSync`, and `crc32`.

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
| `new DecoderStream({ format, maxBytes, signal })` | A `TransformStream<Uint8Array, Uint8Array>` that decompresses. Reads one gzip member, as `DecompressionStream` does, and fails with `InvalidInputError` if another follows. |
| `crc32(data, previous?)` | The CRC-32 of a `Uint8Array` or a string (as UTF-8). Pass the previous result to continue a checksum over several pieces. |
| `Format` | `'gzip' \| 'deflate' \| 'deflate-raw'`: gzip (RFC 1952), zlib (RFC 1950), and raw deflate (RFC 1951), the formats the platform supports. |

| Option | Default | Description |
| --- | --- | --- |
| `format` | `'gzip'` | The compressed format. For any other value, `CompressionStream` and `DecompressionStream` throw a `TypeError`. |
| `maxBytes` | `Infinity` | The most bytes the output may hold. If the output exceeds it, `decode` rejects with `MaxBytesError`, and `DecoderStream` fails with `MaxBytesError` and cancels its input. For a negative number or `NaN`, `decode` rejects and `new DecoderStream` throws, both with a `RangeError`. |
| `signal` | | When it aborts, `encode` and `decode` reject with `signal.reason`, and `DecoderStream` fails with it and cancels its input. |

`CompressionStream` has no compression level or dictionary, so neither does this package. To compress a stream, use `CompressionStream` directly.

### Errors

| Error | When |
| --- | --- |
| `TruncatedError` | The input ended before the compressed stream did. |
| `InvalidInputError` | The input is malformed, fails its checksum, or has bytes after its end. |
| `MaxBytesError` | The output grew past `maxBytes`. Its `maxBytes` property holds the limit. |

When `DecompressionStream` fails, the package throws `TruncatedError` or `InvalidInputError` with the platform's `TypeError` as `cause`. Errors from the package's own checks, such as a bad gzip header, have no `cause`.

## Types

| Type | Description |
| --- | --- |
| `Compress.Format` | `'gzip'`, `'deflate'` (zlib), or `'deflate-raw'`. |

## Why use this over pako, fflate, and node:zlib

pako and fflate ship their own deflate code (pako is 13 kB gzipped), though every runtime has it built in. `node:zlib` doesn't run in browsers, and needs the `nodejs_compat` flag in Cloudflare Workers.

- `decode` checks the gzip CRC-32 and length. fflate checks neither, so corrupt data or a forged length gives wrong or truncated output (fflate #161, #181).
- `maxBytes` stops a zip bomb. pako and fflate have no output limit (pako #310).
- Truncated input throws `TruncatedError` instead of returning partial output, and a bad trailer throws `InvalidInputError`, in every runtime including Deno, whose `DecompressionStream` gets both wrong.
- `decode` reads every member of a multi-member gzip file, such as BGZF or `cat a.gz b.gz`. fflate returns only the first member (fflate #102), and `DecompressionStream` throws.
- `DecoderStream` merges small input chunks, so it emits fewer, larger chunks than `DecompressionStream`. On Node, 32 MB of gzipped JSON in 1 KiB chunks, followed by three more transforms, took 196 ms instead of 253 ms.

In Node, `decode` gunzips more slowly than fflate and `node:zlib`, because Node's `DecompressionStream` passes each 16 KiB of output through the libuv thread pool. `crc32` runs in JavaScript at about the speed of the crc-32 package, and `node:zlib`'s runs in native code.

<!-- bench:start -->
<table>
<thead><tr><th align="left">Library</th><th align="right">Ops/s</th><th align="left">Relative</th><th></th></tr></thead>
<tbody>
<tr><th colspan="4" align="left">Gzip 1 MB of text</th></tr>
<tr><td><code>node:zlib</code></td><td align="right">46.3</td><td>1.1× faster</td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="160" height="12" alt="" /></td></tr>
<tr><td>@portable/compress</td><td align="right">42.3</td><td></td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="146" height="12" alt="" /></td></tr>
<tr><td>fflate</td><td align="right">22.8</td><td>1.9× slower</td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="79" height="12" alt="" /></td></tr>
<tr><td>pako</td><td align="right">21.7</td><td>1.9× slower</td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="75" height="12" alt="" /></td></tr>
<tr><th colspan="4" align="left">Gunzip 1 MB of text</th></tr>
<tr><td><code>node:zlib</code></td><td align="right">523</td><td>2.9× faster</td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="160" height="12" alt="" /></td></tr>
<tr><td>fflate</td><td align="right">228</td><td>1.3× faster</td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="70" height="12" alt="" /></td></tr>
<tr><td>@portable/compress</td><td align="right">181</td><td></td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="55" height="12" alt="" /></td></tr>
<tr><td>pako</td><td align="right">135</td><td>1.3× slower</td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="41" height="12" alt="" /></td></tr>
<tr><th colspan="4" align="left">Gunzip a stream of 1 KiB chunks</th></tr>
<tr><td><code>node:zlib</code></td><td align="right">113</td><td>same</td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="160" height="12" alt="" /></td></tr>
<tr><td>@portable/compress</td><td align="right">111</td><td></td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="157" height="12" alt="" /></td></tr>
<tr><td><code>DecompressionStream</code></td><td align="right">96.7</td><td>1.1× slower</td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="137" height="12" alt="" /></td></tr>
<tr><td>fflate</td><td align="right">54.7</td><td>2.0× slower</td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="77" height="12" alt="" /></td></tr>
<tr><th colspan="4" align="left">CRC-32 of 1 MB</th></tr>
<tr><td><code>node:zlib</code></td><td align="right">4,250</td><td>3.3× faster</td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="160" height="12" alt="" /></td></tr>
<tr><td>crc-32</td><td align="right">1,410</td><td>1.1× faster</td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="53" height="12" alt="" /></td></tr>
<tr><td>@portable/compress</td><td align="right">1,290</td><td></td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="49" height="12" alt="" /></td></tr>
</tbody>
</table>

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

- Every function here is async, because `CompressionStream` is. pako, fflate, and `node:zlib` have sync functions.
- There is no `strategy` option. Keep fflate if you need a level, a dictionary, or a strategy.
- `node:zlib` and pako ignore bytes after the end of the data, such as a second zlib stream or zero padding after a gzip member. `decode` and `DecoderStream` fail with `InvalidInputError`.
- `zlib.createGunzip()` reads every gzip member. `DecoderStream` reads one and fails with `InvalidInputError` on a second. `decode` reads them all.
- pako decodes a zlib stream whose header declares a smaller window than the data uses. `decode` does too in Chromium, but throws `InvalidInputError` in Node.
