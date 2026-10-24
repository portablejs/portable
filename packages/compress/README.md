# @portable/compress

One-shot gzip and deflate, a decompression stream with an output limit, and CRC-32, built on the platform's `CompressionStream` and `DecompressionStream`, so it ships no compression code of its own. Runs in browsers, Cloudflare Workers, Deno, Bun and Node 24+.

Replaces the one-shot use of [pako](https://www.npmjs.com/package/pako) and [fflate](https://www.npmjs.com/package/fflate), and `node:zlib`'s `gzipSync`, `gunzipSync`, `deflateSync`, `inflateSync` and `crc32`.

```sh
npm install @portable/compress
```

```ts
import * as Compress from '@portable/compress'

const gzipped = await Compress.encode('hello world')
const bytes = await Compress.decode(gzipped, { maxBytes: 10_000_000 })

const response = await fetch('https://example.com/export.ndjson.gz')
const body = response.body!.pipeThrough(new Compress.DecoderStream({ maxBytes: 1_000_000_000 }))
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

The platform reports every failure as a `TypeError`. The error's `cause` holds it.

## Types

| Type | Description |
| --- | --- |
| `Compress.Format` | `'gzip'`, `'deflate'` (zlib) or `'deflate-raw'`. |

## Why use this over pako, fflate and node:zlib

pako and fflate implement deflate in JavaScript, although every runtime already ships it natively. pako is 45 kB minified (14 kB gzipped), and fflate ships its own inflate and deflate too. `node:zlib` runs only in Node and Bun.

- `decode` checks the gzip CRC-32 and length. fflate checks neither, so corrupt data decodes to wrong bytes, and fflate allocates its output from the length field, so a forged length gives truncated output (fflate #161, #181).
- `maxBytes` stops a zip bomb. pako and fflate have no output limit (pako #310).
- Truncated input always gives `TruncatedError`, never partial output.
- `decode` reads every member of a multi-member gzip file, such as BGZF or `cat a.gz b.gz`. fflate returns only the first member (fflate #102), and `DecompressionStream` throws.
- `DecoderStream` joins input chunks that arrive while the decompressor is busy. `DecompressionStream`'s output chunks are only as large as the input chunk allows, so 1 KiB network chunks of gzip give about 4 KiB of output each, and each chunk pays the decompressor's and every later stage's per-chunk cost. On Node, 32 MB of gzipped JSON sent as 1 KiB chunks, followed by three more transforms, decoded in 196 ms with `DecoderStream` and 253 ms with `DecompressionStream`, with 3,728 output chunks instead of 8,346.

`gunzip` has the fastest single run of the JavaScript options, but a worse mean: Node's `DecompressionStream` passes each 16 KiB of output through the libuv thread pool, and on a busy machine each pass waits for a thread. `crc32` runs in JavaScript at the speed of the `crc-32` package (0.66 / 0.77). `node:zlib`'s is native code.

<!-- bench:start -->
| | @portable/compress | pako | fflate | crc-32 | `node:zlib` | `DecompressionStream` |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Gzip 1 MB of text | 42.3 | 21.7 | 22.8 | – | 46.3 | – |
| Gunzip 1 MB of text | 181 | 135 | 228 | – | 523 | – |
| Gunzip a stream of 1 KiB chunks | 111 | – | 54.7 | – | 113 | 96.7 |
| CRC-32 of 1 MB | 1,290 | – | – | 1,410 | 4,250 | – |

Operations per second from `pnpm bench`, higher is better, in Node 24.22.0, on Intel(R) Xeon(R) Processor @ 2.10GHz (4 cores). A dash means the library has no equivalent.

| | @portable/compress | pako | fflate | crc-32 | `node:zlib` | `DecompressionStream` |
| --- | --- | --- | --- | --- | --- | --- |
| Minified and gzipped | 1.3 kB | 13 kB | 12 kB | 1.1 kB | built in | built in |
| Runtime dependencies | 0 | 0 | 0 | 0 | – | – |
| Node built-ins used | none | none | none | none | Node only | none |
| TypeScript types | included | included | included | included | – | – |
| Version compared | – | 3.0.2 | 0.8.3 | 1.2.2 | – | – |

Sizes cover the imports in the usage example, or the equivalent imports of each library, bundled for the browser by `scripts/bundle-size.ts`. Runtime dependencies count every package installed with the published package. A library that uses Node built-ins needs polyfills in a browser and the `nodejs_compat` flag in Cloudflare Workers.
<!-- bench:end -->

## Migrating

| pako / fflate / node:zlib | @portable/compress |
| --- | --- |
| `pako.gzip(data)`, `fflate.gzipSync(data)`, `zlib.gzipSync(data)` | `await Compress.encode(data)` |
| `pako.ungzip(data)`, `fflate.gunzipSync(data)`, `zlib.gunzipSync(data)` | `await Compress.decode(data)` |
| `pako.deflate(data)`, `fflate.zlibSync(data)`, `zlib.deflateSync(data)` | `await Compress.encode(data, { format: 'deflate' })` |
| `pako.inflate(data)`, `fflate.unzlibSync(data)`, `zlib.inflateSync(data)` | `await Compress.decode(data, { format: 'deflate' })` |
| `pako.deflateRaw(data)`, `fflate.deflateSync(data)`, `zlib.deflateRawSync(data)` | `await Compress.encode(data, { format: 'deflate-raw' })` |
| `pako.inflateRaw(data)`, `fflate.inflateSync(data)`, `zlib.inflateRawSync(data)` | `await Compress.decode(data, { format: 'deflate-raw' })` |
| `pako.inflate(data, { to: 'string' })`, `fflate.strFromU8(...)` | `new TextDecoder().decode(await Compress.decode(data))` |
| `zlib.gunzipSync(data, { maxOutputLength })` | `await Compress.decode(data, { maxBytes })` |
| `zlib.createGunzip()`, `new fflate.Gunzip()`, `new pako.Inflate()` | `new Compress.DecoderStream()` |
| `zlib.crc32(data, value)` | `Compress.crc32(data, previous)` |
| `{ level }`, `{ dictionary }`, `{ strategy }` | Not supported by `CompressionStream`. Keep fflate for these. |

Behavior that differs on purpose:

- Every function is async, because `CompressionStream` is. There are no sync variants.
- `decode` and `DecoderStream` fail with `InvalidInputError` on bytes after the end of the data. `node:zlib` and pako ignore them, including a second zlib stream and zero padding after a gzip member.
- `DecoderStream` reads one gzip member, as `DecompressionStream` does, and fails with `InvalidInputError` on a second member. `decode` reads them all.
- Runtimes differ on a zlib header that declares a smaller window than the data uses. Chromium decodes it, as pako does, and Node throws `InvalidInputError`.
