# @portable/exif

Reads EXIF metadata from JPEG, TIFF, PNG, WebP, HEIC and AVIF files. Runs in browsers, Cloudflare Workers, Deno, Bun and Node 24+.

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

The input can be a whole file or only its start. In a JPEG the EXIF data is in the first 64 KB. Tags whose values lie past the end of the input are left out, and `thumbnail.bytes` is `undefined` when the thumbnail does.

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

An IFD the file doesn't have is an empty object. Tags use [ExifTool's names](https://exiftool.org/TagNames/EXIF.html). A tag without a name is keyed by its id, such as `'0xC4A5'`. When an IFD holds a tag twice, the first one is kept.

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

A broken IFD doesn't throw. Tags with an unknown type, or whose values point outside the data, are skipped, and the other tags are returned. A file whose EXIF data starts past the end of the input returns empty IFDs.

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
| `parser.enableBinaryFields(true)` | Always on; binary tags are `Uint8Array`. |
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
- Truncated or broken data returns the tags that could be read instead of throwing a Node `RangeError`. An unknown tag type is skipped instead of throwing `Invalid format`.
