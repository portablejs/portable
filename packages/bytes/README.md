# @portable/bytes

Converts `Uint8Array`s to and from hex, concatenates them, and compares them, with a constant-time comparison for secrets. Runs in browsers, Cloudflare Workers, Node 24+, Bun, and Deno.

Replaces the hex, concat, and equality functions of [uint8array-extras](https://www.npmjs.com/package/uint8array-extras), and `crypto.timingSafeEqual` from `node:crypto`.

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

`toHex` and `fromHex` call `Uint8Array.prototype.toHex` and `Uint8Array.fromHex` where the runtime has them (current Chromium, Firefox, and Safari). Elsewhere, Node 24 included, a JavaScript fallback gives the same output and throws on the same input. The browser tests check the two against each other.

## API

| Export | Does |
| --- | --- |
| `toHex(bytes)` | Encodes a `Uint8Array` as lowercase hex. |
| `fromHex(text)` | Decodes hex, as a string or its ASCII bytes, to a `Uint8Array`. Upper and lower case are accepted. |
| `concat(chunks)` | Joins a `readonly Uint8Array[]` into a new `Uint8Array`. The result never shares memory with a chunk. |
| `equal(a, b)` | Whether `a` and `b` hold the same bytes. Returns at the first difference. |
| `timingSafeEqual(a, b)` | Whether `a` and `b` hold the same bytes, in time that depends only on the length. Returns `false` for different lengths. |
| `InvalidInputError` | Thrown by `fromHex` for odd-length input or a character that isn't a hex digit. |

`fromHex` follows `Uint8Array.fromHex` and throws for whitespace, a `0x` prefix, and any other character that isn't a hex digit. The error message gives the position of the first bad character.

Use `timingSafeEqual` to compare a secret, such as an HMAC signature, with a value from the request. `equal` returns as soon as it finds a difference, so its timing shows an attacker how many leading bytes they guessed right. `timingSafeEqual` returns `false` at once for arrays of different lengths, so it doesn't hide the length. For a signature or a hash the algorithm fixes the length, so it isn't secret.

`concat` and `fromHex` return `Uint8Array<ArrayBuffer>`, so TypeScript 5.9 and later accept them as a `BlobPart` or a `BufferSource` for `crypto.subtle`.

### Byte input

Every `@portable/*` function that takes bytes accepts a `Uint8Array` or a Node `Buffer`, which is a subclass of `Uint8Array`, and throws a `TypeError` for an `ArrayBuffer`, a `DataView`, or another typed array. Given a buffer or a view, a function can't tell which of its bytes you meant: `view.buffer` also holds the bytes outside the view, and an `Int16Array` has two bytes per element in the platform's byte order. Convert the value to a `Uint8Array` yourself, so your code shows which bytes the function reads:

```ts
new Uint8Array(arrayBuffer);
new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
```

A `Uint8Array` over a `SharedArrayBuffer` is accepted. Don't write to it from another thread until the function returns, its promise settles or the stream has read the chunk. Otherwise the function may read some bytes before the write and some after.

## Why use this over uint8array-extras and node:crypto

- `node:crypto` exists only in Node, Deno, and Bun. This package runs in browsers and Workers too.
- `timingSafeEqual` returns `false` for different lengths. Node's throws a `RangeError`, so you have to check the length first or catch the error.
- `fromHex` throws `Bytes.InvalidInputError`, so you can tell it apart from other errors. uint8array-extras throws a plain `Error`, and reports the position of the pair rather than of the bad character (`'0G'` gives position 0).
- Inputs are `Uint8Array` only. uint8array-extras also takes an `ArrayBuffer`, and passing `view.buffer` by mistake reads every byte of the buffer, not only the view's.

Node's `Buffer` methods are C++ and are faster on large input. In runtimes that have `Uint8Array.prototype.toHex` and `Uint8Array.fromHex`, `toHex` and `fromHex` call those instead of the JavaScript fallback measured here.

<!-- bench:start -->
<table>
<thead><tr><th align="left">Library</th><th align="right">Ops/s</th><th align="left">Relative</th><th></th></tr></thead>
<tbody>
<tr><th colspan="4" align="left">Hex-encode 32 bytes</th></tr>
<tr><td>Node <code>Buffer</code> or <code>node:crypto</code></td><td align="right">7,480,000</td><td>2.0× faster</td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="160" height="12" alt="" /></td></tr>
<tr><td>@portable/bytes</td><td align="right">3,650,000</td><td></td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="78" height="12" alt="" /></td></tr>
<tr><td>uint8array-extras</td><td align="right">3,150,000</td><td>1.2× slower</td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="67" height="12" alt="" /></td></tr>
<tr><th colspan="4" align="left">Hex-encode 1 MiB</th></tr>
<tr><td>Node <code>Buffer</code> or <code>node:crypto</code></td><td align="right">4,910</td><td>16× faster</td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="160" height="12" alt="" /></td></tr>
<tr><td>@portable/bytes</td><td align="right">312</td><td></td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="10" height="12" alt="" /></td></tr>
<tr><td>uint8array-extras</td><td align="right">35.9</td><td>8.7× slower</td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="2" height="12" alt="" /></td></tr>
<tr><th colspan="4" align="left">Hex-decode 32 bytes</th></tr>
<tr><td>@portable/bytes</td><td align="right">4,300,000</td><td></td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="160" height="12" alt="" /></td></tr>
<tr><td>Node <code>Buffer</code> or <code>node:crypto</code></td><td align="right">2,560,000</td><td>1.7× slower</td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="95" height="12" alt="" /></td></tr>
<tr><td>uint8array-extras</td><td align="right">1,410,000</td><td>3.0× slower</td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="52" height="12" alt="" /></td></tr>
<tr><th colspan="4" align="left">Hex-decode 1 MiB</th></tr>
<tr><td>Node <code>Buffer</code> or <code>node:crypto</code></td><td align="right">901</td><td>5.9× faster</td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="160" height="12" alt="" /></td></tr>
<tr><td>@portable/bytes</td><td align="right">152</td><td></td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="27" height="12" alt="" /></td></tr>
<tr><td>uint8array-extras</td><td align="right">23.4</td><td>6.5× slower</td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="4" height="12" alt="" /></td></tr>
<tr><th colspan="4" align="left">Compare 32 bytes</th></tr>
<tr><td>@portable/bytes</td><td align="right">13,500,000</td><td></td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="160" height="12" alt="" /></td></tr>
<tr><td>uint8array-extras</td><td align="right">6,350,000</td><td>2.1× slower</td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="75" height="12" alt="" /></td></tr>
<tr><td>Node <code>Buffer</code> or <code>node:crypto</code></td><td align="right">3,320,000</td><td>4.1× slower</td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="39" height="12" alt="" /></td></tr>
<tr><th colspan="4" align="left">Compare 1 MiB</th></tr>
<tr><td>Node <code>Buffer</code> or <code>node:crypto</code></td><td align="right">28,300</td><td>7.4× faster</td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="160" height="12" alt="" /></td></tr>
<tr><td>@portable/bytes</td><td align="right">3,820</td><td></td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="22" height="12" alt="" /></td></tr>
<tr><td>uint8array-extras</td><td align="right">850</td><td>4.5× slower</td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="5" height="12" alt="" /></td></tr>
<tr><th colspan="4" align="left">Compare 32 bytes in constant time</th></tr>
<tr><td>@portable/bytes</td><td align="right">16,300,000</td><td></td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="160" height="12" alt="" /></td></tr>
<tr><td>Node <code>Buffer</code> or <code>node:crypto</code></td><td align="right">3,010,000</td><td>5.4× slower</td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="30" height="12" alt="" /></td></tr>
<tr><th colspan="4" align="left">Compare 1 MiB in constant time</th></tr>
<tr><td>@portable/bytes</td><td align="right">4,470</td><td></td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="160" height="12" alt="" /></td></tr>
<tr><td>Node <code>Buffer</code> or <code>node:crypto</code></td><td align="right">1,150</td><td>3.9× slower</td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="41" height="12" alt="" /></td></tr>
<tr><th colspan="4" align="left">Join 4 × 64 KiB</th></tr>
<tr><td>Node <code>Buffer</code> or <code>node:crypto</code></td><td align="right">50,100</td><td>1.3× faster</td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="160" height="12" alt="" /></td></tr>
<tr><td>@portable/bytes</td><td align="right">38,700</td><td></td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="124" height="12" alt="" /></td></tr>
<tr><td>uint8array-extras</td><td align="right">35,600</td><td>1.1× slower</td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="114" height="12" alt="" /></td></tr>
<tr><th colspan="4" align="left">Join 100 × 32 bytes</th></tr>
<tr><td>@portable/bytes</td><td align="right">341,000</td><td></td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="160" height="12" alt="" /></td></tr>
<tr><td>Node <code>Buffer</code> or <code>node:crypto</code></td><td align="right">335,000</td><td>same</td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="157" height="12" alt="" /></td></tr>
<tr><td>uint8array-extras</td><td align="right">130,000</td><td>2.6× slower</td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="61" height="12" alt="" /></td></tr>
</tbody>
</table>

Operations per second from `pnpm bench`, higher is better, in Node 24.22.0, on Intel(R) Xeon(R) Processor @ 2.10GHz (4 cores). Each benchmark lists only the libraries that can do the same work, fastest first. The relative speed compares each library with @portable/bytes, and the bars are scaled to the fastest library.

| Library | Version | Minified and gzipped | Runtime dependencies | Node built-ins | TypeScript types |
| --- | --- | ---: | ---: | --- | --- |
| @portable/bytes | – | 1.3 kB | 1 | none | included |
| uint8array-extras | 1.6.0 | 0.7 kB | 0 | none | included |
| Node `Buffer` or `node:crypto` | – | built in | – | Node only | – |

Sizes cover the imports in the usage example, or the equivalent imports of each library, bundled for the browser by `scripts/bundle-size.ts`. Runtime dependencies count every package installed with the published package. A library that uses Node built-ins needs polyfills in a browser and the `nodejs_compat` flag in Cloudflare Workers.
<!-- bench:end -->

Differences to check when you switch from uint8array-extras:

- `concatUint8Arrays` takes an optional `totalLength`. `concat` has no such argument, and its result is always as long as the chunks together.
- uint8array-extras' string, base64, compare, `indexOf`, and `getUintBE` functions have no equivalent here. Use [@portable/base64](https://portablejs.com/packages/base64) for base64.
