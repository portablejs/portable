# @portable/png

Decodes PNG files to 8-bit RGBA pixels and encodes RGBA pixels as PNG. Runs in browsers, Cloudflare Workers, Deno, Bun and Node 24+, with no dependencies: zlib comes from the platform's `CompressionStream` and `DecompressionStream`.

Replaces [pngjs](https://www.npmjs.com/package/pngjs).

## Why use this over pngjs

pngjs is built on Node's `zlib` and streams. This package takes zlib from `CompressionStream` and `DecompressionStream`, so it runs in browsers and Workers with no dependencies.

- A header that claims more pixels than the data can hold throws before anything is allocated. pngjs sizes its buffer from the header alone, and a 100000×100000 header with 19 bytes of image data made it try to allocate 40 GB.
- Decoding a 1024×1024 image with `decodeSync` and `node:zlib` was about 1.4× faster than pngjs. The default `decode` was about 1.2× slower than pngjs in Node, because Node's `DecompressionStream` hands zlib one 16 KiB chunk at a time to the thread pool.
- Encoding with `CompressionStream` was about as fast as pngjs at the same zlib settings, and `encodeSync` with pngjs's defaults (level 9, `Z_RLE`) was about 1.3× faster than pngjs.
- A file with no `IDAT` throws `InvalidInputError`. pngjs's stream parser calls back with neither an error nor an image.
- Bytes after `IEND` are ignored. `PNG.sync.read` throws on them, including on a file that pngjs's own async test parses.

```sh
npm install @portable/png
```

```ts
import * as Png from '@portable/png'

const response = await fetch('https://example.com/photo.png')
const { width, height, data } = await Png.decode(await response.bytes())

for (let i = 0; i < data.length; i += 4) data[i] = 255 - data[i]! // invert red
const bytes = await Png.encode({ width, height, data })
```

`decode` reads every PNG color type (grayscale, RGB, palette, each with or without alpha), bit depths 1, 2, 4, 8 and 16, Adam7 interlacing, and `tRNS` transparency. The result is always 8-bit RGBA: 16-bit samples are rounded to 8 bits, and lower depths are scaled up, so a 1-bit white is 255. Gamma is reported but not applied.

## Sync or async

`decode` and `encode` return promises, because `CompressionStream` and `DecompressionStream` are the only zlib that every runtime has, and they are async. `decodeSync` and `encodeSync` do the same work synchronously with a zlib function you pass:

```ts
import * as Png from '@portable/png'
import { unzlibSync, zlibSync } from 'fflate'

const image = Png.decodeSync(bytes, { inflate: unzlibSync })
const png = Png.encodeSync(image, { deflate: (raw) => zlibSync(raw, { level: 9 }) })
```

In Node, `inflateSync` and `deflateSync` from `node:zlib` work too. Both functions use the zlib format (RFC 1950), not raw deflate.

## API

### `decode(bytes: Uint8Array, options?): Promise<Decoded>`

### `decodeSync(bytes: Uint8Array, options): Decoded`

| Option | Default | Description |
| --- | --- | --- |
| `inflate` | `DecompressionStream('deflate')` | Decompresses zlib data. Required for `decodeSync`. `decode` also accepts an async function. |
| `checkCrc` | `true` | Verify each chunk's CRC. The zlib checksum is always verified by the inflate function. |

`Decoded` is a plain object:

| Field | Description |
| --- | --- |
| `width`, `height` | Pixels. |
| `data` | `Uint8Array` of 8-bit RGBA, four bytes per pixel, row by row from the top left. |
| `depth` | The file's bit depth: 1, 2, 4, 8 or 16. |
| `colorType` | The file's color type: 0 grayscale, 2 RGB, 3 palette, 4 grayscale with alpha, 6 RGBA. |
| `interlace` | Whether the file is Adam7 interlaced. |
| `alpha` | Whether the file has an alpha channel or a `tRNS` chunk. |
| `gamma` | The `gAMA` value, such as `0.45455`, or `undefined`. |

Bytes after `IEND` are ignored. Unknown ancillary chunks are skipped.

### `encode(image: RgbaImage, options?): Promise<Uint8Array>`

### `encodeSync(image: RgbaImage, options): Uint8Array`

`image` is `{ width, height, data, gamma? }` with 8-bit RGBA `data` (`Uint8Array` or `Uint8ClampedArray`), so a `Decoded` result or a canvas `ImageData` can be passed as is. When `gamma` is set, it is written to a `gAMA` chunk.

| Option | Default | Description |
| --- | --- | --- |
| `deflate` | `CompressionStream('deflate')` | Compresses to zlib format. Required for `encodeSync`. Pass one to choose a compression level. |
| `colorType` | `6` | `0` grayscale, `2` RGB, `4` grayscale with alpha or `6` RGBA. Gray is the BT.709 luma of each pixel. |
| `background` | `{ red: 255, green: 255, blue: 255 }` | Color that semi-transparent pixels are blended onto for color types without alpha. |
| `filter` | `[0, 1, 2, 3, 4]` | A filter for every row (0 none, 1 sub, 2 up, 3 average, 4 Paeth), or a list to choose from per row. With a list, each row gets the filter whose output has the smallest sum as signed bytes, as libpng does. |

The encoder writes 8-bit, non-interlaced files with one `IDAT` chunk.

### Errors

| Error | Thrown when |
| --- | --- |
| `TruncatedError` | The file ends before `IEND` or inside a chunk, or holds less image data than its header describes. |
| `InvalidInputError` | The input is malformed: a bad signature, a CRC mismatch, an invalid header, a bad filter type, a palette index out of range, or zlib data that fails to decompress (the cause is in `error.cause`). `encode` throws it for `data` of the wrong length or an invalid `filter`. |
| `UnsupportedError` | The file has an unknown critical chunk, or a compression, filter or interlace method PNG doesn't define. `encode` throws it for `colorType` 3. |

Their `name`s are `Png.TruncatedError`, `Png.InvalidInputError` and `Png.UnsupportedError`.

## Migrating from pngjs

| pngjs | @portable/png |
| --- | --- |
| `PNG.sync.read(buffer)` | `await Png.decode(bytes)`, or `Png.decodeSync(bytes, { inflate: zlib.inflateSync })` |
| `stream.pipe(new PNG()).on('parsed', function () { this.data })` | `(await Png.decode(bytes)).data` |
| `PNG.sync.write(png)` | `await Png.encode(png)` |
| `new PNG({ width, height })` then filling `png.data` | `Png.encode({ width, height, data })` with your own `Uint8Array(width * height * 4)` |
| `{ checkCRC: false }` | `{ checkCrc: false }` |
| `{ colorType: 2, bgColor: { red, green, blue } }` | `{ colorType: 2, background: { red, green, blue } }` |
| `{ filterType: 4 }` | `{ filter: 4 }` |
| `{ deflateLevel: 9 }` | `{ deflate: (raw) => zlib.deflateSync(raw, { level: 9 }) }` |
| `png.gamma === 0` when there is no `gAMA` | `gamma === undefined` |
| `metadata` event | The `depth`, `colorType`, `interlace` and `alpha` fields of the result. |
| `{ skipRescale: true }`, `{ bitDepth: 16 }`, `inputColorType`, `inputHasAlpha` | Not supported. Pixels are always 8-bit RGBA. |
| `bitblt`, `adjustGamma` | Not supported. |

Behavior that differs from pngjs, each listed with its test in [`PARITY.md`](test/PARITY.md#known-upstream-issues):

- A pixel matching the `tRNS` color gets alpha 0 and keeps its color. pngjs makes it black.
- Grayscale output uses BT.709 luma. pngjs averages the channels.
- Bytes after `IEND` are ignored. `PNG.sync.read` throws.
- A file with no `IDAT` throws `InvalidInputError`. pngjs's stream parser calls back with neither an error nor an image.
- The decoder never allocates more than the compressed data can expand to, so a header that claims a huge image throws `TruncatedError` instead of a `RangeError` from a failed allocation.
- The default encoder compresses at zlib level 6 with the default strategy, which is what `CompressionStream` does. pngjs uses level 9 with `Z_RLE`, which is faster and makes files about 17% larger on photographs.

## Performance

On a 1024x1024 RGB image in Node 24, `decodeSync` with `node:zlib` takes 28 ms and pngjs 40 ms. `decode` takes 60 ms, because Node's `DecompressionStream` runs zlib on the thread pool one 16 KiB output chunk at a time. Encoding with `CompressionStream` takes 174 ms, and pngjs takes 178 ms at the same zlib settings. With `Z_RLE` passed through `deflate`, `encodeSync` takes 85 ms and pngjs's default 116 ms. Numbers come from `pnpm bench` on a shared, loaded machine.
