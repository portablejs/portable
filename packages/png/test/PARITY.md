# Test parity

Upstream suite: [pngjs](https://github.com/pngjs/pngjs) 7.0.0 `test/*-spec.js` and `test/run-compare.js` at commit `c565210`. The oracle test compares against pngjs 7.0.0 from npm.

## Fixtures

- `fixtures/pngsuite/` is [PngSuite](http://www.schaik.com/pngsuite/) by Willem van Schaik, as pngjs ships it in `test/in`, with `PngSuite.LICENSE` and `PngSuite.README`. The license allows copying for any purpose without fee. pngjs's 15 MB `large.png` is left out. The benchmark uses the 1024x1024 `accum.png` instead.
- `fixtures/pngjs/` holds pngjs's `test/png-parse-data` files, `test/bg-ref.png`, and `test/in/gh-21.png` (MIT, Copyright (c) 2015 Luke Page & Original Contributors, and (c) 2012 Kuba Niegowski).

## API changes

pngjs's API is a Node stream class with events, plus `PNG.sync`. Ours is four functions, designed for the shared [API conventions](../../../AGENTS.md#api-conventions). Each pngjs test maps to the test for the same case below.

| pngjs | @portable/png | Why |
| --- | --- | --- |
| `fs.createReadStream(f).pipe(new PNG()).on('parsed', cb)`, `new PNG().parse(buf, cb)` | `await Png.decode(bytes)` | A promise instead of events. PNG can't be decoded before the last IDAT anyway, so a stream input wouldn't make the result arrive sooner. |
| `PNG.sync.read(buf)` | `Png.decodeSync(bytes, { inflate })` | Web platforms have no sync zlib, so the caller passes one, such as fflate's `unzlibSync`. |
| `png.pack().pipe(out)`, `PNG.sync.write(png, opts)` | `await Png.encode(image, options)`, `Png.encodeSync(image, { deflate })` | |
| `metadata` event | Fields of the result: `depth`, `colorType`, `interlace`, `alpha`, `gamma` | |
| `checkCRC` | `checkCrc` | |
| `filterType: -1` or a number | `filter`: a filter, or a list to choose from per row | pngjs's types allow a list but its code throws for one. |
| `bgColor` | `background` | |
| `deflateLevel`, `deflateStrategy`, `deflateChunkSize`, `deflateFactory` | `deflate` | `CompressionStream` has no settings, so to choose a level, pass a zlib function. |
| `inputColorType`, `inputHasAlpha`, `bitDepth: 16` on write | not supported | Input is always 8-bit RGBA, the form `decode` returns and canvas `ImageData` holds. |
| `skipRescale` | not supported | `data` is always 8-bit RGBA. |
| `bitblt`, `adjustGamma` | not supported | Pixel manipulation, not PNG coding. |
| `gamma` is `0` without `gAMA` | `gamma` is `undefined` | |

## `test/png-parse-spec.js`

| Upstream test | Covered by | Notes |
| --- | --- | --- |
| should correctly parse an 1-bit colormap png | `pngjs png-parse-spec > parses a 1-bit colormap image` | |
| should correctly parse an 8-bit grayscale png | `pngjs png-parse-spec > parses an 8-bit grayscale image` | The file has bytes after IEND, which pngjs's sync reader rejects. |
| should correctly parse an 8-bit truecolor png | `pngjs png-parse-spec > parses an 8-bit truecolor image` | |
| should correctly parse an 8-bit truecolor png with alpha | `pngjs png-parse-spec > parses an 8-bit truecolor image with alpha` | |
| should correctly read image with scanline filter | `pngjs png-parse-spec > reads an image with scanline filters` | |
| should correctly read an indexed color image | `pngjs png-parse-spec > reads an indexed color image` | |
| should correctly read an indexed color image with alpha | `pngjs png-parse-spec > reads an indexed color image with alpha` | |
| should correctly support crazily-filtered images | `pngjs png-parse-spec > reads an image that uses every filter type` | |
| should bail with an error given an invalid PNG | `pngjs png-parse-spec > rejects input that is not a PNG` | `InvalidInputError`. |
| should bail with an error given an empty file | `pngjs png-parse-spec > rejects an empty file` | `InvalidInputError`, because the signature is missing. |
| should bail with an error given a bad chunk type | `pngjs png-parse-spec > rejects a bad chunk type` | |
| should bail with an error given a truncated PNG | `pngjs png-parse-spec > rejects a truncated file` | `TruncatedError`. |
| should return an error if a PNG is normal except for a missing IEND | `pngjs png-parse-spec > rejects a file with no IEND` | `TruncatedError`. |
| should set alpha=true in metadata for images with tRNS chunk | `pngjs png-parse-spec > reports alpha for an image with a tRNS chunk` | |
| Should parse with low highWaterMark | not applicable | Tests Node stream buffering. `decode` takes the whole file. |

## `test/convert-images-spec.js`

| Upstream test | Covered by | Notes |
| --- | --- | --- |
| convert sync - `<file>`, for each file in `test/in` | `pngjs convert-images-spec > converts <file>` and `> rejects <file>` | Files starting with `x` must fail, the rest must decode. Each file is decoded with `decode` and `decodeSync`, and its re-encoded output decodes to the same pixels with both. |
| convert async - `<file>` | the same tests | |

## `test/bg-spec.js`

| Upstream test | Covered by | Notes |
| --- | --- | --- |
| outputs background, created from scratch | `pngjs bg-spec > writes a checkerboard created from scratch` | Upstream compares the file bytes with `bg-ref.png`. Our deflate differs from zlib's level 9 with `Z_RLE`, so the test compares decoded pixels. |

## `test/run-compare.js` and `test/index.html`

| Upstream test | Covered by | Notes |
| --- | --- | --- |
| Chrome renders each converted image the same as the original (up to 10 failures allowed) | `png.browser.test.ts > decodes PngSuite like the browser does > <file>` and `> the browser decodes our output to the input pixels` | We compare our pixels with Chromium's `createImageBitmap` on every valid PngSuite file. Opaque pixels match exactly, except that 16-bit samples may differ by 1. Color isn't compared where alpha is below 255, because canvas stores premultiplied pixels. No failures are allowed. |

## Oracle tests

`png.oracle.test.ts` decodes every fixture with pngjs's stream parser and with ours and compares the metadata and pixels. pngjs rejects the same 15 files we do. It also checks that pngjs decodes our output of every fixture to the input pixels, that both encoders' output of every color type and filter decodes the same, and that on 12 random images each library decodes the other's output to the same pixels.

Two differences are deliberate, and the oracle test leaves them out instead of asserting pngjs's behavior:

- A pixel that matches the `tRNS` color gets alpha 0 and keeps its color. pngjs sets it to black. The oracle compares fully transparent pixels by alpha only.
- Grayscale output (`colorType` 0 or 4) is the BT.709 luma of each pixel, as libpng's `png_set_rgb_to_gray` computes it. pngjs averages the three channels, which makes pure green as dark as pure red. The oracle compares gray output on gray input, where both give the same value.

## Known upstream issues

pngjs's issue tracker couldn't be read from this environment (GitHub's API and pages were blocked). These come from pngjs's changelog, its source, and running it on the fixtures and on crafted files. Each has a test.

| Issue | Test |
| --- | --- |
| `PNG.sync.read` throws "unrecognised content at end of stream" for bytes after IEND (since 6.0.0), so it rejects the `grayscale.png` that its own async test parses. | `decode > ignores bytes after IEND`, `pngjs png-parse-spec > parses an 8-bit grayscale image` |
| A file with no IDAT (`xdtn0g01.png`): the stream parser calls back with neither an error nor an image, and the sync reader throws an unrelated "Unrecognised filter type". | `known upstream issues > rejects a file with no IDAT instead of returning nothing` |
| Truncated images hung the stream parser (fixed in 3.4.0). | `known upstream issues > rejects every truncation of a file instead of hanging` |
| zlib data followed by garbage inside IDAT failed (fixed in 3.1.0). | `known upstream issues > decodes a zlib stream followed by garbage inside IDAT` |
| Single-pixel images failed (fixed in 3.0.1). | `known upstream issues > round-trips a single pixel` |
| Non-square interlaced images decoded wrongly (fixed in 1.0.1). PngSuite's interlaced files are all square. | `known upstream issues > decodes interlaced images of every small width and height` |
| Interlaced images are inflated with no output limit, so a small IDAT can expand to far more than the image needs. | `known upstream issues > stops at the image size when IDAT inflates to more data than the image needs` |
| pngjs sizes its inflate buffer from IHDR alone. A 100000x100000 RGBA header with 19 bytes of IDAT makes it allocate 40 GB and throw `RangeError: Failed to allocate memory`. A header just small enough to allocate would use that memory for nothing. | `known upstream issues > rejects a header that claims more pixels than the data can hold, before allocating` |
| pngjs has no limit on image size, so a valid 1.2 MB file of a 1-bit 100000x100000 image decodes to 40 GB of RGBA. `maxPixels` rejects it from IHDR. | `decode > throws MaxPixelsError for a huge header with little data` |
| A palette index can point past the end of PLTE. pngjs throws, and some decoders read outside the palette. | `known upstream issues > rejects a palette index past the end of PLTE` |
| `tRNS` pixels lose their color, and grayscale output averages the channels. | See the oracle section above, and `decode > makes the tRNS color fully transparent and keeps its value`, `encode > writes grayscale as BT.709 luma, blended onto white` |

## Benchmarks

pngjs has no benchmark. `png.bench.ts` decodes and encodes the 1024x1024 `accum.png` with ours and pngjs. Node has no native PNG codec, so the native APIs measured are `DecompressionStream` and `CompressionStream`, which our default path uses, against `node:zlib` through `decodeSync` and `encodeSync`.
