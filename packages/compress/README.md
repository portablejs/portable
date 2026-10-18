# @portable/compress

One-shot gzip and deflate, a decompression stream with an output limit, and CRC-32. Built on the platform's `CompressionStream` and `DecompressionStream`, so it runs in browsers, Cloudflare Workers, Deno, Bun and Node 24+ and ships no compression code of its own.

Replaces the one-shot use of [pako](https://www.npmjs.com/package/pako) and [fflate](https://www.npmjs.com/package/fflate), and `node:zlib`'s `gzipSync`, `gunzipSync`, `deflateSync`, `inflateSync` and `crc32`.

```sh
npm install @portable/compress
```

```ts
import * as Compress from '@portable/compress'

const gzipped = await Compress.encode('hello world')
const bytes = await Compress.decode(gzipped, { maxLength: 10_000_000 })

const response = await fetch('https://example.com/export.ndjson.gz')
const body = response.body!.pipeThrough(new Compress.DecoderStream({ maxLength: 1_000_000_000 }))
```

## API

| Export | Description |
| --- | --- |
| `encode(data, { format })` | Compresses a `Uint8Array` or a string (as UTF-8). Returns `Promise<Uint8Array>`. |
| `decode(data, { format, maxLength })` | Decompresses a `Uint8Array`. Returns `Promise<Uint8Array>`. A gzip file with several members decodes to all of them joined. |
| `new DecoderStream({ format, maxLength })` | A `TransformStream<Uint8Array, Uint8Array>` that decompresses. |
| `crc32(data, previous?)` | The CRC-32 of a `Uint8Array` or a string (as UTF-8). Pass the previous result to continue a checksum over several pieces. |
| `Format` | `'gzip' \| 'deflate' \| 'deflate-raw'`: gzip (RFC 1952), zlib (RFC 1950) and raw deflate (RFC 1951), the formats the platform supports. |

| Option | Default | Description |
| --- | --- | --- |
| `format` | `'gzip'` | The compressed format. |
| `maxLength` | `Infinity` | The most bytes the output may hold. Past it, `decode` rejects and `DecoderStream` fails and cancels its input, both with `MaxLengthError`. |

There is no compression level option and no dictionary, because `CompressionStream` has neither. To compress a stream, use the platform's `CompressionStream`.

### Errors

| Error | When |
| --- | --- |
| `TruncatedError` | The input ended before the compressed stream did. |
| `InvalidInputError` | The input is malformed, fails its checksum, or has bytes after its end. |
| `MaxLengthError` | The output grew past `maxLength`. Its `maxLength` property holds the limit. |

The platform reports every failure as a `TypeError`. The error's `cause` holds it.

## Why use this over pako, fflate and node:zlib

pako and fflate implement deflate in JavaScript, although every runtime already ships it natively. pako is 45 kB minified (14 kB gzipped), and fflate ships its own inflate and deflate too. `node:zlib` runs only in Node and Bun.

- `decode` checks the gzip CRC-32 and length. fflate checks neither, so corrupt data decodes to wrong bytes, and it allocates its output from the length field, so a forged field returns truncated output (fflate #161, #181).
- `maxLength` stops a zip bomb. pako and fflate have no output limit (pako #310).
- Truncated input always throws `TruncatedError`, never partial output.
- `decode` reads every member of a multi-member gzip file, such as BGZF or `cat a.gz b.gz`. fflate returns only the first member (fflate #102), and `DecompressionStream` throws.
- `DecoderStream` joins input chunks that arrive while the decompressor is busy. `DecompressionStream`'s output chunks are only as large as the input chunk allows, so 1 KiB network chunks of gzip give about 4 KiB of output each, and each chunk pays the decompressor's and every later stage's per-chunk cost. On Node, 32 MB of gzipped JSON sent as 1 KiB chunks, followed by three more transforms, decoded in 196 ms with `DecoderStream` and 253 ms with `DecompressionStream`, with 3,728 output chunks instead of 8,346.

Fastest run on Node 24 from `compress.bench.ts`, on a 4-core machine shared with other jobs, so treat the ratios as rough (lower is better):

| 1 MB of text | @portable/compress | pako | fflate | node:zlib |
| --- | --- | --- | --- | --- |
| gzip | 20 ms | 209 ms | 57 ms | 82 ms |
| gunzip | 2.8 ms | 16 ms | 4.0 ms | 1.7 ms |
| crc32 | 0.75 ms | | | 0.22 ms |

`crc32` runs in JavaScript, at the speed of the `crc-32` package (0.72 ms). `node:zlib`'s is native code.

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
| `zlib.gunzipSync(data, { maxOutputLength })` | `await Compress.decode(data, { maxLength })` |
| `zlib.createGunzip()`, `new fflate.Gunzip()`, `new pako.Inflate()` | `new Compress.DecoderStream()` |
| `zlib.crc32(data, value)` | `Compress.crc32(data, previous)` |
| `{ level }`, `{ dictionary }`, `{ strategy }` | Not supported by `CompressionStream`. Keep fflate for these. |

Behavior that differs on purpose:

- Every function is async, because `CompressionStream` is. There are no sync variants.
- Bytes after the end of the data throw `InvalidInputError`. `node:zlib` and pako ignore them, including a second zlib stream and zero padding after a gzip member.
- `DecoderStream` reads one gzip member, as `DecompressionStream` does, and a second member fails with `InvalidInputError`. `decode` reads them all.
- How a zlib header that declares a smaller window than the data uses is handled depends on the runtime: Chromium decodes it, as pako does, and Node throws `InvalidInputError`.
