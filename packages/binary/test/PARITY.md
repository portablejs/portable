# Test parity

Upstream suites: [smart-buffer 4.2.0 `test/smartbuffer.test.ts`](https://github.com/JoshGlazebrook/smart-buffer/blob/master/test/smartbuffer.test.ts), [varint 6.0.0 `test.js`](https://github.com/chrisdickinson/varint/blob/master/test.js), and [it-length-prefixed 11.0.1 `test/decode.spec.ts` and `test/encode.spec.ts`](https://github.com/alanshaw/it-length-prefixed/tree/master/test). Test names below are `file > describe > test`, with `createReader.conformance.ts` shortened to `reader`, `createWriter.conformance.ts` to `writer`, `frames.conformance.ts` to `frames`, `binary.fuzz.conformance.ts` to `fuzz` and `binary.oracle.test.ts` to `oracle`.

## smart-buffer

smart-buffer's suite is grouped by `describe` block, and the rows below follow those blocks.

| Upstream block | Covered by | Notes |
| --- | --- | --- |
| Constructing a SmartBuffer: with an existing Buffer | `reader > createReader > returns bytes as a view of the input` | `createReader` reads the given bytes without copying them. |
| Constructing: with a specified size or `SmartBufferOptions` | skipped | `createWriter` starts at 256 bytes and grows. There is no size option, because the size isn't observable. |
| Constructing: encodings, and invalid encoding options | skipped | Strings are UTF-8 only. `TextEncoder` writes only UTF-8, and the binary protocols this package targets use it. |
| Constructing with invalid parameters | `reader > createReader > throws a TypeError for input that is not a Uint8Array`, `reader > createReader > throws a RangeError for an unknown endian` | |
| Constructing with factory methods | skipped | One factory each: `createReader(bytes)` and `createWriter()`. |
| Numeric Values: reads back what was written | `writer > createWriter > writes integers in big-endian order by default` and the tests after it, `fuzz > reads back every sequence of values the writer wrote`, `oracle > Buffer > *` | |
| Numeric Values: not enough data to read | `reader > createReader > throws TruncatedError with the offset of the value and leaves offset unchanged` | |
| Numeric Values: negative write offset | `writer > createWriter > throws a RangeError for an offset past the bytes written` | Offsets are set on the writer, not passed to each write. |
| BigInt values | `reader > createReader > reads 64-bit integers as bigints`, `writer > createWriter > writes 64-bit integers and floats` | The cases for runtimes without `BigInt` don't apply, because every runtime in the baseline has it. |
| Basic String Values | `reader > createReader > decodes UTF-8 strings`, `writer > createWriter > writes UTF-8 strings without a prefix` | |
| Basic String Values: invalid length (infinite, negative) | `reader > createReader > throws a TypeError for a byte length that is not a number` | `assertByteLength` throws a `RangeError` for `Infinity` and negative lengths. |
| Mixed Encoding Strings | skipped | UTF-8 only. |
| Null/non-null terminating strings | `reader > createReader > reads null-terminated strings`, `writer > createWriter > writes null-terminated strings`, `oracle > smart-buffer > reads and writes null-terminated strings the same way` | |
| Reading string without specifying length | skipped | `string` always takes a byte length. Use `reader.string(reader.remaining)` to read the rest. |
| Write string at specific position | `writer > createWriter > can go back and fill in a length written earlier` | |
| Buffer Values: explicit and implicit lengths | `reader > createReader > returns bytes as a view of the input`, `inputs.conformance.ts > byte inputs > Writer.bytes copies a *` | |
| Buffer Values: null-terminated buffers | skipped | Use `cstring` for text. For bytes, find the zero byte with `indexOf` and call `bytes`. |
| Buffer Values: reading from an invalid offset | `reader > createReader > throws a RangeError for an offset outside the bytes` | |
| Inserting values into specific positions | skipped | No insert. A write at an earlier offset overwrites. See "Known upstream issues". |
| Adding more data than the internal buffer allows | `writer > createWriter > grows past its initial size` | |
| Skipping around data | `reader > createReader > throws TruncatedError with the offset of the value and leaves offset unchanged` (the `skip` case) | |
| Setting write and read offsets | `reader > createReader > can move offset back to read a value again`, `reader > createReader > throws a RangeError for an offset outside the bytes` | |
| Setting encoding | skipped | UTF-8 only. |
| Automatic internal buffer resizing, `ensureWritable()` | `writer > createWriter > grows past its initial size` | |
| Clearing and destroying the buffer | skipped | Create a new writer. |
| Displaying the buffer as a string | skipped | Use `@portable/base64` or `Bytes.toHex` on `toBytes()`. |
| `isSmartBufferOptions()`, utils | skipped | Internal helpers. |

## varint

| Upstream test | Covered by | Notes |
| --- | --- | --- |
| fuzz test | `fuzz > reads back every sequence of values the writer wrote` | |
| test single byte works as expected | `reader > varint > reads unsigned varints`, `writer > varint > writes unsigned varints` | |
| test encode works as expected | `writer > varint > writes unsigned varints`, `oracle > varint > encodes and decodes unsigned varints the same way` | |
| test decode single bytes | `reader > varint > reads unsigned varints` | |
| test decode multiple bytes with zero | `reader > varint > reads unsigned varints` | |
| encode single byte | `writer > varint > writes unsigned varints` | |
| encode multiple byte with zero first byte | `writer > varint > writes unsigned varints` | |
| big integers | `reader > varint > reads unsigned varints` (up to `Number.MAX_SAFE_INTEGER`) | |
| fuzz test - big | `fuzz > a number varint and a bigint varint write the same bytes` | |
| encodingLength | `fuzz > reads back every sequence of values the writer wrote` | `varintLength` is private. The test checks it through the writer's `length` after each write. |
| buffer too short | `reader > varint > throws TruncatedError for a varint cut off at the end` | |
| buffer too long | `reader > varint > throws InvalidInputError for a varint longer than 10 bytes` | |

## it-length-prefixed

| Upstream test | Covered by | Notes |
| --- | --- | --- |
| should decode single message | `frames > FrameDecoderStream > splits varint-prefixed frames by default` | |
| should decode single message sent in small chunks | `frames > FrameDecoderStream > joins a frame and its prefix split across chunks` | |
| should decode empty single message | `frames > FrameDecoderStream > splits varint-prefixed frames by default` | |
| should decode single message as Uint8ArrayList | skipped | Frames are `Uint8Array`s. |
| should decode fragmented length single message | `frames > FrameDecoderStream > joins a frame and its prefix split across chunks` | |
| should decode fragmented data single message | `frames > FrameDecoderStream > joins a frame and its prefix split across chunks` | |
| should not decode message length that is too long | `frames > FrameDecoderStream > fails with InvalidInputError for a varint prefix longer than 10 bytes` | |
| should not decode message data that is too long | `frames > FrameDecoderStream > fails with MaxBytesError as soon as it reads a prefix over maxBytes` | |
| should decode two messages chunked across boundary | `fuzz > decodes the frames it encodes however the bytes are chunked` | |
| should callback on length and data boundaries | skipped | No callbacks. |
| should decode with custom length decoder (int32BE) | `frames > FrameDecoderStream > reads each fixed-size prefix in either byte order` | A `prefix` option instead of a decoder function. |
| should encode length as prefix | `frames > FrameEncoderStream > writes each chunk with a varint prefix by default` | |
| should encode zero length as prefix | `frames > FrameEncoderStream > writes each chunk with a varint prefix by default` | |
| should encode with custom length encoder (int32BE) | `frames > FrameEncoderStream > writes each fixed-size prefix in either byte order` | |
| should only yield uint8arrays | `frames > FrameEncoderStream > writes each chunk with a varint prefix by default` | |
| should not encode message data that is too long | `frames > FrameEncoderStream > fails with InvalidInputError for a chunk too long for the prefix` | |
| should throw an error if message data exceeds custom maxDataLength | skipped | `FrameEncoderStream` has no `maxBytes`, because you choose the chunks you write to it and can check their size first. |
| should encode data within custom maxDataLength | `frames > FrameEncoderStream > fails with InvalidInputError for a chunk too long for the prefix` (the 255-byte case) | |

## Known upstream issues

| Issue | Our behavior | Test |
| --- | --- | --- |
| varint's `decode` returns rounded values from 2<sup>53</sup> to 2<sup>56</sup>: the bytes for 2<sup>53</sup> + 1 decode to 2<sup>53</sup>. | `varint` throws `Binary.InvalidInputError` for a value past `Number.MAX_SAFE_INTEGER`. | `reader > varint > throws InvalidInputError for a varint outside the safe integer range` |
| varint's `decode` throws the same `RangeError` for truncated input and for a varint over 8 bytes, and reports its length through the shared `decode.bytes` property. | `Binary.TruncatedError` and `Binary.InvalidInputError` are separate, and the reader's `offset` moves past the varint. | `reader > varint > throws TruncatedError for a varint cut off at the end` |
| `@bufbuild/protobuf` keeps the low 64 bits of a 10-byte varint with bits above 64. | `bigVarint` throws `Binary.InvalidInputError`. | `reader > varint > throws InvalidInputError for a 10-byte varint over 64 bits` |
| smart-buffer's write methods with an offset insert at that offset and move later bytes along. | A write at an earlier `offset` overwrites. | `writer > createWriter > can go back and fill in a length written earlier` |
| `TextDecoder` and `Buffer.toString` remove a leading byte order mark. | `string` keeps it. | `reader > createReader > keeps a leading byte order mark` |
