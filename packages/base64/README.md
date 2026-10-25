# @portable/base64

Encodes and decodes base64 and base64url, with optional line wrapping for MIME and streams for large bodies. Runs in browsers, Cloudflare Workers, Deno, Bun and Node 24+.

Replaces [libbase64](https://www.npmjs.com/package/libbase64), [base64-js](https://www.npmjs.com/package/base64-js) and [js-base64](https://www.npmjs.com/package/js-base64).

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

`encode` and `decode` call `Uint8Array.prototype.toBase64` and `Uint8Array.fromBase64` where the runtime has them (current Chromium, Firefox and Safari). Elsewhere, Node 24 included, a JavaScript fallback gives the same output and throws on the same input. The browser tests check the two against each other.

## API

| Export | Does |
| --- | --- |
| `encode(input, options?)` | Encodes a `Uint8Array`, or a string as UTF-8, to a base64 string. |
| `decode(input, options?)` | Decodes a base64 string, or its bytes, to a `Uint8Array`. |
| `new EncoderStream(options?)` | `TransformStream<Uint8Array \| string, Uint8Array>` that emits the base64 text as ASCII bytes. However the input is split into chunks, the output equals `encode` of the whole input. |
| `new DecoderStream(options?)` | `TransformStream<string \| Uint8Array, Uint8Array>`. Same output as `decode` of the whole input. Line breaks, padding and groups of four characters can be split across chunks anywhere. |
| `InvalidInputError` | Thrown, or errors the stream, for a character outside the alphabet or misplaced padding. |
| `TruncatedError` | Thrown, or errors the stream, when the input ends inside a group of four characters. |

### Encode options

`encode` and `EncoderStream` take the same options.

| Option | Default | Description |
| --- | --- | --- |
| `alphabet` | `'base64'` | `'base64'` uses `+` and `/`. `'base64url'` uses `-` and `_` (RFC 4648 §5). |
| `omitPadding` | `false` | Leave out the trailing `=`. |
| `lineLength` | `false` | Characters per line, or `false` for one line. MIME uses 76. The output never ends with a line ending. |
| `newline` | `'\r\n'` | Inserted between lines. |
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

`'mime'` follows RFC 2045 §6.8, which tells decoders to ignore characters outside the alphabet, and libbase64, which decodes each `=`-terminated segment on its own. It reads both alphabets and never throws, so use it for mail bodies and other input you don't control.

## Types

| Type | Description |
| --- | --- |
| `Base64.Alphabet` | `'base64'` or `'base64url'` (RFC 4648). |
| `Base64.Mode` | `'loose'`, `'strict'` or `'mime'`, how `decode` treats input that isn't canonical base64. |

## Why use this over base64-js, js-base64 and libbase64

One package does what the three did separately: base64 and base64url, MIME line wrapping, and streams. It calls the platform's `toBase64` and `fromBase64` where the runtime has them, and has no dependencies.

- In Node, which has no native base64 on `Uint8Array`, encoding 1 MB was about 8× faster than base64-js and 3× faster than js-base64. Decoding 1 MB was as fast as base64-js and about 10× faster than js-base64.
- `EncoderStream` at 76 columns was as fast as libbase64's `Encoder`, and `DecoderStream` was about 1.3× faster than its `Decoder`.
- `Buffer` is 10 to 20× faster on 1 MB in Node, and so are libbase64's plain `encode` and `decode`, which call `Buffer`. In Node-only code where that matters, keep `Buffer`.
- The default mode throws `InvalidInputError` on characters outside the alphabet. base64-js drops them and returns wrong bytes (base64-js #81), and throws a `RangeError` on `'===='` (base64-js #73).
- `encode` throws a `TypeError` for an `Int8Array`, which base64-js encoded to wrong output (base64-js #38), and the stream output doesn't depend on chunk boundaries, which libbase64 fixed only in 1.3.2.

### Performance

Node 24 has no native base64 on `Uint8Array`, so it runs the fallback. libbase64's `encode` and `decode` call `Buffer`, which is C++.

<!-- bench:start -->
| | @portable/base64 | base64-js | js-base64 | libbase64 | `Buffer` (Node) |
| --- | ---: | ---: | ---: | ---: | ---: |
| Encode 1 MB | 435 | 55.1 | 148 | 5,000 | 4,740 |
| Encode 1 MB in 76-column lines | 435 | – | – | 554 | – |
| Decode 1 MB | 255 | 239 | 22.4 | 4,210 | 5,450 |
| Decode 1 MB of MIME base64 | 219 | – | – | 3,900 | – |
| Encode 32 bytes | 3,450,000 | 1,050,000 | 2,420,000 | – | 2,370,000 |
| Decode 32 bytes | 3,110,000 | 2,750,000 | 1,130,000 | – | 2,360,000 |
| Encode a 1 MB stream in 76-column lines | 413 | – | – | 394 | – |
| Decode a 1 MB stream of MIME base64 | 233 | – | – | 183 | – |

Operations per second from `pnpm bench`, higher is better, in Node 24.22.0, on Intel(R) Xeon(R) Processor @ 2.10GHz (4 cores). A dash means the library has no equivalent.

| | @portable/base64 | base64-js | js-base64 | libbase64 | `Buffer` (Node) |
| --- | --- | --- | --- | --- | --- |
| Minified and gzipped | 2.9 kB | 1.1 kB | 1.6 kB | 1.8 kB | built in |
| Runtime dependencies | 1 | 0 | 0 | 0 | – |
| Node built-ins used | none | none | none | `buffer`, `stream` | Node only |
| TypeScript types | included | included | included | none | – |
| Version compared | – | 1.5.1 | 3.9.4 | 1.3.3 | – |

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
- libbase64's `Encoder` options `skipStartBytes`, `limitOutputBytes` and `startPadding` and its byte counters have no equivalent in `EncoderStream`, and string chunks are always encoded as UTF-8.
