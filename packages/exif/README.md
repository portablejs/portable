# @portable/exif

Reads EXIF metadata from JPEG, TIFF, PNG, WebP, HEIC and AVIF files, and removes EXIF and XMP metadata from JPEG, PNG and WebP files. Runs in browsers, Cloudflare Workers, Deno, Bun and Node 24+.

Replaces [exif-parser](https://www.npmjs.com/package/exif-parser).

```sh
npm install @portable/exif
```

```ts
import * as Exif from '@portable/exif'

const response = await fetch('https://example.com/photo.jpg', { headers: { range: 'bytes=0-65535' } })
const exif = Exif.parse(new Uint8Array(await response.arrayBuffer()))

exif.ifd0.Make // 'Apple'
exif.exif.DateTimeOriginal // '2019:10:20 18:34:30'
exif.latitude // 38.046641666666666
exif.imageSize // { width: 4032, height: 3024 }
exif.thumbnail?.bytes // Uint8Array of the embedded JPEG thumbnail
```

The input can be a whole file or only its start. In a JPEG the EXIF data is in the first 64 KB. Tags whose values lie past the end of the input are left out, and `thumbnail.bytes` is `undefined` if the thumbnail lies past the end.

## `Exif.parse(bytes)`

Takes a `Uint8Array` holding a JPEG, TIFF, PNG (`eXIf` chunk), WebP (`EXIF` chunk), HEIF file such as HEIC or AVIF (`Exif` item), or raw EXIF data that starts with `Exif\0\0` or a TIFF header. Returns a plain object:

| Property | Type | Description |
| --- | --- | --- |
| `ifd0` | `Tags` | Main image tags, such as `Make`, `Model`, `Orientation`, `ModifyDate`. |
| `exif` | `Tags` | Exif IFD tags, such as `DateTimeOriginal`, `ExposureTime`, `ISO`, `LensModel`. |
| `gps` | `Tags` | GPS IFD tags, such as `GPSLatitude` and `GPSLatitudeRef`. |
| `interop` | `Tags` | Interoperability IFD tags. |
| `ifd1` | `Tags` | Thumbnail tags. |
| `latitude`, `longitude` | `number \| undefined` | Decimal degrees, negative for south and west. Set when both coordinates are present. |
| `imageSize` | `{ width, height } \| undefined` | Pixel size of the stored image, before any `Orientation` rotation. From the JPEG SOF segment, TIFF `ImageWidth` and `ImageHeight`, PNG `IHDR`, the WebP header, or the HEIF `ispe` property of the primary item. |
| `thumbnail` | `{ offset, length, bytes } \| undefined` | The JPEG thumbnail that IFD1 points to. `offset` is its position in the input. `bytes` is a view into the input. |

A missing IFD is an empty object. Tags use [ExifTool's names](https://exiftool.org/TagNames/EXIF.html). A tag without a name is keyed by its id, such as `'0xC4A5'`. When an IFD holds a tag twice, the first one is kept.

Values have these types:

| EXIF type | Value |
| --- | --- |
| ASCII | `string`, decoded as UTF-8 and cut at the first NUL. |
| BYTE, SHORT, LONG, their signed forms, FLOAT, DOUBLE | `number` for one value, `number[]` for more. |
| RATIONAL, SRATIONAL | The same, with each fraction divided: `ExposureTime` is `0.004`, not `[1, 250]`. A zero denominator gives `NaN` or `Infinity`. |
| UNDEFINED | `Uint8Array`, a view into the input. |

Dates stay strings, as stored (`'2019:10:20 18:34:30'`), because EXIF dates have no time zone. Use `Exif.parseDate` to get a `Date`.

### Errors

| Error | When |
| --- | --- |
| `Exif.UnsupportedError` | The input is none of the formats above. |
| `Exif.InvalidInputError` | The TIFF header is malformed: no `II` or `MM` byte order mark, a magic number other than 42, or an IFD0 offset inside the header. |
| `Exif.TruncatedError` | TIFF or raw EXIF input is shorter than its 8-byte header. |

A broken IFD doesn't throw. `parse` skips a tag if its type is unknown or its values point outside the data, and returns the other tags. A file whose EXIF data starts past the end of the input gives empty IFDs.

## `Exif.parseStream(stream, options?)`

Reads a `ReadableStream<Uint8Array>`, such as a `fetch` body or `File.stream()`, until it has the metadata, then cancels the stream. Returns a promise of the same object `parse` returns for the whole file, so you get the EXIF of a large photo without downloading all of it.

```ts
const response = await fetch('https://example.com/photo.jpg')
const exif = await Exif.parseStream(response.body!)
```

How far it reads depends on where the format stores the metadata:

| Format | Stops after | Bytes held in memory |
| --- | --- | --- |
| JPEG | The Exif APP1 segment and the frame header, or the first start-of-scan marker if there is no EXIF. That is the first 30 KB of the 329 KB `starfish.jpg` fixture. | The APP1 segment, at most 64 KB. |
| PNG | The `eXIf` chunk. It may come after the image data, so a PNG without EXIF is read to `IEND`. | The `eXIf` chunk. Other chunks are skipped. |
| WebP | The `EXIF` chunk and the size. The `EXIF` chunk usually follows the image data, so most WebP files are read to the end. | The `EXIF` chunk. Other chunks are skipped. |
| HEIC, AVIF | The `Exif` item that the `meta` box locates. | Everything before the end of `meta`, then the `Exif` item. A file with `mdat` before `meta` holds its whole `mdat`. |
| TIFF, raw EXIF | The last IFD or thumbnail byte that the IFDs reference. Many TIFF writers put IFD0 after the image strips, so expect to read the whole file. | Everything read. |

| Option | Default | Description |
| --- | --- | --- |
| `maxBytes` | `16777216` (16 MiB) | Most bytes of the stream to hold in memory at once. Skipped bytes don't count. |
| `signal` | none | An `AbortSignal`. Aborting rejects with `signal.reason` and cancels the stream. |

Besides the errors `parse` throws, `parseStream` rejects with `Exif.MaxBytesError` when it would need to hold more than `maxBytes`. The error's `maxBytes` property holds the limit. An error from the stream itself is passed on unchanged.

## `Exif.strip(bytes, options?)` and `Exif.StripStream`

Remove the EXIF and XMP metadata from a JPEG, PNG or WebP file without re-encoding it. The image data is copied byte for byte. `strip` takes and returns a `Uint8Array`. `StripStream` is a `TransformStream` that does the same to a stream, so you can store a stripped upload and read its EXIF from the same body:

```ts
const [stored, inspected] = request.body!.tee()
const [, exif] = await Promise.all([
  bucket.put(key, stored.pipeThrough(new Exif.StripStream())),
  Exif.parseStream(inspected),
])
```

What is removed:

| Format | Removed | Kept by default |
| --- | --- | --- |
| JPEG | APP1 `Exif` and XMP segments (including extended XMP), and the APP13 Photoshop segment that holds IPTC. | APP2 `ICC_PROFILE` segments, and every other segment. |
| PNG | `eXIf`, and `tEXt`, `zTXt` and `iTXt` chunks with the keyword `XML:com.adobe.xmp` or ImageMagick's `Raw profile type exif`, `APP1`, `xmp` and `iptc`. | `iCCP`, and every other text chunk. |
| WebP | `EXIF` and `XMP ` chunks. The RIFF size and the `VP8X` flags are updated to match. | `ICCP`. |

| Option | Default | Description |
| --- | --- | --- |
| `keepOrientation` | `true` | Write back an EXIF block that holds only the `Orientation` tag, when the original has one from 2 to 8, so that viewers and resizers still rotate the image. It takes the place of the original EXIF block. |
| `keepColorProfile` | `true` | Keep the ICC profile. |
| `signal` | none | `StripStream` only. Aborting errors the stream with `signal.reason`. |

`StripStream` writes a JPEG or PNG as it arrives and holds at most one metadata segment or chunk. It holds a whole WebP file before writing it, because the RIFF size and the `VP8X` flags at the start of the file depend on the `EXIF` chunk, which usually comes last.

In a JPEG, everything from the first start-of-scan marker on is copied unchanged, including any segments after the scan. A truncated file is stripped as far as it goes.

`strip` throws `Exif.UnsupportedError` for TIFF, HEIC and AVIF files and raw EXIF data. In HEIF files the `Exif` and XMP items are listed in `iinf` and located by byte offset in `iloc`, so removing them means rewriting those boxes and the offsets of every other item. `Exif.InvalidInputError` is thrown when a JPEG has bytes other than a marker between its segments, or a segment length below 2.

## `Exif.parseDate(value, options?)`

Parses `'YYYY:MM:DD HH:MM:SS'`, with optional fractional seconds, or the ISO 8601 form `'2004-09-04T23:39:06-08:00'` into a `Date`. Returns `undefined` for anything else, including the `'0000:00:00 00:00:00'` cameras write when their clock is unset.

| Option | Default | Description |
| --- | --- | --- |
| `offset` | none | UTC offset such as `'+02:00'`, used when `value` has none. Pass the matching `OffsetTimeOriginal`, `OffsetTimeDigitized` or `OffsetTime` tag. |

Without an offset the date is read as UTC, so `getUTCHours()` and the other `getUTC*` methods return the time the camera recorded.

```ts
const { exif } = Exif.parse(bytes)
const taken = Exif.parseDate(String(exif.DateTimeOriginal), { offset: String(exif.OffsetTimeOriginal) })
```

## Types

| Type | Description |
| --- | --- |
| `Exif.Metadata` | What `parse` and `parseStream` return. Every IFD is an object, empty when the file doesn't have it. |
| `Exif.Tags` | One IFD, keyed by tag name. |
| `Exif.TagValue` | A tag value: a string for ASCII, a number or `number[]` for numeric tags, and a `Uint8Array` view of the input for UNDEFINED tags. |

## Why use this over exif-parser

exif-parser reads only JPEG. This package also reads TIFF, PNG, WebP, HEIC and AVIF, takes a `Uint8Array` in any JavaScript runtime, and has no dependencies.

- Parsing a 329 KB phone JPEG was about 3× faster than exif-parser and 10× faster than exifr.
- `parse` skips the bad tags in damaged data and returns the rest. exif-parser throws a `RangeError` for an IFD that runs past the buffer (exif-parser #29) and `Invalid format: 0` for an unknown tag type (exif-parser #17).
- Tags are grouped by IFD, so the thumbnail's `Orientation` is never reported as the image's (exif-parser #30).
- A coordinate without its `GPSLatitudeRef` or `GPSLongitudeRef` stays positive, where exif-parser negates it (exif-parser #36, #37). SSHORT and SLONG values are signed.
- Dates stay strings, and `parseDate` applies the `OffsetTime*` tag you pass. exif-parser turns the camera's local time into seconds as if it were UTC (exif-parser #14, #23, #40).

<!-- bench:start -->
| | @portable/exif | exif-parser | exif-reader | exifr |
| --- | ---: | ---: | ---: | ---: |
| Parse a 329 KB phone JPEG | 203,000 | 61,500 | 80,400 | 18,000 |
| Parse a phone JPEG from a stream | 36,700 | – | – | – |

Operations per second from `pnpm bench`, higher is better, in Node 24.22.0, on Intel(R) Xeon(R) Processor @ 2.10GHz (4 cores). A dash means the library has no equivalent.

| | @portable/exif | exif-parser | exif-reader | exifr |
| --- | --- | --- | --- | --- |
| Minified and gzipped | 7.5 kB | 7.8 kB | 4.7 kB | 27 kB |
| Runtime dependencies | 0 | 0 | 0 | 0 |
| Node built-ins used | none | none | none | `Buffer` |
| TypeScript types | included | none | included | included |
| Version compared | – | 0.1.12 | 2.0.3 | 7.1.3 |

Sizes cover the imports in the usage example, or the equivalent imports of each library, bundled for the browser by `scripts/bundle-size.ts`. Runtime dependencies count every package installed with the published package. A library that uses Node built-ins needs polyfills in a browser and the `nodejs_compat` flag in Cloudflare Workers.
<!-- bench:end -->

## Migrating

| exif-parser | @portable/exif |
| --- | --- |
| `require('exif-parser').create(buffer).parse()` | `Exif.parse(bytes)` |
| `result.tags.Make` | `result.ifd0.Make` |
| `result.tags.DateTimeOriginal` (Unix seconds) | `Exif.parseDate(result.exif.DateTimeOriginal).getTime() / 1000` |
| `result.tags.GPSLatitude` (decimal degrees) | `result.latitude` |
| `result.getImageSize()` | `result.imageSize` |
| `result.hasThumbnail()` | `result.thumbnail !== undefined` |
| `result.getThumbnailOffset()`, `getThumbnailLength()` | `result.thumbnail.offset`, `result.thumbnail.length` |
| `result.getThumbnailBuffer()` | `result.thumbnail.bytes` |
| `result.getThumbnailSize()` | `Exif.parse(result.thumbnail.bytes).imageSize` |
| `parser.enableBinaryFields(true)` | Always on. Binary tags are `Uint8Array`. |
| `parser.enableTagNames(false)` | None. Unknown tags are keyed by hex id. |
| `parser.enableSimpleValues(false)` | None. Values are always simplified, except dates and GPS tags, which keep their stored form. |
| `parser.enableImageSize(false)`, `enableReturnTags(false)`, `enablePointers(true)` | None. |

Behavior that differs from exif-parser:

- Tags are grouped by IFD instead of merged into one object, so a thumbnail's `Orientation` is never reported as the image's.
- Exif IFD tags are in `exif`. exif-parser filed them under the interop section.
- SSHORT and SLONG values are signed. exif-parser read them as unsigned.
- A missing `GPSLatitudeRef` or `GPSLongitudeRef` leaves the coordinate positive. exif-parser negated it.
- Dates are strings, not seconds since the epoch read as UTC.
- TIFF, PNG, WebP, HEIC and AVIF files are read, not only JPEG.
- For truncated or broken data, `parse` returns the tags it could read instead of throwing a Node `RangeError`. A tag of unknown type is skipped instead of throwing `Invalid format`.
