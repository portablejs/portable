# @portable/bytes

Converts `Uint8Array`s to and from hex, concatenates them and compares them, with a constant-time comparison for secrets. Runs in browsers, Cloudflare Workers, Deno, Bun and Node 24+.

Replaces the hex, concat and equality functions of [uint8array-extras](https://www.npmjs.com/package/uint8array-extras), and `crypto.timingSafeEqual` from `node:crypto`.

```sh
npm install @portable/bytes
```

```ts
import * as Bytes from '@portable/bytes';

Bytes.toHex(new Uint8Array([0, 15, 255])); // '000fff'
Bytes.fromHex('000FFF'); // Uint8Array [0, 15, 255]

Bytes.concat([header, body]); // a new Uint8Array

Bytes.equal(a, b);

const expected = new Uint8Array(await crypto.subtle.sign('HMAC', key, payload));
if (!Bytes.timingSafeEqual(expected, Bytes.fromHex(signature))) {
  throw new Error('Bad signature');
}
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

`fromHex` follows `Uint8Array.fromHex` and throws for whitespace, a `0x` prefix and any other character that isn't a hex digit. The error message gives the position of the first bad character.

Use `timingSafeEqual` to compare a secret, such as an HMAC signature, with a value from the request. `equal` returns as soon as it finds a difference, so its timing shows an attacker how many leading bytes they guessed right. `timingSafeEqual` returns `false` at once for arrays of different lengths, so it doesn't hide the length. For a signature or a hash the algorithm fixes the length, so it isn't secret.

`concat` and `fromHex` return `Uint8Array<ArrayBuffer>`, so TypeScript 5.9 and later accept them as a `BlobPart` or a `BufferSource` for `crypto.subtle`.

### Byte input

Every `@portable/*` function that takes bytes accepts a `Uint8Array` or a Node `Buffer`, which is a subclass of `Uint8Array`, and throws a `TypeError` for an `ArrayBuffer`, a `DataView` or another typed array. Given a buffer or a view, a function can't tell which of its bytes you meant: `view.buffer` also holds the bytes outside the view, and an `Int16Array` has two bytes per element in the platform's byte order. Convert the value to a `Uint8Array` yourself, so your code shows which bytes the function reads:

```ts
new Uint8Array(arrayBuffer);
new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
```

A `Uint8Array` over a `SharedArrayBuffer` is accepted. Don't write to it from another thread until the function returns, its promise settles, or the stream has read the chunk, or the function may read some bytes before the write and some after.

## Why use this over uint8array-extras and node:crypto

- `node:crypto` exists only in Node, Deno and Bun. This package runs in browsers and Workers too.
- `timingSafeEqual` returns `false` for different lengths. Node's throws a `RangeError`, so you have to check the length first or catch the error.
- `fromHex` throws `Bytes.InvalidInputError`, so you can tell it apart from other errors. uint8array-extras throws a plain `Error`, and reports the position of the pair rather than of the bad character (`'0G'` gives position 0).
- Inputs are `Uint8Array` only. uint8array-extras also takes an `ArrayBuffer`, and passing `view.buffer` by mistake reads every byte of the buffer, not only the view's.

Node's `Buffer` methods are C++ and are faster on large input. In runtimes that have `Uint8Array.prototype.toHex` and `Uint8Array.fromHex`, `toHex` and `fromHex` call those instead of the JavaScript fallback measured here.

<!-- bench:start -->
| | @portable/bytes | uint8array-extras | Node `Buffer` or `node:crypto` |
| --- | ---: | ---: | ---: |
| Hex-encode 32 bytes | 3,650,000 | 3,150,000 | 7,480,000 |
| Hex-encode 1 MiB | 312 | 35.9 | 4,910 |
| Hex-decode 32 bytes | 4,300,000 | 1,410,000 | 2,560,000 |
| Hex-decode 1 MiB | 152 | 23.4 | 901 |
| Compare 32 bytes | 13,500,000 | 6,350,000 | 3,320,000 |
| Compare 1 MiB | 3,820 | 850 | 28,300 |
| Compare 32 bytes in constant time | 16,300,000 | – | 3,010,000 |
| Compare 1 MiB in constant time | 4,470 | – | 1,150 |
| Join 4 × 64 KiB | 38,700 | 35,600 | 50,100 |
| Join 100 × 32 bytes | 341,000 | 130,000 | 335,000 |

Operations per second from `pnpm bench`, higher is better, in Node 24.22.0, on Intel(R) Xeon(R) Processor @ 2.10GHz (4 cores). A dash means the library has no equivalent.

| | @portable/bytes | uint8array-extras | Node `Buffer` or `node:crypto` |
| --- | --- | --- | --- |
| Minified and gzipped | 1.3 kB | 0.7 kB | built in |
| Runtime dependencies | 1 | 0 | – |
| Node built-ins used | none | none | Node only |
| TypeScript types | included | included | – |
| Version compared | – | 1.6.0 | – |

Sizes cover the imports in the usage example, or the equivalent imports of each library, bundled for the browser by `scripts/bundle-size.ts`. Runtime dependencies count every package installed with the published package. A library that uses Node built-ins needs polyfills in a browser and the `nodejs_compat` flag in Cloudflare Workers.
<!-- bench:end -->

Differences to check when you switch from uint8array-extras:

- `concatUint8Arrays` takes an optional `totalLength`. `concat` has no such argument, and its result is always as long as the chunks together.
- uint8array-extras' string, base64, compare, `indexOf` and `getUintBE` functions have no equivalent here. Use [`@portable/base64`](../base64) for base64.
