# Test parity

Upstream suites: [libqp 3.0.1](https://github.com/nodemailer/libqp/tree/v3.0.1/test) (`libqp-test.ts`, `property-test.ts`, `legacy-test.ts`, `complexity-test.ts`, `package/*`) and [quoted-printable 1.0.1 `tests/tests.js`](https://github.com/mathiasbynens/quoted-printable/blob/master/tests/tests.js). Both are MIT.

libqp's `encode(x)` is `encode(x, { lineLength: false })` here, and its `wrap(encode(x), n)` is `encode(x, { lineLength: n })`. There is no separate `wrap()`, so a `wrap()` test is ported as an `encode()` of the bytes whose encoding is the string upstream wraps. A `wrap()` test of a string that `encode()` never produces has no equivalent, and its row says so.

The tests compare with libqp 3.0.1, installed from npm as libqp3. libqp 2.1.3 is installed as libqp and compared where 3.0.1 did not change its output.

## libqp `libqp-test.ts`

`libqp.conformance.ts` unless the row names another file.

| Upstream test | Covered by | Notes |
| --- | --- | --- |
| Module exports > exposes the API as named exports and as a default export object | skipped | Named exports only, by the repo's API conventions. |
| encode() > encodes a unicode string as UTF-8 | `encode() > encodes a string as UTF-8` | |
| encode() > encodes a Buffer and a Uint8Array the same way | `encode() > encodes a Uint8Array the same as the string it holds` | No `Buffer`. |
| encode() > returns an empty string for empty input | `encode() > returns an empty string for empty input` | |
| encode() > keeps the printable ASCII range except "=" literal | `encode() > keeps the printable ASCII range except "=" literal` | |
| encode() > escapes every other byte with uppercase hex digits | `encode() > escapes every other byte with uppercase hex digits` | |
| encode() > escapes whitespace at the end of a line and at the end of the input | same name | |
| encode() > keeps line breaks literal | `encode() > keeps line breaks literal` | |
| encode() > does not wrap long lines | `encode() > does not wrap with lineLength false` | `encode()` breaks lines at 76 by default. |
| decode() > decodes the RFC 2045 example | same name | |
| decode() > decodes valid escapes and keeps invalid ones | same name | |
| decode() > decodes the escape of every byte | same name | |
| decode() > returns an empty Buffer for empty input | `decode() > returns empty bytes for empty input` | `null` and `undefined` are type errors here. |
| decode() > reads a Uint8Array byte for byte | `decode() > reads a Uint8Array view byte for byte` | |
| decode() > removes whitespace from the end of lines | same name | |
| decode() > treats a soft line break with trailing whitespace as a soft line break | same name | |
| decode() > keeps whitespace in front of a soft line break | same name | |
| decode() > handles a long run of whitespace in linear time | `linear-time.bench.ts > decode() of a run of spaces`, `... of a run of tabs` | |
| decode() > handles a long run of "=" signs in linear time | `linear-time.bench.ts > decode() of a run of "="` | |
| decode() > sizes the output for a body made of escapes | same name | |
| Raw 8-bit bytes > decode() keeps raw UTF-8 bytes from a Buffer | `raw 8-bit bytes > decode() keeps raw UTF-8 bytes` | |
| Raw 8-bit bytes > decode() keeps raw latin1 bytes from a Buffer | `raw 8-bit bytes > decode() keeps raw latin1 bytes` | |
| Raw 8-bit bytes > decode() of a binary string still maps char codes to bytes | `raw 8-bit bytes > decode() reads a string as UTF-8` | Deliberate difference: a string is text, read as UTF-8, as `encode()` reads it. Pass bytes for binary data. |
| Raw 8-bit bytes > Decoder keeps raw UTF-8 bytes | `raw 8-bit bytes > the stream keeps raw UTF-8 bytes` | |
| Raw 8-bit bytes > Decoder keeps raw latin1 bytes | `raw 8-bit bytes > the stream keeps raw latin1 bytes` | |
| Raw 8-bit bytes > Decoder keeps raw bytes and escapes split byte by byte | `raw 8-bit bytes > the stream keeps raw bytes and escapes split byte by byte` | |
| wrap() > adds soft line breaks | `soft line breaks > adds soft line breaks` | |
| wrap() > returns short input as is | `soft line breaks > returns short input as is` | |
| wrap() > keeps every line within the default 76 chars | `soft line breaks > keeps every line within 76 characters by default` | |
| wrap() > breaks at a space near the end of the line | same name | |
| wrap() > keeps existing line breaks | same name | |
| wrap() > never splits an escape sequence | same name | |
| wrap() > never splits a UTF-8 sequence | same name | |
| wrap() > keeps a line that holds nothing but one UTF-8 sequence whole | same name | |
| wrap() > keeps a UTF-8 sequence on the line of a hyphen escape that holds nothing else | same name | |
| wrap() > moves an incomplete escape at the end of the input to its own line | skipped | `encode()` never produces an incomplete escape. |
| wrap() > returns input exactly as long as the line length as is | same name | |
| wrap() > keeps the rest of a line whole when it fits | same name | |
| wrap() > starts the line after a hard line break with the full line length | same name | |
| wrap() > cuts a UTF-8 sequence only at a lead byte and leaves invalid escapes in place | `soft line breaks > cuts a UTF-8 sequence only at a lead byte` | The invalid-escape half (`=Cz`) can't come out of `encode()`. |
| wrap() > does not count a line break towards the line length | same name | |
| wrap() > treats a missing, zero or invalid line length as 76 | `soft line breaks > uses 76 characters by default`, `... rejects a line length that is not an integer of at least 4` | Deliberate difference: 0, `NaN`, and non-integers throw `RangeError` instead of meaning 76. |
| wrap() > raises a line length below 4 to 4 instead of looping forever | `soft line breaks > rejects a line length ...`, `... keeps every line within a line length of 4` | Below 4 throws `RangeError`. |
| Hyphens > encode() escapes a hyphen that starts a line | `hyphens at the start of a line > escapes a hyphen that starts a line` | |
| Hyphens > encode() keeps a hyphen inside a line | `... > keeps a hyphen inside a line` | |
| Hyphens > encode() escapes a hyphen after a lone CR | `... > escapes a hyphen after a lone CR` | |
| Hyphens > wrap() escapes a hyphen that a soft line break would move to the start of a line | `... > escapes a hyphen that a soft line break moves to the start of a line` | |
| Hyphens > wrap() leaves a hyphen alone where it did not add the line break | skipped | Both inputs start a line with a literal hyphen, which `encode()` never produces. |
| Hyphens > wrap() fills a line that starts with an escaped hyphen | `... > fills a line that starts with an escaped hyphen` | |
| Hyphens > wrap() keeps every line within the line length when escaping | `... > keeps every line within the line length when escaping` | |
| Hyphens > wrap() escapes a hyphen that ends the input after a soft line break | `... > escapes a hyphen that ends the input after a soft line break` | The `7.5` case becomes `7`, since fractional lengths throw. |
| Hyphens > Encoder escapes a hyphen at the start of a chunk only when it starts a line | `... > the stream escapes a hyphen at the start of a chunk only when it starts a line` | |
| Hyphens > Encoder output never starts a line with a hyphen | `... > the stream output never starts a line with a hyphen` | |
| Encoder > encodes a stream | `EncoderStream > encodes a stream` | |
| Encoder > encodes string chunks in their encoding | `EncoderStream > encodes string chunks as UTF-8` | Web streams have no per-chunk encoding argument, so strings are UTF-8. |
| Encoder > encodes string chunks of a stream that does not decode strings | `EncoderStream > encodes string chunks as UTF-8` | `decodeStrings` is a Node stream option. |
| Encoder > produces no output for empty input | same name | |
| Encoder > wraps lines at 76 chars by default | `EncoderStream > wraps lines at 76 characters by default` | |
| Encoder > wraps lines at a custom length | same name | |
| Encoder > does not wrap with lineLength false | same name | |
| Encoder > keeps the stream options | `EncoderStream > rejects an invalid line length` | `highWaterMark` is a queuing strategy at `pipeThrough`, and options are not exposed as a property. |
| Encoder > counts input and output bytes | skipped | No `inputBytes`/`outputBytes` counters. Count chunks with a `TransformStream` of your own. |
| Encoder > produces the same output however the input is split | same name | Also with line breaks at 76 and 5. |
| Encoder > encodes whitespace at the end of the input | same name | |
| Encoder > wraps held back whitespace with the line it ends | same name | |
| Encoder > wraps a CR at the end of a chunk once it is known whether LF follows | same name | |
| Encoder > ignores empty chunks | same name | |
| Encoder > encodes a chunk larger than the slice size | `EncoderStream > encodes a large chunk` | No slices. The output is turned into text in 64 KiB pieces. |
| Encoder > encodes a whitespace run longer than the slice size | `EncoderStream > encodes a long whitespace run` | |
| Encoder > binary option > encodes a CR or LF that is not part of a CRLF pair | `binary > encodes a CR or LF that is not part of a CRLF pair` | Also through `encode()`. |
| Encoder > binary option > encodes a trailing CR | `binary > encodes a trailing CR` | |
| Encoder > binary option > keeps CRLF pairs split across chunks | `binary > keeps CRLF pairs split across chunks` | |
| Encoder > binary option > round trips arbitrary bytes | `binary > round trips arbitrary bytes` | |
| Decoder > decodes a stream | `DecoderStream > decodes a stream` | |
| Decoder > decodes string chunks | same name | |
| Decoder > produces no output for empty input | same name | |
| Decoder > decodes the same however the input is split | same name | The input is extended with an escape split by a soft break and a trailing `=\r=`. |
| Decoder > keeps the stream options | skipped | Node `highWaterMark`. |
| Decoder > counts input and output bytes | skipped | No counters, as for the encoder. |
| Round trips > round trips text through the streams | `round trips > round trips text through the streams` | |

## libqp `property-test.ts`

`properties.conformance.ts`. libqp generates inputs with fast-check. These tests use the same kinds of input (special bytes, text fragments, quoted-printable fragments, chunk sizes 1 to 16) from a seeded generator in `utils.ts`, 200 inputs per property.

| Upstream test | Covered by | Notes |
| --- | --- | --- |
| encode() > round trips any bytes through decode() | `encode() without line breaks > round trips any bytes through decode()` | |
| encode() > round trips any text through decode() | `... > round trips any text through decode()` | |
| encode() > produces well-formed output | `... > produces well-formed output` | |
| encode() > keeps a printable ASCII char literal unless ... | `... > keeps a printable ASCII character literal unless ...` | |
| encode() > treats a string as its UTF-8 bytes | `... > treats a string as its UTF-8 bytes` | |
| decode() > matches an independent model of the format | `decode() > matches an independent model of the format` | |
| decode() > matches the model for arbitrary bytes | `decode() > matches the model for arbitrary bytes` | |
| decode() > reads a Buffer, a Uint8Array and a binary string the same way | `decode() > reads an ASCII string the same as its bytes` | Strings are UTF-8, so only ASCII strings equal their bytes. |
| decode() > never throws and never produces more bytes than it was given | `decode() > never produces more bytes than it was given` | |
| wrap() > round trips any bytes through encode(), wrap() and decode() | `encode() with line breaks > round trips any bytes through decode()` | |
| wrap() > keeps every line within the line length | same name | Only valid line lengths are used, because invalid ones throw. |
| wrap() > produces well-formed output | same name | |
| wrap() > only adds soft line breaks | same name | |
| wrap() > returns input that fits on a line as is | `... > returns output that fits on a line as is` | |
| wrap() > wraps every line on its own | `... > breaks every line on its own` | |
| wrap() > never splits an escape sequence | same name | |
| wrap() > never splits a UTF-8 char when ... | `... > never splits a UTF-8 character when ...` | |
| Encoder > without wrapping, produces the same output as encode() however the input is split | `streams > the encoder stream without line breaks matches encode() ...` | |
| Encoder > with wrapping, round trips any bytes into well-formed lines | `streams > the encoder stream with line breaks matches encode() ...` | The same test checks the round trip and the form. |
| Encoder > with wrapping, produces the same output as wrap() and encode() however the input is split | `streams > the encoder stream with line breaks matches encode() ...` | |
| Encoder > with binary, keeps only CRLF pairs literal and does not depend on the chunking | `streams > the binary encoder stream ...` | |
| Encoder > counts the bytes it reads and writes | skipped | No counters. |
| Decoder > produces the same output as decode() however the input is split | `streams > the decoder stream matches decode() ...` | |
| Decoder > round trips the Encoder output | `streams > the decoder stream round trips the encoder stream output` | |

## libqp `legacy-test.ts`

Differential tests against libqp 2.1.3. `quoted-printable.oracle.test.ts` covers the same comparisons against both 3.0.1 (byte for byte) and 2.1.3.

| Upstream test | Covered by | Notes |
| --- | --- | --- |
| encode() produces the same output | `matches libqp 2.1.3 ... > encode() without line breaks` | The test adjusts for a hyphen after a CR, as upstream does. |
| decode() produces the same output for Buffers and strings | `decode() matches libqp > quoted-printable-like input`, `... > ASCII strings` | Non-ASCII strings differ on purpose, because we read them as UTF-8. |
| wrap() produces the same output for ASCII input, but for needless soft breaks | `encode() matches libqp 3.0.1 wrap(encode()) > random bytes at every line length` | Compared with 3.0.1, which has the fix. |
| wrap() produces the same output for text unless 2.1.3 split a char ... | `... > random text with multi-byte characters and whitespace` | As above. |
| the Encoder produces the same output for input written at once | `streams match libqp 3.0.1 ... > EncoderStream` | |
| the Encoder output decodes to the same bytes however the input is split | `streams match libqp 3.0.1 ... > EncoderStream` | Our output is byte-identical for any chunking. |
| the Decoder produces the same output | `streams match libqp 3.0.1 ... > DecoderStream`, `decode() matches libqp > quoted-printable-like input` | |

## libqp `complexity-test.ts`

`linear-time.bench.ts` (Node only, since it times runs).

| Upstream test | Covered by | Notes |
| --- | --- | --- |
| decode() of each of the ten adversarial inputs | `decode() of ...`, same ten inputs | |
| wrap() of each of the eight adversarial inputs | `encode() of ...` | The bytes whose encoding is that input: `a`, `õ` for `=C3=B5`, `0x80`, `-`, LF, space, `=`, punctuation. |
| encode() of every byte value | `encode() of every byte value` | |
| the Encoder with one byte chunks | `the encoder stream with one-byte chunks` | |
| the Encoder with one large chunk of whitespace | `the encoder stream with one large chunk of whitespace` | |
| the Decoder with one byte chunks | `the decoder stream with one-byte chunks` | The test also splits a whitespace run into one-byte chunks, which took quadratic time in our first draft. |

## libqp `package/package-test.ts` and `package/types-consumer-test.ts`

Skipped. They test libqp's dual CommonJS and ES module build, its old deep import path and its declaration files. This package is ES modules only, built by zile, and declaration output is checked by `isolatedDeclarations` and `pnpm check:types`.

## quoted-printable `tests/tests.js`

`quoted-printable.conformance.ts`. Byte strings become `latin1()` bytes.

| Upstream test | Covered by | Notes |
| --- | --- | --- |
| encode: Equals sign | `encode() > equals sign` | Different break position: we break after the last space in the final third of a line, as libqp does. Upstream cuts at exactly 75. |
| encode: 76-char line limit | `encode() > 76-character line limit` | Asserts line length, the first line, and the round trip, since break positions differ as above. |
| encode: Trailing space | `encode() > trailing space` | |
| encode: Trailing tab | `encode() > trailing tab` | |
| encode: CRLF | `encode() > CRLF` | Deliberate difference: upstream escapes every CR and LF. We keep line breaks, and `binary: true` escapes only a lone CR or LF. |
| encode: Exactly 73 to 77 chars, last one `=` | `encode() > exactly 73 to 77 characters of which the last one is "="` | The 74-character case differs: upstream keeps every line, even the last, within 75, and RFC 2045 allows 76. |
| encode: Exactly 73 to 77 chars, last one a space | `encode() > exactly 73 to 77 characters of which the last one is a space` | |
| encode: UTF-8 can be used for non-ASCII symbols | `encode() > UTF-8 can be used for non-ASCII symbols` | Upstream splits the emoji's escapes across a soft break, and we move the whole sequence to the next line. |
| encode: Invalid input (RangeError above U+00FF) | `encode() > encodes a string as UTF-8 instead of rejecting characters above U+00FF` | Strings are text, encoded as UTF-8. |
| decode: Equals sign (both) | `decode() > equals sign` | |
| decode: Hard new line characters | `decode() > hard line breaks` | |
| decode: Trailing = | `decode() > trailing "="` | |
| decode: 76 * 2 characters | `decode() > 76 * 2 characters` | |
| decode: Soft line break example from the RFC | `decode() > soft line break example from the RFC` | |
| decode: UTF-8 can be used for non-ASCII symbols | `decode() > UTF-8 can be used for non-ASCII symbols` | |

quoted-printable's `decode()` also removes `=` before a lone CR. We follow RFC 2045 and libqp: a soft line break is `=` before CRLF, LF, or the end of the input.

## Known upstream issues

`upstream-issues.conformance.ts`. libqp has no public issue tracker, so its rows come from its changelog.

| Issue | Covered by |
| --- | --- |
| [quoted-printable #8](https://github.com/mathiasbynens/quoted-printable/issues/8): `decode()` removes one trailing space or tab per line instead of the whole run | `#8: removes the whole whitespace run at the end of a line, not one character` |
| [quoted-printable #2](https://github.com/mathiasbynens/quoted-printable/issues/2): hard line breaks were removed, and a trailing `=` kept | `#2: keeps hard line breaks and removes a trailing soft line break` |
| [quoted-printable #5](https://github.com/mathiasbynens/quoted-printable/issues/5), [#6](https://github.com/mathiasbynens/quoted-printable/issues/6): `decode()` returns a byte string that users decoded with the wrong charset | `#5 and #6: returns bytes, so text in any charset decodes with TextDecoder` |
| [quoted-printable #4](https://github.com/mathiasbynens/quoted-printable/issues/4): `encode()` doesn't take a `Uint8Array` | `#4: encodes a Uint8Array` |
| quoted-printable throws a `RangeError` for text above U+00FF | `encode() takes text with characters above U+00FF instead of throwing` |
| quoted-printable splits a UTF-8 sequence across a soft line break | `a soft line break never splits a UTF-8 sequence` |
| libqp 2.1.2: `decode()` turned raw 8-bit bytes into U+FFFD | `2.1.2: keeps raw 8-bit bytes when decoding` |
| libqp 2.1.3: a line could start with `--`, which reads as a MIME boundary | `2.1.3: never starts a line with a hyphen ...` |
| libqp 2.1.3: trailing whitespace removal in `decode()` was quadratic | `linear-time.bench.ts > decode() of a run of spaces` and the other runs |
| libqp 3.0.0: `wrap()` looped forever below a line length of 4 | `3.0.0: rejects a line length below 4 ...` |
| libqp 3.0.0: `wrap()` split UTF-8 sequences after four escapes | `libqp.conformance.ts > soft line breaks > never splits a UTF-8 sequence` |
| libqp 3.0.0: the Encoder escaped whitespace at the end of every chunk, so output depended on chunking | `libqp.conformance.ts > EncoderStream > produces the same output however the input is split` |
| libqp 3.0.1: a hyphen after a lone CR was kept literal | `3.0.1: escapes a hyphen after a lone CR ...` |
| libqp 3.0.1: `wrap()` added a soft line break where the rest of the line fitted | `3.0.1: does not add a soft line break when the rest of the line fits` |
| Not tested upstream: a surrogate pair split across string chunks of a stream | `the decoder stream joins a surrogate pair ...`, `libqp.conformance.ts > EncoderStream > encodes a surrogate pair split across string chunks` |
| Not tested upstream: an escape split by a soft line break, across chunks | `decodes an escape split by a soft line break the same way in one piece or in chunks` |

## Benchmarks

Neither library has benchmarks. `quoted-printable.bench.ts` compares `encode()`, `decode()`, and both streams with libqp 2.1.3, libqp 3.0.1, and quoted-printable on 512 KB of text and 256 KB of random bytes, and fails if any of them is more than 25% faster. There is no platform API for quoted-printable to compare with.
