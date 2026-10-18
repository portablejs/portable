# Test parity

Upstream suites: [uint8array-extras 1.6.0 `test.js`](https://github.com/sindresorhus/uint8array-extras/blob/main/test.js), the tests for the functions this package replaces, and Node's [`test/sequential/test-crypto-timing-safe-equal.js`](https://github.com/nodejs/node/blob/main/test/sequential/test-crypto-timing-safe-equal.js) and [`test-crypto-timing-safe-equal-fast.js`](https://github.com/nodejs/node/blob/main/test/sequential/test-crypto-timing-safe-equal-fast.js). No fixtures are copied.

`equal.conformance.ts` runs every comparison test against both `equal` and `timingSafeEqual`, and `hex.conformance.ts` runs every hex test against both the exported functions and the JavaScript fallback.

## uint8array-extras

| Upstream test | Covered by | Notes |
| --- | --- | --- |
| concatUint8Arrays - combining multiple Uint8Arrays | `concat > joins several arrays in order` | |
| concatUint8Arrays - with an empty array | `concat > returns an empty array for no chunks or empty chunks` | |
| concatUint8Arrays - throws when input is not a Uint8Array | skipped | The parameter type is `readonly Uint8Array[]`, so TypeScript rejects a number. We don't check types at runtime. |
| concatUint8Arrays - with ArrayBuffer | skipped | Inputs are `Uint8Array` only, see "Known upstream issues". The `totalLength` argument it also tests doesn't exist here. |
| areUint8ArraysEqual - with identical Uint8Arrays | `equal > identical arrays are equal` | |
| areUint8ArraysEqual - with different content | `equal > arrays with different content are unequal` | |
| areUint8ArraysEqual - with different sizes | `equal > arrays of different lengths are unequal` | |
| areUint8ArraysEqual - with ArrayBuffer | skipped | Inputs are `Uint8Array` only. |
| uint8ArrayToHex | `toHex and fromHex > encodes UTF-8 text` | Same fixture, with the expected hex written out instead of computed with `Buffer`. |
| uint8ArrayToHex with ArrayBuffer | `toHex and fromHex > encodes every byte value with two lowercase digits` | Same bytes, as a `Uint8Array`. |
| hexToUint8Array | `toHex and fromHex > decodes UTF-8 text` | |
| hexToUint8Array - invalid length throws | `toHex and fromHex > throws on odd length` | |
| hexToUint8Array - invalid character throws | `toHex and fromHex > throws on a character that is not a hex digit` | |
| compareUint8Arrays (5 tests) | skipped | No ordering compare. `equal` covers equality. |
| isUint8Array, assertUint8Array, toUint8Array, assertUint8ArrayOrArrayBuffer (7 tests) | skipped | Type checks and conversions this package doesn't export. |
| uint8ArrayToString, stringToUint8Array (3 tests) | skipped | `TextEncoder` and `TextDecoder` do this. |
| uint8ArrayToBase64, base64ToUint8Array, stringToBase64, base64ToString (9 tests) | skipped | `@portable/base64` covers base64. |
| getUintBE | skipped | `DataView` does this. |
| indexOf, includes (9 tests) | skipped | Not part of this package. |

## node:crypto timingSafeEqual

| Upstream test | Covered by | Notes |
| --- | --- | --- |
| should consider equal strings to be equal | `timingSafeEqual > identical arrays are equal` | |
| should consider unequal strings to be unequal | `timingSafeEqual > arrays with different content are unequal` | |
| TypedArrays with different lengths but equal byteLengths | `timingSafeEqual > compares only the bytes each subarray covers` | Inputs are `Uint8Array` only, so the case becomes different views of the same bytes. |
| floating-point inputs compare bytes, not values | `timingSafeEqual > compares the bytes of other typed arrays, not their values` | Same NaN, `-0` and signaling NaN cases, through `Uint8Array` views. |
| throws `ERR_CRYPTO_TIMING_SAFE_EQUAL_LENGTH` for different lengths | `timingSafeEqual > arrays of different lengths are unequal` | Returns `false` instead, see "Known upstream issues". |
| throws `ERR_INVALID_ARG_TYPE` for a string (2 tests) | skipped | TypeScript rejects a string. We don't check types at runtime. |
| V8 fast API path (`-fast.js`) | `timingSafeEqual > finds a difference at any position, length and alignment` | The upstream test checks that V8's optimized call gives the same results. Here the matching risk is the four-bytes-at-a-time path, which this test drives with lengths around 64 and unaligned views. |

## Known upstream issues

| Issue | Test |
| --- | --- |
| uint8array-extras [#16](https://github.com/sindresorhus/uint8array-extras/issues/16): results typed `Uint8Array<ArrayBufferLike>` weren't accepted as a `BlobPart` under TypeScript 5.9. `concat` and `fromHex` return `Uint8Array<ArrayBuffer>`. | `concat > returns bytes that a Blob accepts`, `fromHex > returns bytes that a Blob accepts` |
| uint8array-extras accepts an `ArrayBuffer`. Passing `view.buffer` for a subarray, or a Node `Buffer` from the shared pool, compares or encodes every byte in the buffer. | `known upstream issues > uint8array-extras: an ArrayBuffer is rejected, ...` (a type error) |
| uint8array-extras' `hexToUint8Array('0G')` reports position 0, the start of the pair, when the bad character is at 1. | `known upstream issues > uint8array-extras: the error gives the position of the bad digit, not of its pair` |
| `node:crypto`'s `timingSafeEqual` throws a `RangeError` for different lengths, so callers must check lengths first. Here it returns `false`. | `known upstream issues > node:crypto: timingSafeEqual returns false for different lengths instead of throwing`, and the oracle test of the same name |

## Oracle tests

`bytes.oracle.test.ts` compares `toHex`, `fromHex` (valid input and input with one stray character), `concat` and `equal` with uint8array-extras, and `timingSafeEqual` with `node:crypto` on equal-length input, at sizes on both sides of the 64- and 128-byte thresholds and at unaligned offsets.

## Benchmarks

uint8array-extras' `benchmark.mjs` times each function on 1 MB of random bytes. `bytes.bench.ts` times `toHex`, `fromHex`, `equal` and `timingSafeEqual` at 32 bytes and 1 MiB and `concat` on 4 × 64 KiB and 100 × 32 bytes, against uint8array-extras, `node:crypto` and the matching `Buffer` method, and fails if uint8array-extras or `node:crypto` is more than 25% faster.
