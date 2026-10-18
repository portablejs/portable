# @portable/image-size

Reads an image's type and dimensions from its header bytes or from a stream, reading only as far as the header. Runs in browsers, Cloudflare Workers, Deno, Bun and Node 24+.

Replaces [image-size](https://www.npmjs.com/package/image-size).

```sh
npm install @portable/image-size
```

```ts
import * as ImageSize from '@portable/image-size'

const response = await fetch('https://example.com/photo.jpg')
const { width, height, type } = await ImageSize.parseStream(response.body!)
// { width: 1600, height: 1200, type: 'jpg', orientation: 1 }
```

`parseStream` stops reading and cancels the stream once it has the bytes that hold the dimensions. For a JPEG that means the segments up to its frame header (5 KB of the 730 KB `large.jpg` fixture), and for a PNG the first 24 bytes.

## API

### `parse(bytes: Uint8Array): Size`

Returns the size of the image in `bytes`. The bytes only have to cover the header.

### `parseStream(stream: ReadableStream<Uint8Array>, options?): Promise<Size>`

Reads `stream` until the size is known, then cancels it.

| Option | Default | Description |
| --- | --- | --- |
| `maxBytes` | `524288` | Most bytes to buffer. When the header isn't complete by then, `parseStream` throws `TruncatedError`. ICNS files list their icons throughout the file, so a large one needs a higher limit. |

### `Size`

| Field | Description |
| --- | --- |
| `width`, `height` | Pixels. For a file with several images, the largest by area. |
| `type` | `bmp`, `cur`, `dds`, `gif`, `icns`, `ico`, `j2c`, `jp2`, `jpg`, `jxl` (container), `jxl-stream` (bare codestream), `ktx`, `ktx2`, `png`, `pnm`, `psd`, `svg`, `tga`, `tiff`, `bigtiff` or `webp`. HEIF files report their brand: `avif`, `avis`, `heic`, `heix`, `hevc`, `hevx`, `mif1` or `msf1`. |
| `orientation` | The EXIF orientation of a JPEG (1 to 8), when it has one. `width` and `height` are the stored dimensions, before rotation. |
| `images` | Every image in an ICO, CUR or ICNS file with more than one. ICNS entries also have their icon `type`, such as `ic08`. |

An animated PNG reports `png` with the canvas size. A HEIF file reports its primary image, cropped by its clean aperture (`clap`) and rotated by its `irot` property.

### Errors

| Error | Thrown when |
| --- | --- |
| `UnsupportedError` | The bytes don't match a supported format. |
| `TruncatedError` | The input ends before the dimensions, including an empty input. |
| `InvalidInputError` | The header is malformed, such as a PNG without an `IHDR` chunk or an SVG with neither size nor `viewBox`. |

Their `name`s are `ImageSize.UnsupportedError`, `ImageSize.TruncatedError` and `ImageSize.InvalidInputError`.

## Migrating

| image-size | @portable/image-size |
| --- | --- |
| `imageSize(buffer)` | `ImageSize.parse(bytes)` |
| `imageSizeFromFile(path)` | `ImageSize.parseStream((await fs.openAsBlob(path)).stream())` in Node, or `ImageSize.parseStream(file.stream())` for a `File` |
| `disableTypes(['svg'])` | Check `size.type` after parsing. There is no global state. |
| `types` | The `ImageSize.Type` union. |
| `catch (e) { if (e instanceof TypeError) }` | Catch `UnsupportedError`, `TruncatedError` or `InvalidInputError`. |

Behavior that differs from image-size, each fixing a bug listed in [`PARITY.md`](test/PARITY.md#known-upstream-issues):

- Input that is too short throws `TruncatedError`. image-size throws a `RangeError` from `DataView` or reports a malformed file.
- JPEG: every start-of-frame marker is read, including lossless and arithmetic-coded ones, and a frame header right after the start-of-image marker. The Exif IFD0 offset is read from the header instead of assumed to be 8.
- HEIF: the size is the primary item's, with the clean aperture and rotation applied, and there is no `images` list. image-size reports every `ispe` property, subtracts the aperture's denominator from the width, and ignores rotation. Animated AVIF (`avis`) is detected.
- TIFF: only the entries the first IFD declares are read, and the undocumented `compression` field is not returned.
- ICNS: entries that are not icons, such as the table of contents, are skipped, and a file cut short throws `TruncatedError` instead of listing the icons found so far.
- SVG: a `viewBox` may separate its numbers with commas or several spaces.
- PNM: width and height may be on separate lines with comments between them, and dimensions that are not numbers throw `InvalidInputError`.
