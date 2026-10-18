# @portable/bytes

Hex encoding, concatenation and comparison for `Uint8Array`. Runs in browsers, Cloudflare Workers, Deno, Bun and Node 24+.

Replaces the hex, concat and equality functions of [uint8array-extras](https://www.npmjs.com/package/uint8array-extras), and `crypto.timingSafeEqual` from `node:crypto`.

```sh
npm install @portable/bytes
```

```ts
import * as Bytes from '@portable/bytes'

Bytes.toHex(new Uint8Array([0, 15, 255])) // '000fff'
Bytes.fromHex('000FFF') // Uint8Array [0, 15, 255]

Bytes.concat([header, body]) // a new Uint8Array

Bytes.equal(a, b)

const expected = new Uint8Array(await crypto.subtle.sign('HMAC', key, payload))
if (!Bytes.timingSafeEqual(expected, Bytes.fromHex(signature))) throw new Error('Bad signature')
```

`toHex` and `fromHex` call `Uint8Array.prototype.toHex` and `Uint8Array.fromHex` where the runtime has them (current Chromium, Firefox and Safari). Elsewhere, Node 24 included, a JavaScript fallback gives the same output and throws on the same input. The browser tests check the two against each other.

## API

| Export | Does |
| --- | --- |
| `toHex(bytes)` | Encodes a `Uint8Array` as lowercase hex. |
| `fromHex(text)` | Decodes hex, as a string or its ASCII bytes, to a `Uint8Array`. Upper and lower case are accepted. |
| `concat(chunks)` | Joins a `readonly Uint8Array[]` into a new `Uint8Array`. The result never shares memory with a chunk. |
| `equal(a, b)` | Whether `a` and `b` hold the same bytes. Returns at the first difference. |
| `timingSafeEqual(a, b)` | Whether `a` and `b` hold the same bytes, in time that depends only on the length. Returns `false` for different lengths. |
| `InvalidInputError` | Thrown by `fromHex` for odd-length input or a character that isn't a hex digit. |

`fromHex` follows `Uint8Array.fromHex`: whitespace, a `0x` prefix and any other character throw. The error message gives the position of the first bad character.

Use `timingSafeEqual` to compare a secret, such as an HMAC signature, with a value from the request. `equal` returns as soon as it finds a difference, so its timing shows an attacker how many leading bytes they guessed right. `timingSafeEqual` returns `false` at once for arrays of different lengths, so it doesn't hide the length. For a signature or a hash the algorithm fixes the length, so it isn't secret.

`concat`'s and `fromHex`'s results are typed `Uint8Array<ArrayBuffer>`, so TypeScript 5.9 and later accept them as a `BlobPart` or a `BufferSource` for `crypto.subtle`.

## Why use this over uint8array-extras and node:crypto

- `node:crypto` exists only in Node, Deno and Bun. This package runs in browsers and Workers too.
- `timingSafeEqual` returns `false` for different lengths. Node's throws a `RangeError`, so every caller has to check the length first or catch the error.
- `fromHex` throws `Bytes.InvalidInputError`, which a caller can tell apart from other errors. uint8array-extras throws a plain `Error`, and reports the position of the pair rather than of the bad character (`'0G'` gives position 0).
- Inputs are `Uint8Array` only. uint8array-extras also takes an `ArrayBuffer`, and passing `view.buffer` by mistake reads every byte of the buffer, not only the view's.
- On Node 24, with random input:

| Function | Input | Compared with uint8array-extras | Compared with Node |
| --- | --- | --- | --- |
| `toHex` | 32 B | 1.6× faster | 2× slower than `Buffer#toString('hex')` |
| `toHex` | 1 MiB | 11× faster | 18× slower than `Buffer#toString('hex')` |
| `fromHex` | 32 B | 3× faster | 1.8× faster than `Buffer.from(hex, 'hex')` |
| `fromHex` | 1 MiB | 8× faster | 8× slower than `Buffer.from(hex, 'hex')` |
| `equal` | 32 B | 2× faster | 4× faster than `Buffer.compare` |
| `equal` | 1 MiB | 3.7× faster | 8.6× slower than `Buffer.compare` |
| `timingSafeEqual` | 32 B | none | 5× faster than `crypto.timingSafeEqual` |
| `timingSafeEqual` | 1 MiB | none | 4× faster than `crypto.timingSafeEqual` |
| `concat` | 4 × 64 KiB | same speed | same speed as `Buffer.concat` |
| `concat` | 100 × 32 B | 3× faster | same speed as `Buffer.concat` |

Node's `Buffer` methods are C++ and win on large input. In runtimes that have `Uint8Array.prototype.toHex` and `Uint8Array.fromHex`, `toHex` and `fromHex` call those instead of the JavaScript fallback measured here.

## Migrating

| uint8array-extras / node:crypto | @portable/bytes |
| --- | --- |
| `uint8ArrayToHex(bytes)` | `Bytes.toHex(bytes)` |
| `hexToUint8Array(hex)` | `Bytes.fromHex(hex)` |
| `concatUint8Arrays(arrays)` | `Bytes.concat(arrays)` |
| `concatUint8Arrays(arrays, totalLength)` | `Bytes.concat(arrays)`. The length is always the sum of the chunks. |
| `areUint8ArraysEqual(a, b)` | `Bytes.equal(a, b)` |
| `crypto.timingSafeEqual(a, b)` | `Bytes.timingSafeEqual(a, b)`. Returns `false` instead of throwing for different lengths. |
| A function given an `ArrayBuffer` | Pass `new Uint8Array(buffer)`. |

For base64 use [`@portable/base64`](../base64), and for random bytes `crypto.getRandomValues(new Uint8Array(n))`. uint8array-extras' string, base64, compare, `indexOf` and `getUintBE` functions have no equivalent here.
