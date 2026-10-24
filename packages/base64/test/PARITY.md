# Test parity

Upstream suites: [libbase64 1.4.1](https://github.com/nodemailer/libbase64/tree/master/test) (`libbase64-test.ts`, `libbase64-property-test.ts`, `package/`), [base64-js 1.5.1](https://github.com/beatgammit/base64-js/tree/master/test) and [js-base64 3.9.4](https://github.com/dankogai/js-base64/tree/main/test). `fixtures/alice.txt` is the public-domain text of *Alice's Adventures in Wonderland*, copied from libbase64 (MIT, Andris Reinman).

The package is designed fresh, so tests are mapped by the case they cover, not by API. Test names below are `file > describe > test`, with `base64` for `base64.conformance.ts`, `libbase64` for `libbase64.conformance.ts`, and so on.

## API mapping

| Upstream | @portable/base64 |
| --- | --- |
| libbase64 `encode(buffer)`, base64-js `fromByteArray`, js-base64 `fromUint8Array`, `encode(string)`, `btoa` | `encode(input)`. Strings are encoded as UTF-8. |
| libbase64 `wrap(encode(x), n)` | `encode(x, { lineLength: n })` |
| libbase64 `decode`, base64-js `toByteArray`, js-base64 `toUint8Array` | `decode(input)`, or `decode(input, { mode: 'mime' })` for libbase64's lenient reading |
| js-base64 `decode(string)`, `atob` | `new TextDecoder().decode(decode(input))` |
| js-base64 `encodeURI`, `fromUint8Array(x, true)` | `encode(x, { alphabet: 'base64url', omitPadding: true })` |
| libbase64 `new Encoder({ lineLength })`, `new Decoder()` | `new EncoderStream({ lineLength })`, `new DecoderStream({ mode: 'mime' })` |
| base64-js `byteLength(s)` | `decode(s).length` |

## libbase64: `libbase64-test.ts`

| Upstream test | Covered by | Notes |
| --- | --- | --- |
| #encode > should encode UTF-8 string to base64 | libbase64 > encode > encodes a string as UTF-8 | |
| #encode > should encode Buffer to base64 | libbase64 > encode > encodes bytes | |
| #encode > should encode a plain Uint8Array and a view into a larger buffer | libbase64 > encode > encodes a view into a larger buffer | |
| #decode > should decode base64 | libbase64 > decode > decodes base64, skipping line breaks | |
| #decode > should decode empty input to an empty buffer | libbase64 > decode > decodes empty input to no bytes | The types reject `null` and `undefined`. |
| #decode > should skip characters outside of latin1 | libbase64 > decode > skips characters outside Latin-1 in 'mime' mode | The default `'loose'` mode rejects them: base64 > decode > rejects invalid characters and padding in 'loose' mode. |
| #wrap > should wrap long base64 encoded lines | libbase64 > wrap > wraps long lines | There is no `wrap`. `encode` takes `lineLength` instead. |
| #wrap > should match line based wrapping for every kind of input | libbase64 > wrap > matches line based wrapping | Only base64 output is wrapped. Wrapping arbitrary strings is not offered. |
| #wrap > should terminate for a negative or zero line length and keep the content | libbase64 > wrap > rejects a line length that is not a positive integer | Deliberate difference: `encode` throws `RangeError` instead of falling back to 76. |
| #wrap > should wrap Buffer input and return empty input as an empty string | libbase64 > wrap > wraps empty input to an empty string | |
| base64 Streams > should transform incoming bytes to base64 | libbase64 > streams > encodes bytes written one at a time | |
| base64 Streams > should transform incoming bytes to limited base64 | not applicable | `skipStartBytes` and `limitOutputBytes` are dropped. Slice the output, or pipe it through a `TransformStream` that does. |
| base64 Streams > should transform incoming base64 to bytes | libbase64 > streams > decodes base64 written one byte at a time | |
| base64 Streams > should transform incoming bytes to base64 and back | libbase64 > streams > encodes and decodes a file | |
| base64 Streams > should count input and output bytes | not applicable | No `inputBytes` and `outputBytes` counters. Count chunks in a `TransformStream` if needed. |
| base64 Streams > should encode string writes with their encoding | libbase64 > streams > encodes string chunks as UTF-8 | String chunks are always UTF-8. For another encoding, write its bytes. |
| Decoder input > should skip 8-bit bytes like decode() does | libbase64 > decoder input > skips 8-bit bytes in 'mime' mode | |
| Decoder input > should skip whitespace and other characters outside of the base64 alphabet | libbase64 > decoder input > skips whitespace and other characters outside the alphabet in 'mime' mode | |
| Decoder input > should decode an unpadded tail when the stream ends | libbase64 > decoder input > decodes an unpadded tail when the stream ends | |
| Decoder input > should decode input without any base64 characters to nothing | libbase64 > decoder input > decodes input without base64 characters to nothing | |
| Decoder input > should ignore empty writes | libbase64 > decoder input > ignores empty chunks | |
| Padding inside the input > should decode padded lines concatenated | libbase64 > padding inside the input > decodes padded lines concatenated in 'mime' mode | `'loose'` mode rejects data after padding, as `Uint8Array.fromBase64` does. |
| Padding inside the input > should decode padded segments separated by whitespace | libbase64 > padding inside the input > decodes padded segments separated by whitespace in 'mime' mode | |
| Padding inside the input > should not change decoding of Buffer input | not applicable | libbase64 returns a `Buffer` argument unchanged. Our `decode` reads bytes as base64 text, as `string \| Uint8Array` inputs do in every package. |
| Padding inside the input > should stream decode padded lines with any chunk size | libbase64 > padding inside the input > stream decodes padded lines with any chunk size | |
| Padding inside the input > should stream decode padding split across chunks | libbase64 > padding inside the input > stream decodes padding split across chunks | Also checks a `==` split across chunks in `'loose'` mode. |
| Padding inside the input > should round trip random data through Encoder and Decoder | libbase64 > padding inside the input > round trips random data through both streams | |
| Padding inside the input > should decode every input like segment by segment decoding | libbase64 > padding inside the input > decodes every input like segment by segment decoding | Compared with libbase64's reference decoder here and with libbase64 itself in `base64.oracle.test.ts`. |
| Padding inside the input > should decode many padded segments in memory proportional to the input | base64 > known upstream issues > libbase64 1.3.3: many padded segments decode into one buffer of the right size | Checks the output size. Upstream runs a child Node process with a 128 MB heap, which a browser can't. |
| Padding inside the input > should round trip separately encoded parts | libbase64 > padding inside the input > round trips separately encoded parts | |
| Encoder output > should not depend on how the input is chunked | libbase64 > encoder output > does not depend on how the input is chunked | |
| Encoder output > should never end with a line break | libbase64 > encoder output > never ends with a line ending | |
| Encoder output > should apply padding, skipped bytes and the output limit to the wrapped output | not applicable | `startPadding`, `skipStartBytes` and `limitOutputBytes` are dropped. |
| Encoder output > should skip output across several chunks | not applicable | As above. |
| Encoder output > should only use whole line lengths | libbase64 > encoder output > rejects a line length that is not a positive integer | Deliberate difference: `EncoderStream` throws instead of rounding down or falling back to 76. |
| Encoder output > should ignore empty writes | libbase64 > encoder output > ignores empty chunks | |
| Encoder output > should emit nothing for an output limit reached in an earlier chunk | not applicable | No output limit. |
| Encoder output > should not change the output for an empty start padding or zero skipped bytes | not applicable | No start padding or skipped bytes. |
| Encoder output > should not wrap when line length is false | libbase64 > encoder output > does not wrap when lineLength is false | Not wrapping is also our default. |
| Default export > should expose the same members as the named exports | not applicable | Named exports only. |

## libbase64: `libbase64-property-test.ts`

fast-check is replaced by loops over seeded random inputs of the same shapes (`randomBytes`, `randomChunkSizes`, `encodedLike` in `utils.ts`), and the reference encoder, decoder and wrapper are ported into `utils.ts`.

| Upstream test | Covered by | Notes |
| --- | --- | --- |
| encode matches the reference encoder and Buffer | libbase64 properties > encode matches the reference encoder | Buffer: oracle > matches Buffer > encode. |
| encode of a string encodes its UTF-8 bytes | libbase64 properties > encode of a string encodes its UTF-8 bytes | |
| decode reverses encode, also for wrapped and separately padded parts | libbase64 properties > decode reverses encode, also for wrapped and separately padded parts | Separately padded parts use `'mime'` mode. |
| decode matches the reference decoder for any input | libbase64 properties > 'mime' decode matches the reference decoder for any input | |
| the Decoder stream matches decode for any input and any chunking | libbase64 properties > the 'mime' decoder stream matches decode for any input and chunking | `'loose'` and `'strict'`: base64 > DecoderStream > matches decode for any chunking. |
| the Encoder stream matches wrap(encode()) for any chunking and line length | libbase64 properties > the encoder stream matches encode for any chunking and line length | |
| the Encoder stream without wrapping matches encode | libbase64 properties > the encoder stream without wrapping matches encode | |
| the Encoder applies start padding, skipped bytes and the output limit to the wrapped output | not applicable | Options dropped. |
| wrap splits plain base64 into lines of the line length | libbase64 properties > wrapping splits base64 into lines of the line length | |
| wrap keeps the line based behaviour for anything else | not applicable | Arbitrary strings are not wrapped. |
| the Decoder delivers everything to a slow consumer | libbase64 properties > the decoder stream delivers everything to a slow reader | |

## libbase64: `package/package-test.ts` and `package/types-consumer-test.ts`

These check libbase64's dual CommonJS and ES module build, its `exports` map, `npm pack` contents, and type-checking consumers under several `moduleResolution` settings. They don't apply: the package is ES modules only and zile builds it. The planned `environments/` checks in `docs/architecture.md` will cover packaging for every package.

## base64-js

| Upstream test | Covered by | Notes |
| --- | --- | --- |
| big-data.js > convert big data to base64 | base64-js > converts big data to base64 and back | 64 MB, as upstream. `byteLength` is `decode(s).length`. |
| convert.js > convert to base64 and back | base64-js > converts to base64 and back | |
| convert.js > convert known data to string | base64-js > converts known data to a string | |
| convert.js > convert known data from string | base64-js > converts known data from a string | |
| corrupt.js > padding bytes found inside base64 string | base64-js > rejects data after padding, or decodes it in mime mode | Deliberate difference: base64-js stops at the first `=` and returns `[73]`. `'loose'` mode throws `InvalidInputError`, and `'mime'` mode decodes both segments. |
| url-safe.js > decode url-safe style base64 strings | base64-js > decodes url-safe strings | base64-js accepts both alphabets mixed. Here, pass `alphabet: 'base64url'`, or use `'mime'` mode for either. |

base64-js's `bench/bench.js` and `bench/basic.js` time 1 MB encode, decode and `byteLength`. `base64.bench.ts` covers the same sizes.

## js-base64

| Upstream test | Covered by | Notes |
| --- | --- | --- |
| atob.js > basic, whitespace, null | js-base64 > basic, whitespace, null | `btoa` and `atob` map to `encode` and `decode` of Latin-1 bytes. |
| atob.js > binary | js-base64 > binary | |
| bom.js > decode keeps a leading BOM, round-trips a leading BOM, round-trips a lone BOM | js-base64 > BOM | `decode` returns bytes, so the BOM is always kept. `TextDecoder` strips it unless `ignoreBOM: true`. |
| dankogai.js > basic, whitespace, null | js-base64 > basic, whitespace, null | |
| dankogai.js > Base64 > .encode, .encodeURI, .decode | js-base64 > Base64 | js-base64 decodes base64url with the default call, but `decode` needs `alphabet: 'base64url'` or `'mime'` mode. |
| dankogai.js > isValid | not applicable | No validation function. `decode(s, { mode: 'strict' })` throws on invalid input. js-base64 calls `'Z'` valid, although it decodes to nothing. |
| dankogai.js > fromUint8Array | js-base64 > fromUint8Array | |
| dankogai.js > toUint8Array | js-base64 > toUint8Array | |
| es5.js, es6.mjs > String extensions | not applicable | The package doesn't extend `String.prototype`. |
| large.js > Large Base64 | js-base64 > large | |
| surrogate.js > lone high surrogate + 'F' round-trips | js-base64 > replaces a lone surrogate with U+FFFD, as TextEncoder does | Deliberate difference: js-base64's own UTF-8 code keeps lone surrogates. `encode` uses `TextEncoder`, which replaces them. |
| umd.js | not applicable | ES modules only. |
| yoshinoya.js | js-base64 > Yoshinoya | |
| types.cts, types.mts | not applicable | Type-level checks of js-base64's declarations. `tsc -b` checks ours. |

## Known upstream issues

libbase64 has no issue tracker, so its rows come from its changelog. Each row has a test in `base64.conformance.ts` under `known upstream issues` unless it says otherwise.

| Issue | What went wrong upstream | Ours |
| --- | --- | --- |
| base64-js #81, #47 | `toByteArray('G\x7F==')` drops the DEL character and returns `[24]`. | `InvalidInputError`, or skipped in `'mime'` mode. |
| base64-js #73 | `toByteArray('====')` throws "Invalid typed array length: -1". | `InvalidInputError`, or no bytes in `'mime'` mode. |
| base64-js #45, #41 | Unpadded input throws "Length must be a multiple of 4". | `'loose'` mode accepts it. |
| base64-js #31 | Line breaks in the input are not skipped. | Skipped in every mode. |
| base64-js #42 | Concatenated base64 files stop at the first padding. | `'mime'` mode decodes each segment (libbase64 > padding inside the input). |
| base64-js #38, #43 | Negative numbers or an `Int8Array` encode to wrong output, including the text `undefined`. | `encode` reads any typed array, `DataView` or `ArrayBuffer` as the bytes in memory, and throws `TypeError` for anything else, such as a plain array. |
| base64-js #44 | A `Buffer` of base64 text crashes `toByteArray`. | `decode` takes bytes. |
| js-base64 #164 | Callers stripped one `=` with `replace('=', '')` and kept the second. | `omitPadding` removes all padding. |
| js-base64 #176 | Decoding a JWT throws "malformed base64". | A JWT segment decodes with `alphabet: 'base64url'`. The whole token throws `InvalidInputError` because of the `.`. |
| js-base64 #175 | Hermes' `atob` mis-decodes valid input, and js-base64 calls `atob`. | The package never calls `atob`. No test: it needs Hermes. |
| js-base64 #170 | Concern that chunking breaks multi-byte characters. | `EncoderStream` gives the same output for byte chunks split inside a character as for the whole string. |
| libbase64 1.3.1 | `decode` stopped at the first padding. | `'mime'` mode decodes every segment. |
| libbase64 1.3.2 | Encoder line breaks depended on chunk boundaries. | libbase64 > encoder output > does not depend on how the input is chunked. |
| libbase64 1.3.3 | A `Buffer` per padded segment used memory many times the input. | One output buffer, sized exactly. |
| libbase64 1.4.0 | `Decoder` read 8-bit bytes as base64 digits (the high bit was cleared), and `encode(Uint8Array)` returned comma-separated numbers. | libbase64 > decoder input > skips 8-bit bytes in 'mime' mode, and libbase64 > encode > encodes bytes. |
| libbase64 1.4.1 | `decode` read the low byte of characters above U+00FF, so `Ł` decoded as `A`. | libbase64 > decode > skips characters outside Latin-1 in 'mime' mode. |
| libbase64 (all versions) | `Decoder` skips `-` and `_`, but `decode` reads them as base64url digits, so the stream and the function disagree. | `'mime'` mode reads both alphabets in `decode` and `DecoderStream`. The oracle test removes `-` and `_` before comparing with libbase64's `Decoder`. |

The oracle tests use libbase64 1.3.3, because 1.4.x was published less than a day before this package and `minimumReleaseAge` refuses it. They avoid the inputs 1.3.3 gets wrong (8-bit and non-Latin-1 characters, and `encode` of a plain `Uint8Array`), so no upstream bug is locked in.
