# Test parity

Upstream suite: [image-size](https://github.com/image-size/image-size) `specs/*.spec.ts` at commit `06fad4f` (the last public commit, and npm's 2.0.4 adds bounds checks but no tests). The oracle test compares against image-size 2.0.4 from npm.

Fixtures in `fixtures/` are copied from image-size's `specs/images` (MIT, Copyright © 2013-Present Aditya Yadav). The icons in `fixtures/valid/ico/` are CC BY-SA 4.0 from iconarchive, as their `LICENSE.md` says. `fixtures/valid/png/animated.png` is a two-frame APNG made with Pillow for this package.

Tests load fixtures with `import.meta.glob(..., { query: '?url&inline' })`, which turns each file into a data URL that `fetch` reads in Node and in browsers. Plain `?inline` fails for extensions Vite doesn't know as assets, such as `.pfm`.

## `specs/valid.spec.ts`

| Upstream test | Covered by | Notes |
| --- | --- | --- |
| Valid images, one test per file in `specs/images/valid` | `valid images > <path>` for the same path | Each fixture is also parsed from 4 KiB chunks and from 1-byte chunks. `valid images > every fixture has an expected size` fails if a fixture has no expectation. |
| Expected `images` for `sample.heic` | `valid images > valid/heif/sample.heic` | Upstream lists the ICO sizes for `sample.heic`, a copy-paste slip that its test never checks because image-size returns no `images` there. Our test expects none. |

## `specs/invalid.spec.ts`

| Upstream test | Covered by | Notes |
| --- | --- | --- |
| Invalid images, one test per file in `specs/images/invalid` | `invalid images > <path>` | Upstream checks for a `TypeError` with `Invalid <format>`. Our test checks for `InvalidInputError`. |
| non-existent file | not applicable | There is no file API. Callers open the file and pass its stream. |

## `specs/others.spec.ts`

| Upstream test | Covered by | Notes |
| --- | --- | --- |
| Invalid invocation > passing buffer for tiff | `invalid images > a TIFF cut off before its first IFD is truncated` | Upstream throws "Invalid Tiff. Missing tags" for the first 2048 bytes. The IFD lies past them, so `parse` throws `TruncatedError`. |
| Invalid invocation > for a disabled image type | not applicable | `disableTypes` is global mutable state. Callers check `size.type` instead. |
| .types property | not applicable | The list is the `ImageSize.Type` union, which the type checker enforces. |

## `specs/fs-close.spec.ts`

| Upstream test | Covered by | Notes |
| --- | --- | --- |
| after done reading from files > should close the file descriptor | `parseStream > reads only the header of a large JPEG, then cancels the stream` | The stream equivalent of closing the file is cancelling the stream. |
| when Uint8Array allocation fails > should close the file descriptor | `parseStream > cancels the stream when the input is invalid`, `parseStream > passes on an error from the source stream` | A browser test can't replace the global `Uint8Array`. These cover cancelling on a parse error and passing on a source error. |

## `specs/bit-reader.spec.ts`

`BitReader` is an internal helper with no equivalent export. The JPEG XL fixtures exercise the same bit reading through `parse`.

| Upstream test | Covered by |
| --- | --- |
| Big-endian mode > should read single bits correctly | not applicable: JPEG XL is the only bit-packed header, and it is little-endian. |
| Big-endian mode > should read multiple bits correctly | not applicable, as above |
| Big-endian mode > should handle reading across byte boundaries | not applicable, as above |
| Big-endian mode > should throw an error when reaching end of input | not applicable, as above |
| Little-endian mode > should read single bits correctly | `valid images > valid/jxl-stream/small_square.jxl` (the 1-bit `small` flag) |
| Little-endian mode > should read multiple bits correctly | `valid images > valid/jxl-stream/small_rect.jxl` |
| Little-endian mode > should handle reading across byte boundaries | `valid images > valid/jxl-stream/large_explicit.jxl` |
| Little-endian mode > should throw an error when reaching end of input | `prefixes and corrupt headers > a prefix gives the full answer or throws TruncatedError` |
| Byte offset handling > should start reading from the third byte by default | every `valid/jxl-stream` fixture |
| Edge cases > should handle reading 0 bits | not applicable |
| Edge cases > should handle reading all bits from input | `valid images > valid/jxl-stream/max_small.jxl` |
| Edge cases > should handle reading bits at byte boundary | `valid images > valid/jxl-stream/min_large.jxl` |
| Edge cases > should handle reading bits across multiple bytes | `valid images > valid/jxl-stream/large_16_9.jxl` |
| Edge cases > should handle alternating between small and large bit reads | `valid images > valid/jxl/sample.jxl` |

## `specs/utils.spec.ts`

These test internal byte helpers. Our tests cover the formats that use them instead.

| Upstream test | Covered by |
| --- | --- |
| toUTF8String (2 tests) | the SVG and ICNS fixtures |
| toHexString (2 tests) | not applicable: the tests compare bytes directly |
| readInt16LE, readUInt16LE, readUInt24LE, readInt32LE, readUInt32LE | the BMP, GIF, ICO, TGA, WebP and little-endian TIFF fixtures, and `other formats > BMP stored top-down reports a positive height` for the signed read |
| readUInt16BE, readUInt32BE | the PNG, PSD, JPEG and big-endian TIFF fixtures |
| readUInt (2 tests) | `valid/tiff/little-endian.tiff`, `valid/tiff/big-endian.tiff` |
| readUInt64 (4 tests) | the three `valid/tiff/bigtiff-*` fixtures |
| findBox > should find box by name | every HEIF, JP2 and JXL fixture |
| findBox > should return undefined when box is not found | `HEIF > throws TruncatedError for a file that ends before its meta box` |
| findBox > should handle incomplete box data | `prefixes and corrupt headers > a prefix gives the full answer or throws TruncatedError` |
| findBox > should handle box size larger than remaining input | `prefixes and corrupt headers > a prefix gives the full answer or throws TruncatedError` |

## Known upstream issues

Bugs and gaps in image-size 2.0.4 found by reading its source and running it on crafted headers. The issue tracker couldn't be read from this environment. Each row has a test that would fail with image-size's behavior, and the oracle test lists the fixture it affects (`sample-multi.heic`) with the correct expectation.

| Issue | Test |
| --- | --- |
| Input too short for a fixed-offset read throws a `RangeError` from `DataView`, and an empty input does the same. | `truncated input > throws TruncatedError, not a RangeError, when the header is cut short`, `truncated input > throws TruncatedError for an empty input or stream`, `prefixes and corrupt headers > corrupt headers give a size or one of the package errors, never a RangeError` |
| JPEG: only SOF0, SOF1 and SOF2 are recognized, so lossless, hierarchical and arithmetic-coded JPEGs fail. | `JPEG > reads every start-of-frame marker, including lossless and arithmetic-coded` |
| JPEG: the marker right after SOI is skipped unread, so a frame header there is missed. | `JPEG > reads a frame header that directly follows the start-of-image marker` |
| JPEG: the Exif IFD0 is assumed to start 8 bytes into the TIFF header instead of at the offset the header stores. | `JPEG > follows the IFD0 offset in the Exif header instead of assuming 8` |
| JPEG: a frame header past the bytes read fails ("Corrupt JPG, exceeded buffer limits"), and `imageSizeFromFile` reads a fixed 512 KiB whatever the format needs. | `parseStream > reads only the header of a large JPEG, then cancels the stream`, `truncated input > throws MaxBytesError with the limit when maxBytes is reached first` |
| TIFF: tags are read past the IFD's entry count until a zero tag, so data after the IFD can overwrite width and height. | `TIFF > reads only the entries the IFD declares` |
| TIFF: the result carries an undocumented `compression` field. | `valid images > valid/tiff/*` (results equal `{ width, height, type }`) |
| ICNS: entries that aren't icons (`TOC `, `icnV`, `name`) are listed with `width: undefined`, and when one comes first the result's width is `undefined`. | `ICNS > skips entries that are not icons, such as the table of contents` |
| ICNS: a cut-off file returns only the icons found so far, so the largest can be missing. | `ICNS > throws TruncatedError when the entries run past the input` |
| HEIF: the clean aperture (`clap`) is applied by subtracting its width denominator from the width, and its height is ignored. `sample-multi.heic` reports a 63×64 second image whose aperture is 16×64. | `HEIF > applies the clean aperture to the primary image`, oracle `valid/heif/sample-multi.heic` |
| HEIF: the image rotation (`irot`) is ignored, so a portrait image stored rotated reports landscape dimensions. | `HEIF > swaps width and height for a 90 degree rotation`, `HEIF > keeps width and height for a 180 degree rotation` |
| HEIF: the size comes from the largest `ispe` property instead of the primary item (`pitm`), and every property is listed in `images`, which for a tiled photo means every tile. | `HEIF > reports the primary item, not the first or largest image property` |
| HEIF: animated AVIF (brand `avis`) is not detected. | `HEIF > detects animated AVIF` |
| SVG: a `viewBox` is split on single spaces only, so `0,0,100,100` or doubled spaces give a result with no width or height. | `SVG > reads a viewBox separated by commas or repeated spaces` |
| PNM: width and height must be on one line, separated by one space, so valid files that split them or put a comment between them fail. | `PNM > reads width and height split across lines with comments between`, `PNM > reads a PAM header in any order` |
| PNM: dimensions that aren't numbers give `NaN` instead of an error. | `PNM > rejects a header whose dimensions are not numbers` |
| `disableTypes` changes global state shared by every caller in the process. | not applicable: no such option |

## Stream behavior

These have no upstream counterpart, because image-size has no stream API.

| Test | What it checks |
| --- | --- |
| `parseStream > reads a PNG one byte at a time and stops after the IHDR chunk` | Exactly 24 bytes are read. |
| `SVG > waits for the whole root tag when streamed` | A root tag split across chunks is not parsed early. |
| `prefixes and corrupt headers > a prefix gives the full answer or throws TruncatedError` | No prefix of a fixture gives a different answer from the whole file. |
| oracle `gives the same size as image-size` | `parseStream` on three random chunkings of every fixture equals image-size's answer for the whole file. |
