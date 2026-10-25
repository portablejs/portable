# @portable/image-size

Reads an image's type and dimensions from its header bytes or from a stream, reading only as far as the header. Runs in browsers, Cloudflare Workers, Node 24+, Bun, and Deno.

Replaces [image-size](https://www.npmjs.com/package/image-size).

```sh
npm install @portable/image-size
```

```ts
import * as ImageSize from '@portable/image-size';

const response = await fetch('https://example.com/photo.jpg');
const { width, height, type } = await ImageSize.parseStream(response.body!);
// { width: 1600, height: 1200, type: 'jpg', orientation: 1 }
```

`parseStream` stops reading and cancels the stream once it has the bytes that hold the dimensions. For a JPEG that means the segments up to its frame header (5 KB of the 730 KB `large.jpg` fixture), and for a PNG the first 24 bytes.

## API

### `parse(bytes: Uint8Array): Size`

Returns the size of the image in `bytes`. The bytes need to include only the header.

### `parseStream(stream: ReadableStream<Uint8Array>, options?): Promise<Size>`

Reads `stream` until the size is known, then cancels it.

| Option | Default | Description |
| --- | --- | --- |
| `maxBytes` | `524288` | The most bytes that `parseStream` buffers. If the header isn't complete by then, `parseStream` rejects with `MaxBytesError`, which stores the limit as `maxBytes`. ICNS files list their icons throughout the file, so a large one needs a higher limit. A negative or `NaN` value throws a `RangeError`. |
| `signal` | none | Aborting rejects with `signal.reason` and cancels the stream. |

### `Size`

| Field | Description |
| --- | --- |
| `width`, `height` | Pixels. For a file with several images, the largest by area. |
| `type` | `bmp`, `cur`, `dds`, `gif`, `icns`, `ico`, `j2c`, `jp2`, `jpg`, `jxl` (container), `jxl-stream` (bare codestream), `ktx`, `ktx2`, `png`, `pnm`, `psd`, `svg`, `tga`, `tiff`, `bigtiff` or `webp`. HEIF files report their brand: `avif`, `avis`, `heic`, `heix`, `hevc`, `hevx`, `mif1` or `msf1`. |
| `orientation` | The EXIF orientation of a JPEG (1 to 8), when it has one. `width` and `height` are the stored dimensions, before rotation. |
| `images` | Every image in an ICO, CUR or ICNS file with more than one. ICNS entries also have their icon `type`, such as `ic08`. |

The size of an animated PNG is the canvas size, with type `png`. The size of a HEIF file is the size of its primary image, cropped by its clean aperture (`clap`) and rotated by its `irot` property.

### Errors

| Error | Thrown when |
| --- | --- |
| `UnsupportedError` | The bytes don't match a supported format. |
| `TruncatedError` | The input ends before the dimensions, including an empty input. |
| `InvalidInputError` | The header is malformed, such as a PNG without an `IHDR` chunk or an SVG with neither size nor `viewBox`. |
| `MaxBytesError` | `parseStream` read `maxBytes` without finding the dimensions. Its `maxBytes` holds the limit. |

Their `name`s are `ImageSize.UnsupportedError`, `ImageSize.TruncatedError`, `ImageSize.InvalidInputError` and `ImageSize.MaxBytesError`.

## Types

| Type | Description |
| --- | --- |
| `ImageSize.Size` | What `parse` and `parseStream` return, described above. |
| `ImageSize.Type` | The `type` values listed under `Size`. |
| `ImageSize.Image` | `{ width, height, type? }`, one entry of `images` for a file that holds several images. |

## Why use this over image-size

`parseStream` reads a `fetch` body or a `File` only up to the header and then cancels it, in any JavaScript runtime. The package has no dependencies outside `@portable/*`.

- `parseStream` reads 5 KB of the 730 KB `large.jpg`. Collecting the same stream and passing it to image-size was about 70× slower, and image-size's `imageSizeFromFile` reads a fixed 512 KiB whatever the format needs.
- `parse` read `large.jpg` about 3,800× faster than image-size, and was 3.6 to 360× faster on the PNG, HEIC, WebP, SVG and TIFF fixtures.
- Input that ends early gives `TruncatedError`. image-size throws a `RangeError` from `DataView`.
- HEIF sizes come from the primary item, with the clean aperture and rotation applied. image-size reports a 16×64 image as 63×64 and gives landscape dimensions for a portrait photo stored rotated.
- `parse` reads lossless and arithmetic-coded JPEGs, which image-size rejects. There is no global `disableTypes` setting, so no other module in the process can turn off a format for you.
- image-size throws a `TypeError` for an unsupported file type. `parse` throws `UnsupportedError` instead, and `TruncatedError` or `InvalidInputError` for a broken file, so if your `catch` checks for `TypeError`, check for these errors instead.
- image-size skips the JPEG marker right after the start-of-image marker without reading it, so it misses a frame header there, and it assumes the Exif IFD0 starts 8 bytes into the TIFF header. `parse` reads that marker and follows the IFD0 offset the header stores.
- image-size lists every HEIF `ispe` property in `images`, which for a tiled photo means every tile. `parse` returns no `images` list for HEIF files, and it detects animated AVIF (`avis`), which image-size doesn't.
- image-size reads TIFF tags past the IFD's entry count until it finds a zero tag, so data after the IFD can overwrite the width and height, and it returns an undocumented `compression` field. `parse` reads only the entries the first IFD declares and returns no `compression` field.
- image-size lists ICNS entries that aren't icons, such as the table of contents, and returns the icons found so far when the file is cut short. `parse` skips those entries and throws `TruncatedError` for a short file.
- image-size splits an SVG `viewBox` on single spaces only, so it gives no size for `0,0,100,100`. `parse` accepts commas and repeated spaces.
- image-size needs a PNM file's width and height on one line, separated by one space, and returns `NaN` for dimensions that aren't numbers. `parse` reads them across lines with comments between them, and throws `InvalidInputError` for dimensions that aren't numbers.

<!-- bench:start -->
<table>
<thead><tr><th align="left">Library</th><th align="right">Ops/s</th><th align="left">Relative</th><th></th></tr></thead>
<tbody>
<tr><th colspan="4" align="left">Read the size of a 730 KB JPEG from a stream</th></tr>
<tr><td>@portable/image-size</td><td align="right">88,700</td><td></td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="160" height="12" alt="" /></td></tr>
<tr><td>image-size</td><td align="right">1,250</td><td>71× slower</td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="2" height="12" alt="" /></td></tr>
<tr><th colspan="4" align="left">Read the size of a 730 KB JPEG</th></tr>
<tr><td>@portable/image-size</td><td align="right">6,840,000</td><td></td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="160" height="12" alt="" /></td></tr>
<tr><td>image-size</td><td align="right">1,800</td><td>3,800× slower</td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="2" height="12" alt="" /></td></tr>
<tr><th colspan="4" align="left">Read the size of a PNG</th></tr>
<tr><td>@portable/image-size</td><td align="right">2,590,000</td><td></td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="160" height="12" alt="" /></td></tr>
<tr><td>image-size</td><td align="right">439,000</td><td>5.9× slower</td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="27" height="12" alt="" /></td></tr>
<tr><th colspan="4" align="left">Read the size of a HEIC image</th></tr>
<tr><td>@portable/image-size</td><td align="right">201,000</td><td></td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="160" height="12" alt="" /></td></tr>
<tr><td>image-size</td><td align="right">56,600</td><td>3.6× slower</td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="45" height="12" alt="" /></td></tr>
<tr><th colspan="4" align="left">Read the size of a WebP image</th></tr>
<tr><td>@portable/image-size</td><td align="right">2,470,000</td><td></td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="160" height="12" alt="" /></td></tr>
<tr><td>image-size</td><td align="right">347,000</td><td>7.1× slower</td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="22" height="12" alt="" /></td></tr>
<tr><th colspan="4" align="left">Read the size of an SVG</th></tr>
<tr><td>@portable/image-size</td><td align="right">550,000</td><td></td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="160" height="12" alt="" /></td></tr>
<tr><td>image-size</td><td align="right">86,500</td><td>6.4× slower</td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="25" height="12" alt="" /></td></tr>
<tr><th colspan="4" align="left">Read the size of a TIFF</th></tr>
<tr><td>@portable/image-size</td><td align="right">8,530,000</td><td></td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="160" height="12" alt="" /></td></tr>
<tr><td>image-size</td><td align="right">24,000</td><td>360× slower</td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="2" height="12" alt="" /></td></tr>
</tbody>
</table>

Operations per second from `pnpm bench`, higher is better, in Node 24.22.0, on Intel(R) Xeon(R) Processor @ 2.10GHz (4 cores). Each benchmark lists only the libraries that can do the same work, fastest first. The relative speed compares each library with @portable/image-size, and the bars are scaled to the fastest library.

| Library | Version | Minified and gzipped | Runtime dependencies | Node built-ins | TypeScript types |
| --- | --- | ---: | ---: | --- | --- |
| @portable/image-size | – | 5.3 kB | 2 | none | included |
| image-size | 2.0.4 | 4.6 kB | 0 | none | included |

Sizes cover the imports in the usage example, or the equivalent imports of each library, bundled for the browser by `scripts/bundle-size.ts`. Runtime dependencies count every package installed with the published package. A library that uses Node built-ins needs polyfills in a browser and the `nodejs_compat` flag in Cloudflare Workers.
<!-- bench:end -->
