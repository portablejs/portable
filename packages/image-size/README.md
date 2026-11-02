# @portable/image-size

Reads an image's type and dimensions from its header bytes or from a stream, reading only as far as the header. Runs in browsers, Cloudflare Workers, Node 24+, Bun, and Deno.

Replaces [image-size](https://www.npmjs.com/package/image-size) and [image-meta](https://www.npmjs.com/package/image-meta).

```sh
npm install @portable/image-size
```

```ts
import * as ImageSize from '@portable/image-size';

const response = await fetch('https://example.com/photo.jpg');
const size = await ImageSize.parseStream(response.body!);
// { width: 1600, height: 1200, type: 'jpg', orientation: 1 }
```

`parseStream` cancels the stream once it has the dimensions: for a PNG after 24 bytes, and for a JPEG after the frame header (5 KB of a 730 KB test photo).

## API

### `parse(bytes: Uint8Array): Size`

Returns the size of the image in `bytes`, which need to include only the header: a few dozen bytes for most formats, up to the frame header for JPEG, up to the end of the `<svg>` start tag for SVG, up to IFD0 for TIFF, and the whole file for ICNS. If you don't know how much to fetch, use `parseStream`.

### `parseStream(stream: ReadableStream<Uint8Array>, options?): Promise<Size>`

Reads `stream` until the size is known, then cancels it.

| Option | Default | Description |
| --- | --- | --- |
| `maxBytes` | `524288` | The most bytes to buffer before rejecting with `MaxBytesError`. Large ICNS and TIFF files can need more, because ICNS lists icons throughout the file and TIFF often stores IFD0 after the image data. A negative or `NaN` value rejects with a `RangeError` without reading or canceling the stream. |
| `signal` | none | Aborting rejects with `signal.reason` and cancels the stream. |

### `Size`

| Field | Description |
| --- | --- |
| `width`, `height` | Pixels. For a file with several images, the largest by area. |
| `type` | `bmp`, `cur`, `dds`, `gif`, `icns`, `ico`, `j2c`, `jp2`, `jpg`, `jxl` (container), `jxl-stream` (bare codestream), `ktx`, `ktx2`, `png`, `pnm`, `psd`, `svg`, `tga`, `tiff`, `bigtiff`, or `webp`. HEIF files report their brand: `avif`, `avis`, `heic`, `heix`, `hevc`, `hevx`, `mif1`, or `msf1`. |
| `orientation` | A JPEG's EXIF orientation (1 to 8), if non-zero. `width` and `height` are before rotation. HEIF results are already rotated and have no `orientation`. |
| `images` | Every image in an ICO, CUR, or ICNS file with more than one. ICNS entries also have a `type`, such as `ic08`. |

An animated PNG reports its canvas size, with type `png`. A HEIF file reports its primary image, cropped by `clap` and rotated by `irot`.

### SVG size

An SVG's size comes from the `width` and `height` of its root `<svg>` element, rounded to the nearest pixel. Unitless values are pixels. `in`, `cm`, `mm`, and `pt` are converted at 96 pixels per inch, `em` is 16 pixels, and `ex` is 8. A percentage, a negative value, an unknown unit, or 0 counts as missing.

If one is missing, it is computed from the `viewBox` aspect ratio and rounded down. If both are missing, the size is the `viewBox` size, rounded. Without a `viewBox` in either case, `parse` throws `InvalidInputError`.

The `<svg>` start tag must end within the first 1000 bytes, or `parse` throws `UnsupportedError`.

### Errors

| Error | Thrown when |
| --- | --- |
| `UnsupportedError` | The bytes don't match a supported format. |
| `TruncatedError` | The input ends before the dimensions, including an empty input. |
| `InvalidInputError` | The header is malformed, such as a PNG without an `IHDR` chunk or an SVG with neither size nor `viewBox`. |
| `MaxBytesError` | `parseStream` read `maxBytes` without finding the dimensions. Its `maxBytes` property holds the limit. |

Their `name`s are `ImageSize.UnsupportedError`, `ImageSize.TruncatedError`, `ImageSize.InvalidInputError`, and `ImageSize.MaxBytesError`.

## Types

| Type | Description |
| --- | --- |
| `ImageSize.Size` | What `parse` and `parseStream` return, described above. |
| `ImageSize.Type` | The `type` values listed under `Size`. |
| `ImageSize.Image` | `{ width, height, type? }`, one entry of `images` for a file that holds several images. |

## Why use this over image-size and image-meta

`parseStream` reads a `fetch` body or a `File` only up to the header, in any JavaScript runtime.

- On a 730 KB JPEG, `parseStream` was about 60× faster than collecting the stream for image-size and 12× faster than for image-meta. image-size's `imageSizeFromFile` always reads 512 KiB.
- `parse` was 3.2 to 3,000× faster than image-size, and 4.4 to 23× faster than image-meta except on HEIC, where image-meta was about 1.1× faster.
- Input that ends early gives `TruncatedError`. image-size throws a `RangeError` from `DataView`.
- HEIF sizes come from the primary item, with the clean aperture and rotation applied. image-size reports a 16×64 image as 63×64 and gives landscape dimensions for a portrait photo stored rotated.
- `parse` reads lossless and arithmetic-coded JPEGs, which image-size rejects. There is no global `disableTypes` setting that another module could change.
- image-size throws a `TypeError` for an unsupported file type, where `parse` throws `UnsupportedError`, and `TruncatedError` or `InvalidInputError` for a broken file. Update any `catch` that checks for `TypeError`.
- image-meta is based on image-size, but reads lossless JPEGs, comma-separated SVG `viewBox` values, and multi-line PNM headers, which image-size gets wrong. It throws a `TypeError` for every failure, so you can't tell a cut-off file from an unsupported format.
- image-meta reports KTX2 files as `ktx`, bare JPEG XL codestreams as `jxl`, and BigTIFF files as `tiff`. `parse` returns `ktx2`, `jxl-stream`, and `bigtiff`, as image-size does.
- image-size misses a JPEG frame header right after the start-of-image marker, and assumes the Exif IFD0 starts 8 bytes into the TIFF header. `parse` reads that marker and follows the stored IFD0 offset.
- image-size lists every HEIF `ispe` property in `images`, which for a tiled photo means every tile. `parse` returns no `images` for HEIF, and detects animated AVIF (`avis`).
- image-size reads TIFF tags past the IFD's entry count, so data after the IFD can overwrite the width and height, and returns an undocumented `compression` field. `parse` reads only the declared entries and returns no `compression`.
- image-size lists ICNS entries that aren't icons, such as the table of contents, and returns partial results for a cut-off file. `parse` skips those entries and throws `TruncatedError`.
- image-size splits an SVG `viewBox` on single spaces only, so it gives no size for `0,0,100,100`. `parse` accepts commas and repeated spaces.
- image-size needs a PNM file's width and height on one line, separated by one space, and returns `NaN` for non-numeric dimensions. `parse` reads them across lines and comments, and throws `InvalidInputError` for non-numeric dimensions.

<!-- bench:start -->
<table>
<thead><tr><th align="left">Library</th><th align="right">Ops/s</th><th align="left">Relative</th><th></th></tr></thead>
<tbody>
<tr><th colspan="4" align="left">Read the size of a 730 KB JPEG from a stream</th></tr>
<tr><td>@portable/image-size</td><td align="right">89,400</td><td></td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="160" height="12" alt="" /></td></tr>
<tr><td>image-meta</td><td align="right">7,410</td><td>12× slower</td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="13" height="12" alt="" /></td></tr>
<tr><td>image-size</td><td align="right">1,490</td><td>60× slower</td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="3" height="12" alt="" /></td></tr>
<tr><th colspan="4" align="left">Read the size of a 730 KB JPEG</th></tr>
<tr><td>@portable/image-size</td><td align="right">6,530,000</td><td></td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="160" height="12" alt="" /></td></tr>
<tr><td>image-meta</td><td align="right">468,000</td><td>14× slower</td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="11" height="12" alt="" /></td></tr>
<tr><td>image-size</td><td align="right">2,210</td><td>3,000× slower</td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="2" height="12" alt="" /></td></tr>
<tr><th colspan="4" align="left">Read the size of a PNG</th></tr>
<tr><td>@portable/image-size</td><td align="right">2,520,000</td><td></td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="160" height="12" alt="" /></td></tr>
<tr><td>image-meta</td><td align="right">567,000</td><td>4.4× slower</td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="36" height="12" alt="" /></td></tr>
<tr><td>image-size</td><td align="right">468,000</td><td>5.4× slower</td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="30" height="12" alt="" /></td></tr>
<tr><th colspan="4" align="left">Read the size of a HEIC image</th></tr>
<tr><td>image-meta</td><td align="right">219,000</td><td>1.1× faster</td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="160" height="12" alt="" /></td></tr>
<tr><td>@portable/image-size</td><td align="right">192,000</td><td></td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="140" height="12" alt="" /></td></tr>
<tr><td>image-size</td><td align="right">60,300</td><td>3.2× slower</td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="44" height="12" alt="" /></td></tr>
<tr><th colspan="4" align="left">Read the size of a WebP image</th></tr>
<tr><td>@portable/image-size</td><td align="right">2,370,000</td><td></td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="160" height="12" alt="" /></td></tr>
<tr><td>image-meta</td><td align="right">335,000</td><td>7.1× slower</td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="23" height="12" alt="" /></td></tr>
<tr><td>image-size</td><td align="right">333,000</td><td>7.1× slower</td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="22" height="12" alt="" /></td></tr>
<tr><th colspan="4" align="left">Read the size of an SVG</th></tr>
<tr><td>@portable/image-size</td><td align="right">596,000</td><td></td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="160" height="12" alt="" /></td></tr>
<tr><td>image-meta</td><td align="right">98,500</td><td>6.1× slower</td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="26" height="12" alt="" /></td></tr>
<tr><td>image-size</td><td align="right">92,700</td><td>6.4× slower</td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="25" height="12" alt="" /></td></tr>
<tr><th colspan="4" align="left">Read the size of a TIFF</th></tr>
<tr><td>@portable/image-size</td><td align="right">9,130,000</td><td></td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="160" height="12" alt="" /></td></tr>
<tr><td>image-meta</td><td align="right">395,000</td><td>23× slower</td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="7" height="12" alt="" /></td></tr>
<tr><td>image-size</td><td align="right">29,800</td><td>310× slower</td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="2" height="12" alt="" /></td></tr>
</tbody>
</table>

Operations per second from `pnpm bench`, higher is better, in Node 24.22.2, on Intel(R) Xeon(R) Processor @ 2.10GHz (4 cores). Each benchmark lists only the libraries that can do the same work, fastest first. The relative speed compares each library with @portable/image-size, and the bars are scaled to the fastest library.

| Library | Version | Minified and gzipped | Runtime dependencies | Node built-ins | TypeScript types |
| --- | --- | ---: | ---: | --- | --- |
| @portable/image-size | – | 5.3 kB | 2 | none | included |
| image-size | 2.0.4 | 4.6 kB | 0 | none | included |
| image-meta | 0.3.1 | 6.5 kB | 0 | none | included |

Sizes cover the imports in the usage example, or the equivalent imports of each library, bundled for the browser by `scripts/bundle-size.ts`. Runtime dependencies count every package installed with the published package. A library that uses Node built-ins needs polyfills in a browser and the `nodejs_compat` flag in Cloudflare Workers.
<!-- bench:end -->
