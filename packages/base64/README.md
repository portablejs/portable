# @portable/base64

Encodes and decodes base64 and base64url, with optional line wrapping for MIME and streams for large bodies. Runs in browsers, Cloudflare Workers, Node 24+, Bun, and Deno.

Replaces [libbase64](https://www.npmjs.com/package/libbase64), [base64-js](https://www.npmjs.com/package/base64-js), [js-base64](https://www.npmjs.com/package/js-base64), and the base64 functions of [undio](https://www.npmjs.com/package/undio).

```sh
npm install @portable/base64
```

```ts
import * as Base64 from '@portable/base64';

Base64.encode('hello'); // 'aGVsbG8='
Base64.encode(bytes, { alphabet: 'base64url', omitPadding: true });
Base64.encode(attachment, { lineLength: 76 }); // MIME body, CRLF between lines

new TextDecoder().decode(Base64.decode('aGVsbG8=')); // 'hello'
Base64.decode(mimeBody, { mode: 'mime' });

const response = await fetch('https://example.com/logo.png');
const body = response.body!.pipeThrough(new Base64.EncoderStream({ lineLength: 76 }));
```

`encode` and `decode` call `Uint8Array.prototype.toBase64` and `Uint8Array.fromBase64` where the runtime has them (current Chromium, Firefox, and Safari). Elsewhere, Node 24 included, a JavaScript fallback gives the same output and throws on the same input. The browser tests check the two against each other.

## API

| Export | Does |
| --- | --- |
| `encode(input, options?)` | Encodes a `Uint8Array`, or a string as UTF-8, to a base64 string. |
| `decode(input, options?)` | Decodes a base64 string, or its bytes, to a `Uint8Array`. |
| `new EncoderStream(options?)` | `TransformStream<Uint8Array \| string, Uint8Array>` that emits the base64 text as ASCII bytes. However the input is split into chunks, the output equals `encode` of the whole input. |
| `new DecoderStream(options?)` | `TransformStream<string \| Uint8Array, Uint8Array>`. Same output as `decode` of the whole input. Line breaks, padding, and groups of four characters can be split across chunks anywhere. |
| `InvalidInputError` | Thrown, or errors the stream, for a character outside the alphabet or misplaced padding. |
| `TruncatedError` | Thrown, or errors the stream, when the input ends inside a group of four characters. |

### Encode options

`encode` and `EncoderStream` take the same options.

| Option | Default | Description |
| --- | --- | --- |
| `alphabet` | `'base64'` | `'base64'` uses `+` and `/`. `'base64url'` uses `-` and `_` (RFC 4648 §5). |
| `omitPadding` | `false` | Leave out the trailing `=`. |
| `lineLength` | `false` | Characters per line, or `false` for one line. MIME uses 76. The output never ends with a line ending. `encode` and `EncoderStream` throw a `RangeError` for any value other than a positive integer or `false`. |
| `newline` | `'\r\n'` | Inserted between lines when `lineLength` is set. |
| `signal` | none | `EncoderStream` only. Aborting errors the stream with `signal.reason` and cancels the source piped into it. |

### Decode options

`decode` and `DecoderStream` take the same options.

| Option | Default | Description |
| --- | --- | --- |
| `alphabet` | `'base64'` | Alphabet of the input. `'mime'` mode accepts both. |
| `mode` | `'loose'` | How to treat input that isn't canonical base64, below. |
| `signal` | none | `DecoderStream` only. Aborting errors the stream with `signal.reason` and cancels the source piped into it. |

| Mode | Whitespace | Missing padding | Other characters | Data after padding |
| --- | --- | --- | --- | --- |
| `'loose'` | skipped | accepted | `InvalidInputError` | `InvalidInputError` |
| `'strict'` | skipped | `TruncatedError` | `InvalidInputError` | `InvalidInputError` |
| `'mime'` | skipped | accepted | skipped | decoded as a new segment |

`'loose'` and `'strict'` match `Uint8Array.fromBase64` with `lastChunkHandling` set to the same name. `'strict'` also rejects non-zero bits before the padding (`'YR=='`). Both throw `TruncatedError` for one leftover character (`'YWJjZ'`) or a single `=` where two are needed (`'YQ='`).

`'mime'` follows RFC 2045 §6.8, which tells decoders to ignore characters outside the alphabet, and libbase64, which decodes each `=`-terminated segment on its own. It reads both alphabets and never throws, so use it for mail bodies and other input you don't control. A single character left over at the end is dropped.

## Types

| Type | Description |
| --- | --- |
| `Base64.Alphabet` | `'base64'` or `'base64url'` (RFC 4648). |
| `Base64.Mode` | `'loose'`, `'strict'`, or `'mime'`, how `decode` treats input that isn't canonical base64. |

## Why use this over base64-js, js-base64, libbase64, and undio

One package does what the three did separately: base64 and base64url, MIME line wrapping, and streams. It calls the platform's `toBase64` and `fromBase64` where the runtime has them, and depends only on other `@portable/*` packages.

- In Node, which has no native base64 on `Uint8Array`, encoding 1 MB was about 8× faster than base64-js and 3× faster than js-base64. Decoding 1 MB was as fast as base64-js and about 11× faster than js-base64.
- `EncoderStream` at 76 columns was about 1.3× slower than libbase64's `Encoder`, and `DecoderStream` was about 1.4× faster than its `Decoder`.
- In Node, `Buffer` encodes and decodes 1 MB 11 to 21× faster than this package, and so do libbase64's plain `encode` and `decode`, which call `Buffer`. If your code runs only in Node and you need that speed, keep using `Buffer`.
- The default mode throws `InvalidInputError` on characters outside the alphabet. base64-js drops them and returns wrong bytes (base64-js #81), and throws a `RangeError` on `'===='` (base64-js #73).
- undio's `uint8ArrayToBase64` passes every byte to `String.fromCodePoint` as a separate argument, so on Node it throws `RangeError: Maximum call stack size exceeded` for input over about 150 KB. `encode` has no size limit. The benchmark table leaves undio out of the 1 MB encode row for this reason.
- undio's `uint8ArrayToBase64` returns a data URL such as `data:;base64,AQID` unless you pass `dataURL: false`. `encode` returns only the base64 text.
- `encode` throws a `TypeError` for an `Int8Array`, which base64-js encoded to wrong output (base64-js #38). The stream output doesn't depend on chunk boundaries. libbase64's did before 1.3.2.

### Performance

Node 24 has no native base64 on `Uint8Array`, so it runs the fallback. libbase64's `encode` and `decode` call `Buffer`, which is C++.

<!-- bench:start -->
<table>
<thead><tr><th align="left">Library</th><th align="right">Ops/s</th><th align="left">Relative</th><th></th></tr></thead>
<tbody>
<tr><th colspan="4" align="left">Encode 1 MB</th></tr>
<tr><td><code>Buffer</code> (Node)</td><td align="right">7,770</td><td>15× faster</td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="160" height="12" alt="" /></td></tr>
<tr><td>libbase64</td><td align="right">5,200</td><td>9.8× faster</td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="107" height="12" alt="" /></td></tr>
<tr><td>@portable/base64</td><td align="right">529</td><td></td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="11" height="12" alt="" /></td></tr>
<tr><td>js-base64</td><td align="right">153</td><td>3.4× slower</td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="3" height="12" alt="" /></td></tr>
<tr><td>base64-js</td><td align="right">61.4</td><td>8.6× slower</td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="2" height="12" alt="" /></td></tr>
<tr><th colspan="4" align="left">Encode 1 MB in 76-column lines</th></tr>
<tr><td>libbase64</td><td align="right">672</td><td>1.3× faster</td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="160" height="12" alt="" /></td></tr>
<tr><td>@portable/base64</td><td align="right">519</td><td></td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="124" height="12" alt="" /></td></tr>
<tr><th colspan="4" align="left">Decode 1 MB</th></tr>
<tr><td><code>Buffer</code> (Node)</td><td align="right">8,300</td><td>30× faster</td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="160" height="12" alt="" /></td></tr>
<tr><td>libbase64</td><td align="right">5,980</td><td>22× faster</td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="115" height="12" alt="" /></td></tr>
<tr><td>base64-js</td><td align="right">287</td><td>same</td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="6" height="12" alt="" /></td></tr>
<tr><td>@portable/base64</td><td align="right">274</td><td></td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="5" height="12" alt="" /></td></tr>
<tr><td>js-base64</td><td align="right">27.2</td><td>10× slower</td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="2" height="12" alt="" /></td></tr>
<tr><td>undio</td><td align="right">12.9</td><td>21× slower</td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="2" height="12" alt="" /></td></tr>
<tr><th colspan="4" align="left">Decode 1 MB of MIME base64</th></tr>
<tr><td>libbase64</td><td align="right">4,300</td><td>20× faster</td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="160" height="12" alt="" /></td></tr>
<tr><td>@portable/base64</td><td align="right">216</td><td></td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="8" height="12" alt="" /></td></tr>
<tr><th colspan="4" align="left">Encode 32 bytes</th></tr>
<tr><td>@portable/base64</td><td align="right">3,730,000</td><td></td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="160" height="12" alt="" /></td></tr>
<tr><td>js-base64</td><td align="right">2,620,000</td><td>1.4× slower</td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="112" height="12" alt="" /></td></tr>
<tr><td><code>Buffer</code> (Node)</td><td align="right">2,550,000</td><td>1.5× slower</td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="109" height="12" alt="" /></td></tr>
<tr><td>base64-js</td><td align="right">1,020,000</td><td>3.6× slower</td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="44" height="12" alt="" /></td></tr>
<tr><td>undio</td><td align="right">744,000</td><td>5.0× slower</td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="32" height="12" alt="" /></td></tr>
<tr><th colspan="4" align="left">Decode 32 bytes</th></tr>
<tr><td>@portable/base64</td><td align="right">3,410,000</td><td></td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="160" height="12" alt="" /></td></tr>
<tr><td>base64-js</td><td align="right">2,800,000</td><td>1.2× slower</td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="131" height="12" alt="" /></td></tr>
<tr><td><code>Buffer</code> (Node)</td><td align="right">2,320,000</td><td>1.5× slower</td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="109" height="12" alt="" /></td></tr>
<tr><td>js-base64</td><td align="right">1,120,000</td><td>3.0× slower</td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="53" height="12" alt="" /></td></tr>
<tr><td>undio</td><td align="right">420,000</td><td>8.1× slower</td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="20" height="12" alt="" /></td></tr>
<tr><th colspan="4" align="left">Encode a 1 MB stream in 76-column lines</th></tr>
<tr><td>libbase64</td><td align="right">425</td><td>1.3× faster</td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="160" height="12" alt="" /></td></tr>
<tr><td>@portable/base64</td><td align="right">324</td><td></td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="122" height="12" alt="" /></td></tr>
<tr><th colspan="4" align="left">Decode a 1 MB stream of MIME base64</th></tr>
<tr><td>@portable/base64</td><td align="right">241</td><td></td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="160" height="12" alt="" /></td></tr>
<tr><td>libbase64</td><td align="right">180</td><td>1.3× slower</td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="120" height="12" alt="" /></td></tr>
</tbody>
</table>

Operations per second from `pnpm bench`, higher is better, in Node 24.22.2, on Intel(R) Xeon(R) Processor @ 2.10GHz (4 cores). Each benchmark lists only the libraries that can do the same work, fastest first. The relative speed compares each library with @portable/base64, and the bars are scaled to the fastest library.

| Library | Version | Minified and gzipped | Runtime dependencies | Node built-ins | TypeScript types |
| --- | --- | ---: | ---: | --- | --- |
| @portable/base64 | – | 3.3 kB | 3 | none | included |
| base64-js | 1.5.1 | 1.1 kB | 0 | none | included |
| js-base64 | 3.9.4 | 1.6 kB | 0 | none | included |
| libbase64 | 1.3.3 | 1.8 kB | 0 | `buffer`, `stream` | none |
| undio | 0.2.0 | 0.5 kB | 0 | none | included |
| `Buffer` (Node) | – | built in | – | Node only | – |

Sizes cover the imports in the usage example, or the equivalent imports of each library, bundled for the browser by `scripts/bundle-size.ts`. Runtime dependencies count every package installed with the published package. A library that uses Node built-ins needs polyfills in a browser and the `nodejs_compat` flag in Cloudflare Workers.
<!-- bench:end -->

Differences to check when you switch:

- libbase64's `Encoder` wraps lines at 76 characters by default, and `encode` and `EncoderStream` write one line unless you pass `lineLength: 76`.
- libbase64 rounds a fractional line length down and replaces any other invalid value with 76. `lineLength` must be a positive integer or `false`, and anything else throws `RangeError`.
- libbase64 and js-base64 skip characters outside the alphabet and data after padding, and base64-js stops at the first `=`. The default `'loose'` mode throws `InvalidInputError` for both, and `'mime'` mode gives libbase64's result.
- base64-js and js-base64 accept `+/` and `-_` mixed in one string. `decode` accepts only the alphabet that `alphabet` selects, except in `'mime'` mode.
- js-base64's `decode` returns a string, and `decode` returns bytes, so pass them to `TextDecoder` to get the text.
- libbase64's `decode` returns a `Buffer` argument unchanged. `decode` reads a `Uint8Array` as base64 text.
- js-base64 encodes lone surrogates as they are. `encode` encodes strings with `TextEncoder`, which replaces a lone surrogate with U+FFFD.
- libbase64's `Encoder` options `skipStartBytes`, `limitOutputBytes`, and `startPadding` and its byte counters have no equivalent in `EncoderStream`, and string chunks are always encoded as UTF-8.
