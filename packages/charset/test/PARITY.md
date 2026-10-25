# Test parity

Upstream suite: [iconv-lite 0.7.3 `test/`](https://github.com/pillarjs/iconv-lite/tree/v0.7.3/test). This package only encodes, so decode-only tests map to "not applicable: decoding is `TextDecoder`". Test names below are `file > describe > test`.

Besides the ported cases, `charset.oracle.test.ts` compares every code point of every charset, and 20 random strings with unmappable characters per charset, against iconv-lite. Each difference must match a reason in `explain()`, and every reason is listed under "Known upstream issues" or "API changes" below. `roundtrip.conformance.ts` checks that every code point we encode decodes back with `TextDecoder`, which runs in Chromium for all charsets and in Node for those where its ICU decoder agrees with WHATWG.

## main-test.js

| Upstream test | Covered by | Notes |
| --- | --- | --- |
| should not detect prototype properties as encodings | `labels > normalizeLabel > returns undefined for unknown labels and object prototype keys` | |
| should detect encodings | `labels > normalizeLabel > maps every encoding name to itself` | |
| should detect all available encodings | `labels > normalizeLabel > accepts iconv-lite names` | Only the iconv-lite names for WHATWG charsets. |
| should not detect 'constructor' as encoding when _codecDataCache is defined | `labels > load > rejects unknown labels and the replacement encoding with UnsupportedError` | There is no cache to poison. That test also calls `load('constructor')`. |
| Return values are of correct types | `encode > encode > returns a Uint8Array` | |
| Internal encodings all correctly encoded/decoded | `encode > encode > encodes UTF-8 and UTF-16LE text that decodes back to the input` | `binary`, `base64` and `hex` are not charsets. See API changes. |
| Base64 correctly encoded/decoded | not applicable | Use `@portable/base64`. |
| Hex correctly encoded/decoded | not applicable | Use `Bytes.toHex` from `@portable/bytes`. |
| Latin1 correctly encoded/decoded | `encode > encode > encodes Latin-1 text with the latin1 label` | `latin1` is windows-1252, as in WHATWG. |
| Convert to string, not buffer (utf8 used) | not applicable | Decoding. |
| Throws on unknown encodings | `labels > load > rejects unknown labels and the replacement encoding with UnsupportedError` | |
| Convert non-strings and non-buffers | `encode > encode > reads Uint8Array input as UTF-8` | Input is typed `string \| Uint8Array`, and there is no implicit `String()` conversion. |
| Aliases toEncoding and fromEncoding work the same as encode and decode | not applicable | No aliases. |
| handles Object & Array prototypes monkey patching | `labels > load > loads encodings after Object and Array prototypes are extended` | |
| handles encoding untranslatable characters correctly | `encode > unmappable characters > are written as '?' by default` | Regression #162. |
| Canonicalize: works with numbers directly | `labels > normalizeLabel > accepts iconv-lite names` | Labels are strings, and the test covers `'1251'`. |
| Canonicalize: correctly strips year and non-alpha chars | `labels > normalizeLabel > ignores case, punctuation and a trailing year` | |

## Single-byte: sbcs, cyrillic, greek, turkish

| Upstream test | Covered by | Notes |
| --- | --- | --- |
| Full SBCS encoding tests: Encode | `charset.oracle > <name> matches iconv-lite > on every code point` and `roundtrip > <name>` | Every WHATWG single-byte charset, every code point. |
| Full SBCS encoding tests: Decode | not applicable | Decoding. |
| ISO-8859-8-I / ISO-8859-8-E aliases | `charsets > single-byte charsets > ISO-8859-8-I and ISO-8859-8-E encode like ISO-8859-8` | |
| Cyrillic, Greek, Turkish: Convert to buffer | `charsets > single-byte charsets > <name> > encodes text` | Same strings for windows-1251, KOI8-R, ISO-8859-5, windows-1253, ISO-8859-7, windows-1254 and ISO-8859-9. |
| Try different variations of encoding | `charsets > single-byte charsets > <name> > encodes the same with every label` | |
| Untranslatable chars are converted to defaultCharSingleByte | `charsets > single-byte charsets > <name> > writes '?' for each unmappable character` | |
| Convert from buffer | not applicable | Decoding. |

cp437, cp737, cp850, cp866 (as distinct from IBM866) and the other DOS and Mac code pages iconv-lite has are not WHATWG charsets and are phase 2.

## Multi-byte: dbcs, big5, gbk, shiftjis

| Upstream test | Covered by | Notes |
| --- | --- | --- |
| Full DBCS encoding tests: Encode | `charset.oracle > <name> matches iconv-lite > on every code point` and `roundtrip > <name>` | GBK, gb18030, Big5, Shift_JIS, EUC-JP, EUC-KR. iconv-lite's cp932, cp936, cp949 and cp950 resolve to these by label. |
| Full DBCS encoding tests: Decode | not applicable | Decoding. |
| Big5 correctly encoded/decoded | `charsets > Big5 > encodes Chinese and ASCII text` | |
| cp950 correctly encoded/decoded | `labels > normalizeLabel > accepts iconv-lite names` | `cp950` is Big5. |
| Big5 file read decoded, compare with iconv result | not applicable | Decoding. |
| Big5 correctly decodes and encodes characters · and × | `charsets > Big5 > encodes · and ×` | |
| Big5 correctly encodes & decodes sequences | `roundtrip > Big5` | |
| Big5 correctly encodes 十 | `charsets > Big5 > encodes 十, 卅 and the box drawings that appear twice in the index with their last pointer` | |
| Big5 correctly encodes 起 (issue #264) | `charsets > Big5 > encodes 起 with its Big5 code, not its HKSCS code` | |
| GBK correctly encoded/decoded | `charsets > GBK and gb18030 > encode Chinese and ASCII text` | |
| GB2312 correctly encoded/decoded | `labels > normalizeLabel > follows WHATWG where a label means something else in iconv-lite` | `gb2312` is GBK. |
| GBK file read decoded, compare with iconv result | not applicable | Decoding. |
| GBK correctly decodes and encodes characters · and × | `charsets > GBK and gb18030 > encode · and ×` | |
| GBK and GB18030 correctly decodes and encodes Euro character | `charsets > GBK and gb18030 > GBK writes € as 0x80 and gb18030 as A2 E3` | |
| GB18030 findIdx works correctly | `charsets > GBK and gb18030 > gb18030 writes four-byte sequences` | `findIdx` is internal, so the test checks the range lookup through its output. |
| GB18030 encodes/decodes 4 byte sequences | `charsets > GBK and gb18030 > gb18030 writes four-byte sequences` | |
| GB18030 correctly decodes incomplete 4 byte sequences | not applicable | Decoding. |
| GB18030:2005 changes are applied | `charsets > GBK and gb18030 > gb18030 applies the GB18030-2005 changes` | |
| ShiftJIS correctly encoded/decoded | `charsets > Shift_JIS > encodes Japanese and ASCII text` | |
| ShiftJIS extended chars are decoded, but not encoded | `charsets > Shift_JIS > does not encode the user-defined area that F0 40 to F9 FC decode to` | |
| ShiftJIS includes extensions | `charsets > Shift_JIS > includes the NEC extensions` | |

## bom, utf16, utf32, utf7, cesu8

| Upstream test | Covered by | Notes |
| --- | --- | --- |
| adds UTF-8 BOM when addBOM=true | `encode > byte order mark > is written for UTF-8 with bom` | |
| adds UTF-16 BOMs when addBOM=true | `encode > byte order mark > is written for UTF-16LE and UTF-16BE with bom` | |
| 'UTF-16' encoding adds BOM by default, but can be overridden | `encode > byte order mark > is not written by default, also for the utf-16 label` | Deliberate change. See API changes. |
| strips UTF-8 / UTF-16 BOM, doesn't strip when stripBOM=false, stripBOM callback | not applicable | Decoding. `TextDecoder` has `ignoreBOM`. |
| adds/strips UTF-7 BOM | not applicable | UTF-7 is phase 2. |
| UTF-16BE codec: encodes basic strings correctly | `encode > UTF-16 > encodes UTF-16BE` | |
| UTF-16 encoder: uses UTF-16LE and adds BOM | `encode > byte order mark > is not written by default, also for the utf-16 label` | |
| UTF-16 encoder: can use other encodings with BOM | `encode > byte order mark > is written for UTF-16LE and UTF-16BE with bom` | |
| UTF-16 and UTF-16BE decoder tests | not applicable | Decoding. |
| utf32-test.js, utf7-test.js, cesu8-test.js | not applicable | Not WHATWG charsets, so phase 2. |

## streams-test.js

| Upstream test | Covered by | Notes |
| --- | --- | --- |
| Simple stream encoding | `encode > EncoderStream > encodes string chunks` | |
| Stream encoder should error when fed with buffers | `encode > EncoderStream > reads Uint8Array chunks as UTF-8, also when a character is split` | Deliberate change: bytes are UTF-8 text input. Other chunk types error: `errors on chunks that are neither strings nor Uint8Arrays`. |
| Round-trip encoding and decoding | `encode > EncoderStream > round-trips through TextDecoderStream` | |
| Encoding using internal modules: utf8 | `encode > EncoderStream > encodes UTF-8` | |
| encodeStream.collect() | `encode > EncoderStream > collects into one Uint8Array` | Use `new Response(stream).bytes()`. There is no sugar method. |
| Encoding using internal modules with surrogates in separate chunks (10 cases) | `encode > EncoderStream > surrogate pairs split across chunks > <case>` | Same 10 cases, run for UTF-8, gb18030 and UTF-16LE, plus an empty chunk between the halves. |
| Feeder outputs strings / buffers / buffers with encoding | not applicable | Test helpers for Node stream output modes. |
| Decoding tests (13) | not applicable | Decoding. `TextDecoderStream` covers them. |
| Encoding base64 between chunks, UTF-7-IMAP between chunks | not applicable | Not charsets / phase 2. |

## Known upstream issues

Each has a test here. The oracle accepts iconv-lite's differing bytes only for these reasons.

| Issue | Our test |
| --- | --- |
| U+FFFD is encoded as a byte the charset leaves undefined (0xFF in ISO-8859-7, others in ISO-8859-3/6/8, windows-125x, macintosh). | `charsets > single-byte charsets > encode U+FFFD as '?', not as a byte the charset leaves undefined` |
| Lone surrogates are written raw in UTF-16, producing invalid UTF-16. | `encode > surrogates > encodes a lone surrogate as U+FFFD` |
| GBK encodes U+E7C7 as a four-byte gb18030 sequence, which GBK decoders reject. | `charsets > GBK and gb18030 > GBK has no four-byte sequences` |
| gb18030 encodes U+E5E5 as A3 A0, which decodes to U+3000. | `charsets > GBK and gb18030 > U+E5E5 is unmappable, because A3 A0 decodes to U+3000` |
| GBK and gb18030 miss the GB18030-2022 mappings of U+9FB4-9FBB and U+FE10-FE19. | `charsets > GBK and gb18030 > gb18030 writes the GB18030-2022 characters with their two-byte codes` |
| Big5 encodes 3837 HKSCS characters with lead bytes below 0xA1, which WHATWG decodes but never encodes. | `charsets > Big5 > does not encode HKSCS characters below lead byte 0xA1` |
| EUC-JP encodes JIS X 0212 (8F lead), which WHATWG decodes but never encodes, and prefers it for 282 characters that JIS X 0208 also has. | `charsets > EUC-JP > does not encode JIS X 0212 characters` |
| Shift_JIS and EUC-JP leave U+2212 MINUS SIGN unmappable, but WHATWG maps it to the code of U+FF0D. | `charsets > Shift_JIS > encodes ¥, ‾, U+0080, halfwidth katakana and the minus sign` |
| windows-125x and windows-874 write `?` for C1 controls that the WHATWG index maps to themselves. | `charsets > single-byte charsets > windows-125x and windows-874 encode the C1 controls their index maps` |
| Not a bug, a different table: iconv-lite's KOI8-U has box drawings at AE and BE where WHATWG's (KOI8-RU) has ў and Ў, its macintosh lacks € and U+F8FF, and its x-mac-cyrillic is the pre-Ukrainian variant. | `charsets > single-byte charsets > KOI8-U is KOI8-RU...`, `macintosh maps €...`, `x-mac-cyrillic is the Mac OS Ukrainian variant...` |
| Labels padded with NUL, NBSP or other non-ASCII-whitespace match (fixed upstream after 0.7.3, #403). | `labels > normalizeLabel > trims ASCII whitespace only` |
| Prototype keys such as `constructor` resolve as encodings (#328). | `labels > normalizeLabel > returns undefined for unknown labels and object prototype keys` |
| Surrogate pairs split across stream chunks (#282). | `encode > EncoderStream > surrogate pairs split across chunks` |
| ISO-2022-JP is not supported by iconv-lite. | `charsets > ISO-2022-JP > *` and `encode > unmappable characters > in ISO-2022-JP ...` |

The list comes from iconv-lite's changelog, the issue numbers cited in its tests, and the oracle comparison. iconv-lite's issue tracker hasn't been searched yet.

## API changes

| iconv-lite | Here | Why |
| --- | --- | --- |
| `encode(text, 'label')` | `encode(text, charset)` with charset objects from subpaths, or `await load('label')` | A string registry would put every table in the bundle. |
| `encodeStream(label)` (Node stream) | `new EncoderStream(charset)` (`TransformStream`) | Web streams. |
| `encodingExists(label)` | `normalizeLabel(label) !== undefined` | `normalizeLabel` also returns the WHATWG name. |
| `defaultCharSingleByte`, `defaultCharUnicode` globals | `{ unmappable: 'replace' \| 'html' \| 'error' \| (codePoint) => string }` | Set per call instead of globally, with HTML references and throwing added. |
| `addBOM` | `bom` | `utf-16` no longer writes a BOM by default. |
| `latin1`, `ascii`, `iso-8859-1`, `gb2312`, `ucs2` labels | Resolve as in WHATWG: windows-1252, windows-1252, windows-1252, GBK, UTF-16LE | Same bytes as browsers. |
| Lone surrogates written raw (UTF-16) or as `?` | Encoded as U+FFFD | Matches `TextEncoder`. |
| Bytes in `encodeStream` throw | Bytes are UTF-8 input | One input type for `encode` and `EncoderStream`. |
| `decode`, `decodeStream` | Not provided | `TextDecoder` and `TextDecoderStream` decode every WHATWG charset. |
