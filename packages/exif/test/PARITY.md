# Test parity

`@portable/exif` replaces [exif-parser 0.1.12](https://github.com/bwindels/exif-parser). Its suite is small, so the cases also come from [exif-reader 2.0.3](https://github.com/devongovett/exif-reader) and the EXIF parts of [exifr 7.1.3](https://github.com/MikeKovarik/exifr). All three are MIT licensed.

Fixtures:

- `starfish.jpg`, `test.jpg`: exif-parser (MIT, Bruno Windels, and Daniel Leinich).
- `*.exif`: exif-reader (MIT, Devon Govett, and others).
- Everything else: exifr's `test/fixtures` (MIT, Mike Kovařík). `orientation-f*t.jpg` were `orientation/f*t.jpg`. `heic-iphone7-head.heic` and `heic-single-head.heic` are the first 32768 and 2048 bytes of `heic-iphone7.heic` and `heic-single.heic`. The short copies keep the repo small and test reading only the start of a file.

Test names below are `describe > test` in `parse.conformance.ts`, `parseDate.conformance.ts`, or `exif.fuzz.conformance.ts`.

## API changes

The package is designed fresh, so no exif-parser call has a one-to-one replacement. The table below lists the equivalents.

| exif-parser | @portable/exif | Why |
| --- | --- | --- |
| `create(buffer).parse()` with six `enable*` flags | `Exif.parse(bytes)`, no options | Each flag turned off work that costs little or reshaped the output. One output shape is easier to document and test. |
| `result.tags`, one object for every IFD, keeping the first tag of each name | `ifd0`, `ifd1`, `exif`, `gps`, `interop` objects | In one object the thumbnail's `Orientation` is reported as the image's when the image has none (exif-parser #30), and interop tags collide with GPS tag ids. |
| `enableTagNames(false)` arrays of `{ section, type, value }` | none | Unknown tags are keyed by their hex id, such as `'0xC4A5'`. |
| Dates as Unix seconds, read as UTC | Strings, and `Exif.parseDate(value, { offset })` returns a `Date` | EXIF dates have no time zone. Seconds were mistaken for milliseconds (exif-parser #40), and the UTC reading was reported as wrong (#14, #23). |
| `GPSLatitude` replaced by decimal degrees | `gps.GPSLatitude` stays `[d, m, s]`, and `latitude` and `longitude` are added | You get both the stored value and the converted one. |
| Binary tags dropped unless `enableBinaryFields(true)` | Always included as `Uint8Array` views | A view costs no copy. |
| Pointer tags `ThumbnailOffset`, `ThumbnailLength` and `Compression` hidden by default | Kept in `ifd1` | Only the three IFD pointers (`ExifOffset`, `GPSInfo`, `InteropOffset`) are left out, since their offsets mean nothing to a caller. |
| `getImageSize()`, `hasThumbnail()`, `getThumbnailOffset()`, `getThumbnailLength()`, `getThumbnailBuffer()`, `getThumbnailSize()` | `imageSize`, `thumbnail.{offset,length,bytes}` | Results are plain objects. `getThumbnailSize()` is `Exif.parse(thumbnail.bytes).imageSize`. |
| `Error('Invalid JPEG section offset')` and Node `RangeError`s | `UnsupportedError`, `InvalidInputError`, `TruncatedError`, or a partial result | See the README. |

## exif-parser

| Upstream test | Covered by | Notes |
| --- | --- | --- |
| test-date: parse unix epoch without timezone | `exif-parser > parses the unix epoch without a time zone` | |
| test-date: parse given date without timezone | `exif-parser > parses a date without a time zone as UTC` | |
| test-date: parse invalid date without timezone should not return anything | `exif-parser > returns undefined for an invalid date without a time zone` | |
| test-date: parse given date with timezone | `exif-parser > parses an ISO 8601 date with a time zone` | |
| test-date: parse invalid date with timezone | `exif-parser > returns undefined for an invalid time zone` | |
| test-date: parseExifDate | `exif-parser > parses both date formats` | |
| test-exif: parseTags | `exif-parser > reads every tag of starfish.jpg` | Checks the same 43 tags of `expected-exif-tags.json` per IFD. Tags that exif-parser filed under the interop IFD are in `exif`, where they are stored. |
| test-jpeg: parseSections | `exif-parser > reads the Exif APP1 segment and skips the other APP segments` | The segment walk is internal. The test checks what it produces from `test.jpg`, which has APP0, APP2, and two APP1 segments. |
| test-jpeg: getSizeFromSOFSection | `exif-parser > reads the size from the SOF segment` | |
| test-jpeg: getSectionName | skipped | Tests a private helper that names JPEG markers. Nothing a caller sees depends on the names. |
| test-simplify: castDateValues | `exif-parser > parses DateTimeOriginal, CreateDate, and ModifyDate values` | |
| (no test) GPS degrees, thumbnail | `exif-parser > reads GPS coordinates as signed decimal degrees`, `exif-parser > finds the thumbnail` | exif-parser's README describes this, but it has no test for it. |

## exif-reader

| Upstream test | Covered by | Notes |
| --- | --- | --- |
| should read tiff and exif data | `exif-reader > reads TIFF and Exif tags` | Tag names are ExifTool's, as in exif-parser: `DateTime` is `ModifyDate`, `PixelXDimension` is `ExifImageWidth`. Dates stay strings. |
| should read gps data and other exif data | `exif-reader > reads GPS and other Exif tags` | |
| should read gps data and other exif data from png | `exif-reader > reads Exif data taken from a PNG` | |
| should read non-ascii data | `exif-reader > decodes non-ASCII strings as UTF-8` | exif-reader returns the bytes, and `parse` decodes them. |
| should read little endian data | `exif-reader > reads little-endian data` | |
| should error when missing Exif tag | `exif-reader > throws UnsupportedError for data that is not EXIF` | |
| should error when missing byte order marker | `exif-reader > throws InvalidInputError without a byte order mark` | |
| fuzz: randomly mutated tetons, IMG_0774, pngWithExif, non_ascii | `parse > returns or throws a documented error for a mutated *` | 300 runs each by default (three times `FUZZ_RUNS`), plus `starfish.jpg`. Only our three error classes may be thrown. |
| fuzz: randomly truncated (same four fixtures) | `parse > returns or throws a documented error for a truncated *` | |

## exifr

exifr parses XMP, IPTC, ICC, JFIF, PNG text chunks, and maker notes, has options to pick and skip tags, translates values to text, and reads files in chunks. Tests of those features don't apply. The rows below cover its EXIF tests.

| Upstream test | Covered by | Notes |
| --- | --- | --- |
| tiff.spec: .tif with scattered TIFF (001.tif) | `parse > skips tags whose values lie outside the data` | 001.tif is 679 KB. Offsets anywhere in the input are followed, which the synthetic TIFFs test. |
| tiff.spec: empty strings / trimmed strings (empty-imagedesc-in-ifd0.jpg) | skipped | `parse` returns stored strings without trimming. |
| tiff.spec: FileSource, SceneType unpacked to a single value | `exif-reader > reads TIFF and Exif tags` | One-byte UNDEFINED tags stay `Uint8Array`, as all UNDEFINED tags do. |
| tiff.spec: ExifVersion is '2.2' | skipped | `parse` returns the stored bytes. |
| tiff.spec: UCS2 string revived, XP* tags revived | skipped | XP tags are BYTE arrays. Decode them with `new TextDecoder('utf-16le')`. |
| tiff.spec: options.tiff, ifd0/exif/gps/interop/ifd1 enable, pick, skip, merge, translate, formatter tests | skipped | No options. Every IFD is always returned. |
| tiff.spec: block results (Make 'Google', ExposureTime, GPSDOP, InteropIndex 'R98', ImageHeight 189) | `exifr > reads IFD0, Exif, interop, and IFD1 tags` | Same blocks on `img_1771.jpg`, because the Pixel JPEG is 4 MB. |
| tiff.spec: additional EXIF block test (ApertureValue 4.65625) | `exifr > reads IFD0, Exif, interop, and IFD1 tags` | |
| tiff.spec: additional GPS block test (latitude, longitude) | `exifr > reads the eXIf chunk of a PNG` | Same values, from the PNG that holds the Pixel photo's EXIF. |
| tiff.spec: broken file recovery (broken1.jpg) | `exifr > reads the other IFDs when the GPS IFD is broken` | `parse` never throws for a broken IFD, so the `silentErrors: false` case doesn't apply. |
| tiff.spec: MakerNote, UserComment not parsed by default | skipped | Both are returned as bytes. |
| tiff.spec: edge case with .tif / OriginalRawFileName revive | skipped | issue-metadata-extractor-152.tif is 2.4 MB. TIFF reading is covered by `exifr > reads TIFF files`. |
| tiff.spec: embedded XMP, ICC, IPTC in .tif | skipped | Not EXIF. `tif-with-iptc-icc-xmp.tif` is used by `exifr > reads TIFF files`. |
| formats/heic.spec: no output for heic-single, heic-collection | `exifr > returns empty IFDs for a HEIC without an Exif item` | |
| formats/heic.spec: TIFF from heic-iphone7, address aligns | `exifr > reads the Exif item of a HEIC from the start of the file` | ICC is not EXIF. |
| formats/heic.spec: heic-empty, heic-iphone | skipped | Same structure as heic-iphone7, and each is over 2 MB. |
| formats/avif.spec: TIFF and EXIF from Irvine_CA.avif | `exifr > reads the Exif item of an AVIF` | ICC from the second fixture is not EXIF. |
| formats/jpeg.spec: findAppSegments | `exif-parser > reads the Exif APP1 segment and skips the other APP segments` | Internal. |
| formats/png.spec: eXIf chunk IFD0 and GPS | `exifr > reads the eXIf chunk of a PNG` | IHDR tags other than the size are not EXIF. |
| formats/png.spec: IHDR ImageWidth | `exifr > reads the size of a PNG without EXIF` | |
| formats/parser.spec: rejects random files | `exifr > throws UnsupportedError for other files` | |
| formats/parser.spec: accepts JPEG, TIFF, HEIC, PNG, AVIF | `exifr > *` tests per format | |
| highlevel/gps.spec | `exifr > reads the eXIf chunk of a PNG` | `latitude` and `longitude` are on every result. |
| highlevel/orientation.spec: orientation 1 to 8 | `exifr > reads Orientation` | `rotation()` is a CSS helper outside this package. |
| highlevel/thumb.spec | `exifr > returns the thumbnail`, `exifr > returns empty IFDs and no thumbnail for JPEGs without EXIF` | `thumbnailUrl()` is a DOM helper. |
| issues.spec: #2 001.tif, 002.tiff type 13 | `parse > accepts the IFD pointer type 13 for sub-IFD offsets` | Synthetic, since the files are 680 KB each. |
| issues.spec: #36 ExifImageHeight [78, 0] | `exifr > returns stored values for tags with the wrong count` | exifr returns 78, and `parse` returns what is stored. |
| issues.spec: fast-exif #2, 0xFF before marker | `exifr > skips 0xFF fill bytes before a JPEG marker` | |
| issues.spec: exif-js #124, #35 samsung HEIC, metadata-extractor #152 | skipped | 0.6 to 4.7 MB fixtures. The HEIC with `meta` after `mdat` is read the same way, by walking top-level boxes. |
| issues.spec: #31, #41, #44, #46, #59 | skipped | IPTC, ICC, XMP, and file-handle bugs. |
| fixtures.spec: basic fixture testing | `exifr > *` | For the copied fixtures. |
| BufferView, ChunkedReader, DynamicBufferView, bundles, webpack, icc, iptc, jfif, xmp-*, options, output-format, reader, sidecar specs | skipped | exifr internals, bundling, or other metadata formats. |

## Known upstream issues

| Issue | Test |
| --- | --- |
| exif-parser #36, #37: coordinates are negated when `GPSLatitudeRef` is missing | `known upstream issues > exif-parser #36: a coordinate without its reference tag is positive` |
| exif-parser #11: strings decoded with the wrong encoding | `known upstream issues > exif-parser #11: strings are decoded as UTF-8` |
| exif-parser #29: `RangeError` from an IFD that runs past the buffer | `known upstream issues > exif-parser #29: an IFD whose entries run past the end does not throw`, and the fuzz tests |
| exif-parser #30: the thumbnail's `Orientation` reported as the image's | `known upstream issues > exif-parser #30: the thumbnail Orientation does not replace the image Orientation` |
| exif-parser #17: `Invalid format: 0` thrown for an unknown tag type | `known upstream issues > exif-parser #17: a tag with format 0 is skipped instead of failing the parse` |
| exif-parser #41: TIFF files are not supported | `known upstream issues > exif-parser #41: TIFF files are read` |
| exif-parser #14, #23, #40: dates as UTC seconds | `parseDate > applies the offset option` and the `exif-parser` date tests |
| exif-parser #31: `imageSize` undefined when the SOF segment is past the bytes passed in | `parse > keeps the tags whose values lie before the end of the input` checks that `imageSize` is `undefined` in that case, as the README documents |
| exif-parser (no issue): SSHORT and SLONG read as unsigned | `known upstream issues > exif-parser: SSHORT and SLONG values are signed` |
| exif-parser (no issue): Exif IFD tags filed under the interop section | `known upstream issues > exif-parser: Exif IFD tags are not reported as interop tags` |
| exif-parser (no issue): any APP1 segment parsed as Exif | `known upstream issues > exif-parser: an APP1 segment that is not Exif, such as XMP, is skipped` |

## Oracle

`parse.oracle.test.ts` compares every tag, by IFD and name, with exif-parser on each JPEG fixture and on each TIFF and `.exif` fixture wrapped in a JPEG, both whole and cut to the 65,635 bytes exif-parser's README suggests. It also compares `imageSize`, the thumbnail, `DateTimeOriginal`, and `CreateDate` through `parseDate`, and the coordinates when both reference tags are present. Two exif-parser behaviors are normalized first, so the test doesn't lock them in: its Exif and interop tags share one section and are compared as one, and when it returns a tag as `undefined` because the value lies outside the data, the tag is dropped, as `parse` drops it.
