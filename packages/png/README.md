# @portable/png

Decodes PNG files to 8-bit RGBA pixels and encodes RGBA pixels as PNG, using the platform's `CompressionStream` and `DecompressionStream` for zlib. Runs in browsers, Cloudflare Workers, Node 24+, Bun, and Deno.

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

`decode` reads every PNG color type, bit depths 1, 2, 4, 8, and 16, Adam7 interlacing, and `tRNS` transparency. The result is always 8-bit RGBA: 16-bit samples are rounded, and lower depths are scaled up, so a 1-bit white is 255.

Gamma is reported but not applied. For an animated PNG, `decode` returns only the default image.

## Sync or async

`decode` and `encode` are async because `CompressionStream` and `DecompressionStream` are. `decodeSync` and `encodeSync` run synchronously with a zlib function you pass:

```ts
import * as Png from '@portable/png';
import { unzlibSync, zlibSync } from 'fflate';

const image = Png.decodeSync(bytes, { inflate: unzlibSync });
const png = Png.encodeSync(image, { deflate: (raw) => zlibSync(raw, { level: 9 }) });
```

The functions must use the zlib format (RFC 1950), not raw deflate.

In Node, you can also pass `inflateSync` and `deflateSync` from `node:zlib`.

## API

### `decode(bytes: Uint8Array, options?): Promise<Decoded>`

### `decodeSync(bytes: Uint8Array, options): Decoded`

| Option | Default | Description |
| --- | --- | --- |
| `inflate` | `DecompressionStream('deflate')` | Decompresses zlib data. Required for `decodeSync`. `decode` also accepts an async function. |
| `checkCrc` | `true` | Verify each chunk's CRC. The inflate function always verifies the zlib checksum. |
| `maxPixels` | `Infinity` | Most pixels (`width * height`) to decode. A larger image throws `MaxPixelsError` before anything is decompressed or allocated. Set it for untrusted files. |
| `signal` | none | `decode` only. Aborting rejects with `signal.reason` and stops the default decompression. A custom `inflate` isn't interrupted, and `decode` rejects after it returns. |

`Decoded` is a plain object:

| Field | Description |
| --- | --- |
| `width`, `height` | Pixels. |
| `data` | `Uint8Array` of 8-bit RGBA, four bytes per pixel, row by row from the top left. |
| `depth` | The file's bit depth: 1, 2, 4, 8, or 16. |
| `colorType` | The file's color type: 0 grayscale, 2 RGB, 3 palette, 4 grayscale with alpha, 6 RGBA. |
| `interlace` | Whether the file is Adam7 interlaced. |
| `alpha` | Whether the file has an alpha channel or a `tRNS` chunk. |
| `gamma` | The `gAMA` value, such as `0.45455`, or `undefined`. |

Bytes after `IEND` are ignored. Ancillary chunks other than `tRNS` and `gAMA` are skipped, so color profiles, `pHYs`, and text chunks are neither applied nor reported.

### `encode(image: RgbaImage, options?): Promise<Uint8Array>`

### `encodeSync(image: RgbaImage, options): Uint8Array`

`image` is `{ width, height, data, gamma? }` with 8-bit RGBA `data` (`Uint8Array` or `Uint8ClampedArray`), so you can pass a `Decoded` result or a canvas `ImageData` as is. A `gamma` other than 0 is written to a `gAMA` chunk.

| Option | Default | Description |
| --- | --- | --- |
| `deflate` | `CompressionStream('deflate')` | Compresses to zlib format. Required for `encodeSync`. Pass one to choose a compression level. |
| `colorType` | `6` | `0` grayscale, `2` RGB, `4` grayscale with alpha or `6` RGBA. Gray is the BT.709 luma of each pixel. |
| `background` | `{ red: 255, green: 255, blue: 255 }` | For color types without alpha, the color that semi-transparent pixels are blended onto. |
| `filter` | `[0, 1, 2, 3, 4]` | One filter for every row (0 none, 1 sub, 2 up, 3 average, 4 Paeth), or a list to choose from: each row gets the filter whose output has the smallest sum of absolute values. |
| `signal` | none | `encode` only. Aborting rejects with `signal.reason` and stops the default compression. A custom `deflate` isn't interrupted, and `encode` rejects after it returns. |

The encoder writes 8-bit, non-interlaced files with `IHDR`, `gAMA` if `gamma` is set, one `IDAT`, and `IEND`. Re-encoding a decoded file drops its palette, `tRNS` chunk, color profile, and text chunks.

### Errors

| Error | Thrown when |
| --- | --- |
| `TruncatedError` | The file ends before `IEND` or inside a chunk, or holds less image data than its header describes. |
| `InvalidInputError` | The input is malformed, e.g. a bad signature, CRC, header, filter type, or palette index, or zlib data that fails to decompress (in `error.cause`). `encode` throws it for `data` of the wrong length or a `width` or `height` that isn't a positive integer. |
| `UnsupportedError` | The file has an unknown critical chunk, or a compression, filter, or interlace method PNG doesn't define. `encode` throws it for `colorType` 3. |
| `MaxPixelsError` | The image has more pixels than `maxPixels`. Stores the limit in `maxPixels`. |

Their `name`s are `Png.TruncatedError`, `Png.InvalidInputError`, `Png.UnsupportedError`, and `Png.MaxPixelsError`.

`decode` throws a `RangeError` for an invalid `maxPixels`. `encode` throws a `RangeError` for an invalid `filter`, and a `TypeError` for `data` that isn't a `Uint8Array` or `Uint8ClampedArray`.

Errors from your `inflate` function are wrapped in `InvalidInputError`. Errors from your `deflate` function are passed on unchanged.

## Types

| Type | Description |
| --- | --- |
| `Png.ColorType` | `0 \| 2 \| 3 \| 4 \| 6`: grayscale, RGB, palette, grayscale with alpha, and RGBA. |
| `Png.BitDepth` | `1 \| 2 \| 4 \| 8 \| 16`, bits per sample, or per palette index for color type 3. |
| `Png.FilterType` | `0 \| 1 \| 2 \| 3 \| 4`: none, sub, up, average, and Paeth. |

## Why use this over pngjs

pngjs is built on Node's `zlib` and streams. This package uses `CompressionStream` and `DecompressionStream`, so it runs in browsers and Workers with no dependencies outside `@portable/*`.

- If a header claims more pixels than the data holds, `decode` throws `TruncatedError` before allocating. pngjs sizes its buffer from the header, so a 100000×100000 header with 19 bytes of data made it try to allocate 40 GB.
- A small valid file can decode to a huge image: a 1-bit 100000×100000 image is about 1.2 MB and decodes to 40 GB. `maxPixels` rejects it from the header, like sharp's `limitInputPixels`. pngjs has no limit.
- In Node, `decodeSync` with `node:zlib` was about 1.3× faster than pngjs, and `decode` about 1.2× slower, because Node's `DecompressionStream` is slow.
- `encode` was about 1.2× faster than pngjs at the same zlib settings, and `encodeSync` with pngjs's defaults about 1.3× faster.
- A file with no `IDAT` throws `InvalidInputError`. pngjs's stream parser returns neither an error nor an image.
- Bytes after `IEND` are ignored. pngjs's `PNG.sync.read` throws on them.
- A pixel matching the `tRNS` color gets alpha 0 and keeps its color. pngjs makes it black.
- `encode` computes gray as BT.709 luma. pngjs averages the channels.
- The default encoder uses zlib level 6, as `CompressionStream` does. pngjs uses level 9 with `Z_RLE`, which is faster and makes photos about 17% larger. To choose a level, pass a `deflate` function instead of pngjs's `deflateLevel`.
- `decode` returns `gamma: undefined` when there is no `gAMA` chunk. pngjs sets it to `0`.
- Pixels are always 8-bit RGBA, so pngjs's `skipRescale`, `bitDepth: 16`, `inputColorType`, and `inputHasAlpha` have no equivalent. Neither do `bitblt` and `adjustGamma`.

### Performance

<!-- bench:start -->
<table>
<thead><tr><th align="left">Library</th><th align="right">Ops/s</th><th align="left">Relative</th><th></th></tr></thead>
<tbody>
<tr><th colspan="4" align="left">Decode a 1024×1024 PNG</th></tr>
<tr><td>pngjs</td><td align="right">26.7</td><td>1.2× faster</td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="160" height="12" alt="" /></td></tr>
<tr><td>@portable/png</td><td align="right">21.5</td><td></td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="129" height="12" alt="" /></td></tr>
<tr><th colspan="4" align="left">Decode a 1024×1024 PNG with <code>decodeSync</code> and <code>node:zlib</code></th></tr>
<tr><td>@portable/png</td><td align="right">35.9</td><td></td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="160" height="12" alt="" /></td></tr>
<tr><td>pngjs</td><td align="right">26.7</td><td>1.3× slower</td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="119" height="12" alt="" /></td></tr>
<tr><th colspan="4" align="left">Encode a 1024×1024 PNG at zlib level 6</th></tr>
<tr><td>@portable/png</td><td align="right">6.84</td><td></td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="160" height="12" alt="" /></td></tr>
<tr><td>pngjs</td><td align="right">5.94</td><td>1.2× slower</td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="139" height="12" alt="" /></td></tr>
<tr><th colspan="4" align="left">Encode a 1024×1024 PNG at level 9 with <code>Z_RLE</code>, through <code>node:zlib</code></th></tr>
<tr><td>@portable/png</td><td align="right">13.1</td><td></td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="160" height="12" alt="" /></td></tr>
<tr><td>pngjs</td><td align="right">9.84</td><td>1.3× slower</td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="120" height="12" alt="" /></td></tr>
</tbody>
</table>

Operations per second from `pnpm bench`, higher is better, in Node 24.22.0, on Intel(R) Xeon(R) Processor @ 2.10GHz (4 cores). Each benchmark lists only the libraries that can do the same work, fastest first. The relative speed compares each library with @portable/png, and the bars are scaled to the fastest library.

| Library | Version | Minified and gzipped | Runtime dependencies | Node built-ins | TypeScript types |
| --- | --- | ---: | ---: | --- | --- |
| @portable/png | – | 4.9 kB | 2 | none | included |
| pngjs | 7.0.0 | 9.1 kB | 0 | `assert`, `buffer`, `stream`, `util`, `zlib` | @types/pngjs |

Sizes cover the imports in the usage example, or the equivalent imports of each library, bundled for the browser by `scripts/bundle-size.ts`. Runtime dependencies count every package installed with the published package. A library that uses Node built-ins needs polyfills in a browser and the `nodejs_compat` flag in Cloudflare Workers.
<!-- bench:end -->
