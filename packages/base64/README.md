# @portable/base64

Encodes and decodes base64 and base64url, with optional line wrapping for MIME and streams for large bodies. Runs in browsers, Cloudflare Workers, Deno, Bun and Node 24+.

Replaces [libbase64](https://www.npmjs.com/package/libbase64), [base64-js](https://www.npmjs.com/package/base64-js) and [js-base64](https://www.npmjs.com/package/js-base64).

```sh
npm install @portable/base64
```

```ts
import * as Base64 from '@portable/base64'

Base64.encode('hello') // 'aGVsbG8='
Base64.encode(bytes, { alphabet: 'base64url', omitPadding: true })
Base64.encode(attachment, { lineLength: 76 }) // MIME body, CRLF between lines

new TextDecoder().decode(Base64.decode('aGVsbG8=')) // 'hello'
Base64.decode(mimeBody, { mode: 'mime' })

const response = await fetch('https://example.com/logo.png')
const body = response.body!.pipeThrough(new Base64.EncoderStream({ lineLength: 76 }))
```

`encode` and `decode` call `Uint8Array.prototype.toBase64` and `Uint8Array.fromBase64` where the runtime has them (current Chromium, Firefox and Safari). Elsewhere, Node 24 included, a JavaScript fallback gives the same output and throws on the same input. The browser tests check the two against each other.

## API

| Export | Does |
| --- | --- |
| `encode(input, options?)` | Encodes a `Uint8Array`, or a string as UTF-8, to a base64 string. |
| `decode(input, options?)` | Decodes a base64 string, or its bytes, to a `Uint8Array`. |
| `new EncoderStream(options?)` | `TransformStream<Uint8Array \| string, string>`. Same output as `encode` of the whole input, however it is chunked. |
| `new DecoderStream(options?)` | `TransformStream<string \| Uint8Array, Uint8Array>`. Same output as `decode` of the whole input; line breaks, padding and groups of four characters can be split across chunks anywhere. |
| `InvalidInputError` | Thrown, or errors the stream, for a character outside the alphabet or misplaced padding. |
| `TruncatedError` | Thrown, or errors the stream, when the input ends inside a group of four characters. |

### Encode options

`encode` and `EncoderStream` take the same options.

| Option | Default | Description |
| --- | --- | --- |
| `alphabet` | `'base64'` | `'base64'` uses `+` and `/`. `'base64url'` uses `-` and `_` (RFC 4648 §5). |
| `omitPadding` | `false` | Leave out the trailing `=`. |
| `lineLength` | `false` | Characters per line, or `false` for one line. MIME uses 76. The output never ends with a line ending. |
| `lineEnding` | `'\r\n'` | Inserted between lines. |

### Decode options

`decode` and `DecoderStream` take the same options.

| Option | Default | Description |
| --- | --- | --- |
| `alphabet` | `'base64'` | Alphabet of the input. `'mime'` mode accepts both. |
| `mode` | `'loose'` | How to treat input that isn't canonical base64, below. |

| Mode | Whitespace | Missing padding | Other characters | Data after padding |
| --- | --- | --- | --- | --- |
| `'loose'` | skipped | accepted | `InvalidInputError` | `InvalidInputError` |
| `'strict'` | skipped | `TruncatedError` | `InvalidInputError` | `InvalidInputError` |
| `'mime'` | skipped | accepted | skipped | decoded as a new segment |

`'loose'` and `'strict'` are `Uint8Array.fromBase64` with `lastChunkHandling` set to the same name. `'strict'` also rejects non-zero bits before the padding (`'YR=='`). Both throw `TruncatedError` for one leftover character (`'YWJjZ'`) or a single `=` where two are needed (`'YQ='`).

`'mime'` follows RFC 2045 §6.8, which tells decoders to ignore characters outside the alphabet, and libbase64, which decodes each `=`-terminated segment on its own. It reads both alphabets and never throws, so use it for mail bodies and other input you don't control.

## Migrating

| Before | @portable/base64 |
| --- | --- |
| libbase64 `encode(buffer)` | `encode(bytes)` |
| libbase64 `wrap(encode(buffer), 76)` | `encode(bytes, { lineLength: 76 })` |
| libbase64 `decode(string)` | `decode(string, { mode: 'mime' })` |
| libbase64 `new Encoder()` | `new EncoderStream({ lineLength: 76 })` |
| libbase64 `new Decoder()` | `new DecoderStream({ mode: 'mime' })` |
| base64-js `fromByteArray(bytes)` | `encode(bytes)` |
| base64-js `toByteArray(string)` | `decode(string)` |
| base64-js `byteLength(string)` | `decode(string).length` |
| js-base64 `encode(string)` | `encode(string)` |
| js-base64 `encodeURI(string)`, `encode(string, true)` | `encode(string, { alphabet: 'base64url', omitPadding: true })` |
| js-base64 `decode(string)` | `new TextDecoder().decode(decode(string))` |
| js-base64 `fromUint8Array(bytes)`, `toUint8Array(string)` | `encode(bytes)`, `decode(string)` |
| js-base64 `isValid(string)` | `decode(string, { mode: 'strict' })` in a `try` |

These behaviors differ on purpose:

- Wrapping is off by default; libbase64's `Encoder` wraps at 76. Pass `lineLength: 76` for MIME.
- `lineLength` must be a positive integer or `false`. libbase64 rounds fractions down and replaces anything else with 76; we throw `RangeError`.
- The default `'loose'` mode throws on characters outside the alphabet and on data after padding. libbase64 and js-base64 skip them, and base64-js returns wrong bytes or stops at the first `=`. `'mime'` mode gives libbase64's result.
- base64-js and js-base64 accept `+/` and `-_` mixed in one string. We take one alphabet, chosen with `alphabet`, except in `'mime'` mode.
- `decode` of a `Uint8Array` reads it as base64 text. libbase64 returns a `Buffer` argument unchanged.
- Strings are encoded with `TextEncoder`, which replaces a lone surrogate with U+FFFD. js-base64 encodes lone surrogates as is.
- `EncoderStream` has no `skipStartBytes`, `limitOutputBytes`, `startPadding` or byte counters, and string chunks are always UTF-8.
- `encode` throws `TypeError` for typed arrays other than `Uint8Array`. base64-js encoded an `Int8Array` with negative values to wrong output.

## Performance

Node 24 has no native base64 on `Uint8Array`, so it runs the fallback. Mean times for 1 MB on a shared cloud container, from `pnpm bench`:

| | @portable/base64 | base64-js | js-base64 | libbase64 | `Buffer` |
| --- | --- | --- | --- | --- | --- |
| encode | 2.6 ms | 18 ms | 7.2 ms | 0.4 ms | 0.4 ms |
| encode, 76 columns | 2.8 ms | | | 2.4 ms | |
| decode | 4.0 ms | 4.2 ms | 47 ms | 0.3 ms | 0.3 ms |
| `EncoderStream`, 76 columns, 16 KB chunks | 2.8 ms | | | 4.2 ms | |
| `DecoderStream`, 76 columns, 16 KB chunks | 5.3 ms | | | 8.1 ms | |

libbase64's `encode` and `decode` call `Buffer`, which is C++. For 32 bytes, all four libraries take about 0.5 µs.
