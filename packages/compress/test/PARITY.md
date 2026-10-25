# Test parity

Upstream suites: [pako 3.0.2 `test/`](https://github.com/nodeca/pako/tree/master/test) and [fflate 0.8.3 `test/`](https://github.com/101arrowz/fflate/tree/master/test). Fixtures `blank.gif`, `lorem.txt`, `lorem_cat.jpeg`, `lorem_en_100k.txt`, `lorem_utf_100k.txt`, `utf8.zip`, `issue_78.bin`, `bad_wbits.deflate`, `bad_wbits.txt`, `gzip-joined.gz`, `gzip-joined-bgzip.gz` and `raw-*.deflate-raw` (pako's `samples_deflated_raw/*.compressed`) are copied from pako (MIT, Vitaly Puzrin and Andrei Tuputcyn).

`CompressionStream` has no compression level, window size, memory level, strategy, dictionary, flush mode or gzip header fields, so the upstream tests of those options have no counterpart in our API. Where the option changes the compressed bytes, the oracle test decodes pako's output with every value instead.

## pako `helpers.mjs`, `inflate_roundtrip.test.mjs` and `binary_compare.test.mjs`

| Upstream test | Covered by | Notes |
| --- | --- | --- |
| Inflate defaults: inflate, no options | `round trips > deflate: <sample>` | One test per sample. |
| Inflate defaults: inflate raw, no options | `round trips > deflate-raw: <sample>` | |
| Inflate defaults: inflate raw from compressed samples | `decoding existing data > raw deflate sample <name>`; oracle `matches node:zlib > raw deflate sample <name>` | The oracle compares with `zlib.inflateRawSync`, as upstream does. |
| Inflate ungzip: with autodetect, with method set directly | `round trips > gzip: <sample>` | There is no autodetect. `format` defaults to gzip. |
| Inflate levels 0 to 9; Inflate RAW levels 0 to 9 | oracle `decodes what pako compresses > <sample>` | Decodes pako's output at every level in all three formats. |
| Inflate windowBits 8 to 15 | oracle `decodes what pako compresses > every window size` | windowBits 8 is written as 9 by zlib, so the test starts at 9. |
| Inflate strategy (5 tests) | oracle `decodes what pako compresses > every strategy` | |
| Inflate with dictionary (6 tests) | skipped | No dictionary in `DecompressionStream`. |
| Deflate vs canonical zlib snapshots and vs node.js zlib (defaults, levels, windowBits, memLevel, strategy, raw, dictionary) | oracle `matches node:zlib > our output decodes with node:zlib` and `compresses within 5% of zlib` | These compare pako's bytes with zlib's. Our bytes come from the platform's zlib, so the test checks that node:zlib reads them and that they are at most 5% larger than zlib's output. |

## pako `chunks.test.mjs`

| Upstream test | Covered by | Notes |
| --- | --- | --- |
| deflate 100b by 1b chunk; deflate 20000b by 10b chunk | skipped | Compression is one-shot, and `CompressionStream` covers streaming compression. |
| inflate 100b result by 1b chunk | `DecoderStream > 100 bytes, one byte per chunk` | |
| inflate 20000b result by 10b chunk | `DecoderStream > 20,000 bytes, ten bytes per chunk` | |
| Dummy push (force end): deflate end, inflate end | `DecoderStream > empty chunks` | Pushing an empty final chunk is the closest case. |
| Edge condition: should be ok on buffer border | `DecoderStream > 16 KiB + 1 of output, one byte per chunk` | |

## pako `deflate.test.mjs`

| Upstream test | Covered by | Notes |
| --- | --- | --- |
| handles a dictionary across multiple pushes | skipped | No dictionary. |
| accepts an ArrayBuffer the same as a Uint8Array | `round trips > reads a view with a byte offset` | Input is `Uint8Array` only, per the API conventions. The test checks a view that doesn't start at its buffer's start. |
| accepts a dictionary passed as ArrayBuffer | skipped | No dictionary. |
| throws on invalid init options | skipped | No level option. |
| throws when a dictionary is used with gzip compression | skipped | No dictionary. |
| returns false when pushing after the stream has ended | skipped | No push API. Writing after close is the platform's `WritableStream` behavior. |
| deflateRaw works without an options argument | `round trips > deflate-raw: <sample>` | |
| emits a partially filled buffer on Z_SYNC_FLUSH / Z_FULL_FLUSH | skipped | No flush modes. |
| round-trips issue #78 sample with memLevel: 1 | `round trips > pako issue #78 sample` | Without memLevel. |
| matches zlib block-type selection for Z_FIXED | skipped | No strategy option. |
| should not hang on wrong flush mode | skipped | No flush modes. |

## pako `inflate.test.mjs`

| Upstream test | Covered by | Notes |
| --- | --- | --- |
| ignores understated windowBits in the zlib header | `window.browser.test.ts`, `window.test.ts` | Depends on the runtime: Chromium decodes it, as pako does. Node's zlib keeps to the header's window and throws `InvalidInputError`. |
| accepts an ArrayBuffer the same as a Uint8Array | `round trips > reads a view with a byte offset` | |
| applies a dictionary early in raw mode | skipped | No dictionary. |
| throws on invalid init options | skipped | No windowBits option. |
| forces max window for raw mode when windowBits is 0 | `round trips > deflate-raw: <sample>` | The platform always uses the largest window. |
| Read with Z_SYNC_FLUSH emits the tail | `DecoderStream > emits output before the input ends` | Uses the same sync-flushed raw stream that node:zlib produces. |
| Read with Z_SYNC_FLUSH across multiple pushes (no double emit) | `DecoderStream > emits output before the input ends` | |
| gzip file with two members decodes both | `gzip members > joins every member, as gunzip does`; oracle `multi-member gzip files` | |
| anything after the first zlib stream is ignored | `data after the end > rejects a second zlib stream` | Deliberate difference: `decode` throws `InvalidInputError`. |
| autodetect over zlib: does not loop into trailing data | `data after the end > rejects a second zlib stream` | |
| gzip zero padding via ArrayBuffer is not misread as a new member | `data after the end > rejects zero padding after a gzip member` | Deliberate difference: `decode` throws `InvalidInputError`, as `DecompressionStream` does. |
| extra pushes after a finished stream return true and keep result | `data after the end > rejects bytes after a raw deflate stream` | Deliberate difference, as above. |
| pushes after a failed stream keep returning false | `DecoderStream > truncated input fails with TruncatedError` | The stream stays errored. |
| one-shot inflate throws on incomplete data | `truncated input > deflate cut before its end` | |
| streaming push(..., true) reports an error | `DecoderStream > truncated input fails with TruncatedError` | |
| raw truncated input also throws | `truncated input > deflate-raw cut before its end` | |
| complete input still succeeds | `truncated input > <format> cut before its end` | |

## pako `gzip_specials.test.mjs`

| Upstream test | Covered by | Notes |
| --- | --- | --- |
| Read custom headers; Write custom headers; Read header time past 2038 | skipped | Gzip header fields aren't exposed by `DecompressionStream`, so there is no header API. |
| Read stream with SYNC marks (multistream source, file 1) | `gzip members > the multi-member file from pako`; oracle `multi-member gzip files` | |
| Read stream with SYNC marks (multistream source, file 2) | `gzip members > a BGZF file`; oracle `multi-member gzip files` | |
| Write with Z_SYNC_FLUSH | skipped | No flush modes. |

## pako `strings.test.mjs`

| Upstream test | Covered by | Notes |
| --- | --- | --- |
| Inflate text output handles utf8 split across chunks | `round trips > text with every UTF-8 length survives` | Output is bytes. `TextDecoder` turns them into text. |
| Deflate javascript string (utf16) on input | `round trips > encodes a string as UTF-8` | |
| Inflate / InflateRaw / Ungzip with javascript string output | `round trips > encodes a string as UTF-8` | No `toText` option. |

## pako `zlib/inflate_cover.test.mjs` and `zlib/deflate_cover.test.mjs`

| Upstream test | Covered by | Notes |
| --- | --- | --- |
| Inflate states, Inflate cover, Inflate fast (38 hex cases) | `zlib inflate coverage > <case>` | Every hex case, with the format pako's windowBits selects. pako pushes the bytes without ending the stream, so cases that pass there with an incomplete stream are `TruncatedError` here, and the three cases with zero bytes after a complete raw stream are `InvalidInputError`. |
| inflate bad parameters; cover trees; Inflate support (window allocation) | skipped | These test zlib internals that `DecompressionStream` doesn't expose. |
| Inflate chunked input: byte-by-byte gzip with header | `DecoderStream > 100 bytes, one byte per chunk` | Without header fields, which `CompressionStream` can't write. |
| Deflate support, gzip header, flush / data type, states | skipped | These test the internals of pako's deflate. |

## pako `dist.test.mjs`

| Upstream test | Covered by | Notes |
| --- | --- | --- |
| loads CJS / ESM / UMD bundles | skipped | The package is published as one ESM build, which `pnpm bench` loads from `dist/`. |

## fflate

fflate's tests download five files (a short string, Moby Dick and three BMP images) and run each library in a worker.

| Upstream test | Covered by | Notes |
| --- | --- | --- |
| `0-valid.ts` compression: fflate output inflates with zlib | oracle `matches node:zlib > our output decodes with node:zlib` | On pako's samples instead of the downloaded files. |
| `0-valid.ts` decompression: zlib output inflates with fflate | oracle `decodes what fflate compresses > <sample>` and `matches node:zlib` | |
| `1-size.ts`: level 9 output within 5% of pako, uzip and zlib | oracle `matches node:zlib > compresses within 5% of zlib` | Against zlib's default level, because `CompressionStream` has no level. |
| `2-perf.ts` | `compress.bench.ts` | |
| `3-zip.ts`, `4-streams.ts`, `5-async.ts` | none | Empty files upstream. Zip is out of scope. |

## Known upstream issues

| Issue | Our behavior | Test |
| --- | --- | --- |
| fflate doesn't check the gzip CRC-32, so corrupt data decodes to wrong bytes. | `InvalidInputError`. | oracle `known upstream issues > fflate does not check the gzip CRC-32 or length (fflate #181)`; `corrupt input > a changed gzip CRC-32` |
| fflate allocates its output from the gzip length field, so a wrong field returns truncated output or a 143,000,000-byte array (fflate #161, #181). | `InvalidInputError`, and output grows only as the data decodes. | oracle `... trusts the gzip length field ...`; `corrupt input > a gzip length field that disagrees with the data` |
| fflate reads only the first gzip member (fflate #102). `DecompressionStream` throws on the second. | `decode` joins every member. | oracle `... reads only the first gzip member (fflate #102)`; `gzip members > *` |
| fflate loses output after more than 128 KiB of literals in one block (fflate #302, open). | Round trips. | `round trips > incompressible data larger than 128 KiB` |
| fflate hangs on data that needs a preset dictionary (fflate #173). | `InvalidInputError`. | `zlib inflate coverage > need dictionary` |
| pako and fflate have no output limit, so a small file can decompress to gigabytes (pako #310). | `maxBytes` and `MaxBytesError`. | `maxBytes > stops a zip bomb early`; `DecoderStream maxBytes > *`; oracle `pako and fflate have no output limit (pako #310)` |
| pako 2 returned `undefined` instead of throwing on some bad input (pako #283). | `InvalidInputError` or `TruncatedError`. | `corrupt input > *`, `truncated input > *` |
| node:zlib and pako ignore bytes after the end of the data. | `InvalidInputError`, as `DecompressionStream` does, so a damaged or concatenated file isn't read as a shorter valid one. | oracle `node:zlib and pako ignore bytes after the end of the data`; `data after the end > *` |
| `DecompressionStream` emits output chunks no larger than its input allows: 1 KiB input chunks of gzip give about 4 KiB of output each on Node. | `DecoderStream` joins input chunks that arrive while the decompressor is busy. | `compress.bench.ts` (gunzip a stream of 1 KiB chunks) |

## Oracle tests

`compress.oracle.test.ts` decodes what pako and fflate compress at every level, strategy, window size and memory level, and compares our output and checksums with node:zlib. `compress.fuzz.oracle.test.ts` compresses random data with node:zlib, mutates it, and checks that whenever `decode` returns bytes for gzip, deflate or raw deflate, zlib returns the same bytes. zlib accepts more input than `decode`, because it ignores bytes after the end of the data.
