# @portable/png

Decodes PNG files to 8-bit RGBA pixels and encodes RGBA pixels as PNG, with zlib from the platform's `CompressionStream` and `DecompressionStream`. Runs in browsers, Cloudflare Workers, Deno, Bun and Node 24+.

Replaces [pngjs](https://www.npmjs.com/package/pngjs).

```sh
npm install @portable/png
```

```ts
import * as Png from '@portable/png';

const response = await fetch('https://example.com/photo.png');
const { width, height, data } = await Png.decode(await response.bytes());

for (let i = 0; i < data.length; i += 4) {
  data[i] = 255 - data[i]!;
} // invert red
const bytes = await Png.encode({ width, height, data });
```

`decode` reads every PNG color type (grayscale, RGB, palette, each with or without alpha), bit depths 1, 2, 4, 8 and 16, Adam7 interlacing, and `tRNS` transparency. The result is always 8-bit RGBA: 16-bit samples are rounded to 8 bits, and lower depths are scaled up, so a 1-bit white is 255. Gamma is reported but not applied.

## Sync or async

`decode` and `encode` return promises, because `CompressionStream` and `DecompressionStream` are the only zlib that every runtime has, and they are async. `decodeSync` and `encodeSync` do the same work synchronously with a zlib function you pass:

```ts
import * as Png from '@portable/png';
import { unzlibSync, zlibSync } from 'fflate';

const image = Png.decodeSync(bytes, { inflate: unzlibSync });
const png = Png.encodeSync(image, { deflate: (raw) => zlibSync(raw, { level: 9 }) });
```

In Node, `inflateSync` and `deflateSync` from `node:zlib` work too. The functions you pass must read and write the zlib format (RFC 1950), not raw deflate.

## API

### `decode(bytes: Uint8Array, options?): Promise<Decoded>`

### `decodeSync(bytes: Uint8Array, options): Decoded`

| Option | Default | Description |
| --- | --- | --- |
| `inflate` | `DecompressionStream('deflate')` | Decompresses zlib data. Required for `decodeSync`. `decode` also accepts an async function. |
| `checkCrc` | `true` | Verify each chunk's CRC. The zlib checksum is always verified by the inflate function. |
| `maxPixels` | `Infinity` | The largest number of pixels (`width * height`) to decode. For a larger image, `decode` throws `MaxPixelsError` as soon as `IHDR` is read, before anything is decompressed or allocated. Set it when you decode untrusted files. |
| `signal` | none | `decode` only. Aborting rejects with `signal.reason` and stops the default decompression. |

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
| `filter` | `[0, 1, 2, 3, 4]` | A filter for every row (0 none, 1 sub, 2 up, 3 average, 4 Paeth), or a list to choose from per row. With a list, each row gets the filter whose output has the smallest sum of absolute values, with each byte read as signed, as libpng does. |
| `signal` | none | `encode` only. Aborting rejects with `signal.reason` and stops the default compression. |

The encoder writes 8-bit, non-interlaced files with one `IDAT` chunk.

### Errors

| Error | Thrown when |
| --- | --- |
| `TruncatedError` | The file ends before `IEND` or inside a chunk, or holds less image data than its header describes. |
| `InvalidInputError` | The input is malformed: a bad signature, a CRC mismatch, an invalid header, a bad filter type, a palette index out of range, or zlib data that fails to decompress (the cause is in `error.cause`). `encode` throws it for `data` of the wrong length or a `width` or `height` that isn't a positive integer, and a `RangeError` for an invalid `filter`. |
| `UnsupportedError` | The file has an unknown critical chunk, or a compression, filter or interlace method PNG doesn't define. `encode` throws it for `colorType` 3. |
| `MaxPixelsError` | The image has more pixels than `maxPixels`, which the error stores as `maxPixels`. |

Their `name`s are `Png.TruncatedError`, `Png.InvalidInputError`, `Png.UnsupportedError` and `Png.MaxPixelsError`. A bad `maxPixels`, such as a negative number, throws a `RangeError`.

## Types

| Type | Description |
| --- | --- |
| `Png.ColorType` | `0 \| 2 \| 3 \| 4 \| 6`: grayscale, RGB, palette, grayscale with alpha and RGBA. |
| `Png.BitDepth` | `1 \| 2 \| 4 \| 8 \| 16`, bits per sample, or per palette index for color type 3. |
| `Png.FilterType` | `0 \| 1 \| 2 \| 3 \| 4`: none, sub, up, average and Paeth. |

## Why use this over pngjs

pngjs is built on Node's `zlib` and streams. This package takes zlib from `CompressionStream` and `DecompressionStream`, so it runs in browsers and Workers with no dependencies outside `@portable/*`.

- If a header claims more pixels than the data can hold, `decode` throws `TruncatedError` before anything is allocated. pngjs sizes its buffer from the header alone, and a 100000×100000 header with 19 bytes of image data made it try to allocate 40 GB and throw a `RangeError`.
- A valid file can still be small and decode to a huge image: a 1-bit 100000×100000 image compresses to about 1.2 MB and decodes to 40 GB of RGBA. `maxPixels` rejects it from the header, as sharp's `limitInputPixels` does. pngjs has no limit.
- Decoding a 1024×1024 image with `decodeSync` and `node:zlib` was about 1.3× faster than pngjs. The default `decode` was about 1.2× slower than pngjs in Node, because Node's `DecompressionStream` sends zlib work to the thread pool one 16 KiB chunk at a time.
- Encoding with `CompressionStream` was about 1.2× faster than pngjs at the same zlib settings, and `encodeSync` with pngjs's defaults (level 9, `Z_RLE`) was about 1.3× faster than pngjs.
- A file with no `IDAT` is rejected with `InvalidInputError`. pngjs's stream parser calls back with neither an error nor an image.
- Bytes after `IEND` are ignored. `PNG.sync.read` throws on them, including on a file that pngjs's own async test parses.
- A pixel matching the `tRNS` color gets alpha 0 and keeps its color. pngjs makes it black.
- `encode` computes gray as BT.709 luma. pngjs averages the channels.
- The default encoder compresses at zlib level 6 with the default strategy, which is what `CompressionStream` does. pngjs uses level 9 with `Z_RLE`, which is faster and makes files about 17% larger on photographs. pngjs's `deflateLevel` has no equivalent, so pass a `deflate` function to choose a level.
- pngjs sets `gamma` to `0` when there is no `gAMA` chunk, and `decode` returns `gamma: undefined`.
- Pixels are always 8-bit RGBA, so pngjs's `skipRescale`, `bitDepth: 16`, `inputColorType` and `inputHasAlpha` options have no equivalent. Neither do pngjs's `bitblt` and `adjustGamma`.

### Performance

<!-- bench:start -->
<table>
<thead><tr><th align="left">Library</th><th align="right">Ops/s</th><th align="left">Relative</th><th></th></tr></thead>
<tbody>
<tr><th colspan="4" align="left">Decode a 1024×1024 PNG</th></tr>
<tr><td>pngjs</td><td align="right">26.7</td><td>1.2× faster</td><td><img src="../../assets/bar.svg" width="160" height="12" alt="" /></td></tr>
<tr><td><strong>@portable/png</strong></td><td align="right">21.5</td><td></td><td><img src="../../assets/bar-ours.svg" width="129" height="12" alt="" /></td></tr>
<tr><th colspan="4" align="left">Decode a 1024×1024 PNG with <code>decodeSync</code> and <code>node:zlib</code></th></tr>
<tr><td><strong>@portable/png</strong></td><td align="right">35.9</td><td></td><td><img src="../../assets/bar-ours.svg" width="160" height="12" alt="" /></td></tr>
<tr><td>pngjs</td><td align="right">26.7</td><td>1.3× slower</td><td><img src="../../assets/bar.svg" width="119" height="12" alt="" /></td></tr>
<tr><th colspan="4" align="left">Encode a 1024×1024 PNG at zlib level 6</th></tr>
<tr><td><strong>@portable/png</strong></td><td align="right">6.84</td><td></td><td><img src="../../assets/bar-ours.svg" width="160" height="12" alt="" /></td></tr>
<tr><td>pngjs</td><td align="right">5.94</td><td>1.2× slower</td><td><img src="../../assets/bar.svg" width="139" height="12" alt="" /></td></tr>
<tr><th colspan="4" align="left">Encode a 1024×1024 PNG at level 9 with <code>Z_RLE</code>, through <code>node:zlib</code></th></tr>
<tr><td><strong>@portable/png</strong></td><td align="right">13.1</td><td></td><td><img src="../../assets/bar-ours.svg" width="160" height="12" alt="" /></td></tr>
<tr><td>pngjs</td><td align="right">9.84</td><td>1.3× slower</td><td><img src="../../assets/bar.svg" width="120" height="12" alt="" /></td></tr>
</tbody>
</table>

Operations per second from `pnpm bench`, higher is better, in Node 24.22.0, on Intel(R) Xeon(R) Processor @ 2.10GHz (4 cores). Each benchmark lists only the libraries that can do the same work, fastest first. The relative speed compares each library with @portable/png, and the bars are scaled to the fastest library.

| Library | Version | Minified and gzipped | Runtime dependencies | Node built-ins | TypeScript types |
| --- | --- | ---: | ---: | --- | --- |
| @portable/png | – | 4.9 kB | 2 | none | included |
| pngjs | 7.0.0 | 9.1 kB | 0 | `assert`, `buffer`, `stream`, `util`, `zlib` | `@types/pngjs` |

Sizes cover the imports in the usage example, or the equivalent imports of each library, bundled for the browser by `scripts/bundle-size.ts`. Runtime dependencies count every package installed with the published package. A library that uses Node built-ins needs polyfills in a browser and the `nodejs_compat` flag in Cloudflare Workers.
<!-- bench:end -->
