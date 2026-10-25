# @portable/quoted-printable

Encodes and decodes quoted-printable (RFC 2045 section 6.7), as functions and as streams. Runs in browsers, Cloudflare Workers, Deno, Bun and Node 24+.

Replaces [libqp](https://www.npmjs.com/package/libqp) and [quoted-printable](https://www.npmjs.com/package/quoted-printable).

```sh
npm install @portable/quoted-printable
```

```ts
import * as QuotedPrintable from '@portable/quoted-printable';

QuotedPrintable.encode('tere jõgeva'); // 'tere j=C3=B5geva'
new TextDecoder().decode(QuotedPrintable.decode('tere j=C3=B5geva')); // 'tere jõgeva'

const body = file.stream().pipeThrough(new QuotedPrintable.EncoderStream());
const bytes = response.body!.pipeThrough(new QuotedPrintable.DecoderStream());
```

## API

| Export | Takes | Returns |
| --- | --- | --- |
| `encode(input, options?)` | `Uint8Array` or `string` (encoded as UTF-8) | `string` |
| `decode(input)` | `string` (read as UTF-8) or `Uint8Array` | `Uint8Array` |
| `new EncoderStream(options?)` | `Uint8Array` or `string` chunks | a `TransformStream` that emits the encoded text as ASCII bytes |
| `new DecoderStream(options?)` | `string` or `Uint8Array` chunks | a `TransformStream` that emits the decoded bytes |

`encode()` keeps line breaks, escapes `=`, bytes outside printable ASCII, and a space or tab before a line break or at the end. It also escapes a hyphen that would start a line, so no line of the output can read as a MIME boundary. It inserts soft line breaks (`=` and CRLF) to keep each line within `lineLength`, preferring to break after a space or punctuation, and never breaks inside an escape or a UTF-8 sequence.

`decode()` removes soft line breaks (`=` before CRLF, LF or the end) and whitespace at the end of each line, and decodes `=XX` escapes in either case. Anything else, including a malformed escape or a raw 8-bit byte, is copied as is. It never throws. To get text in another charset, pass the bytes to `new TextDecoder(charset)`.

Both streams produce the same bytes as the functions however the input is chunked, including when a chunk boundary splits an escape, a CRLF, a whitespace run or a surrogate pair.

## Options

| Option | Default | Description |
| --- | --- | --- |
| `lineLength` | `76` | Longest line, not counting the line break. An integer of at least 4, or `false` for no soft line breaks. Anything else throws a `RangeError`. |
| `binary` | `false` | Escape a CR or LF that isn't part of a CRLF pair, so a transport that rewrites line endings can't change the data. |
| `signal` | none | `EncoderStream` and `DecoderStream` only. Aborting errors the stream with `signal.reason` and cancels the source piped into it. |

`DecoderStream` takes no other option.

## Why use this over libqp and quoted-printable

Output matches libqp 3.0.1 byte for byte, with web streams instead of Node streams, and the package depends only on other `@portable/*` packages. The bugs below are fixed in libqp 3, but libqp 2.x and quoted-printable still have them.

- Encoding 512 KB of text was about 1.2× faster than libqp 3.0.1 and 3× faster than quoted-printable. Decoding 256 KB of random bytes was about 3× faster than libqp.
- `encode` escapes a hyphen that would start a line, so no line of the body can read as a MIME boundary. libqp before 2.1.3 could start a line with `--`.
- `EncoderStream` output doesn't depend on how the input is chunked, and a soft line break never splits a UTF-8 sequence. libqp before 3.0.0 got both wrong, and quoted-printable still splits UTF-8 sequences.
- `decode` removes the whole run of whitespace at the end of a line, in linear time. quoted-printable removes one character ([quoted-printable #8](https://github.com/mathiasbynens/quoted-printable/issues/8)), and libqp before 2.1.3 took quadratic time.
- `encode` takes a `Uint8Array` and text above U+00FF. quoted-printable takes neither: it throws a `RangeError` on that text ([quoted-printable #4](https://github.com/mathiasbynens/quoted-printable/issues/4)).
- `encode` breaks lines at 76 characters by default, and libqp's `encode` doesn't break lines at all. Pass `lineLength: false` to match libqp's `encode`.
- libqp's `wrap`, which adds soft line breaks to quoted-printable you already have, has no equivalent. Set `lineLength` when you encode.
- `lineLength` must be `false` or an integer of at least 4. libqp treats 0, `NaN` and non-numbers as 76 and raises anything below 4 to 4.
- `decode` reads a string as UTF-8, as `encode` does, and returns a `Uint8Array` instead of libqp's `Buffer`. libqp reads each character's low byte, so pass a `Uint8Array` to decode raw 8-bit data.
- libqp's `Encoder` counts `inputBytes` and `outputBytes`, and `EncoderStream` doesn't. Count chunks in a `TransformStream` of your own.
- quoted-printable escapes every CR and LF and keeps every line within 75 characters. `encode` keeps line breaks, escapes a lone CR or LF only with `binary: true`, and allows 76.
- quoted-printable's `decode` also treats `=` before a lone CR as a soft line break. RFC 2045 and libqp don't, and neither does `decode`.
- The libqp 2.x `Encoder` left a hyphen after a lone CR unescaped, so the hyphen would start a line if a relay turned the CR into CRLF. `encode` follows libqp 3, which escapes it.

<!-- bench:start -->
<table>
<thead><tr><th align="left">Library</th><th align="right">Ops/s</th><th align="left">Relative</th><th></th></tr></thead>
<tbody>
<tr><th colspan="4" align="left">Encode 512 KB of text</th></tr>
<tr><td>@portable/quoted-printable</td><td align="right">106</td><td></td><td><img src="https://portablejs.com/bar.svg" width="160" height="12" alt="" /></td></tr>
<tr><td>libqp</td><td align="right">90.6</td><td>1.2× slower</td><td><img src="https://portablejs.com/bar.svg" width="137" height="12" alt="" /></td></tr>
<tr><td>quoted-printable</td><td align="right">38.2</td><td>2.8× slower</td><td><img src="https://portablejs.com/bar.svg" width="58" height="12" alt="" /></td></tr>
<tr><th colspan="4" align="left">Encode 256 KB of random bytes</th></tr>
<tr><td>@portable/quoted-printable</td><td align="right">155</td><td></td><td><img src="https://portablejs.com/bar.svg" width="160" height="12" alt="" /></td></tr>
<tr><td>libqp</td><td align="right">132</td><td>1.2× slower</td><td><img src="https://portablejs.com/bar.svg" width="136" height="12" alt="" /></td></tr>
<tr><th colspan="4" align="left">Encode a 512 KB text stream in 16 KB chunks</th></tr>
<tr><td>@portable/quoted-printable</td><td align="right">97.0</td><td></td><td><img src="https://portablejs.com/bar.svg" width="160" height="12" alt="" /></td></tr>
<tr><td>libqp</td><td align="right">94.2</td><td>same</td><td><img src="https://portablejs.com/bar.svg" width="155" height="12" alt="" /></td></tr>
<tr><th colspan="4" align="left">Decode the encoded 512 KB of text</th></tr>
<tr><td>@portable/quoted-printable</td><td align="right">97.8</td><td></td><td><img src="https://portablejs.com/bar.svg" width="160" height="12" alt="" /></td></tr>
<tr><td>libqp</td><td align="right">86.3</td><td>1.1× slower</td><td><img src="https://portablejs.com/bar.svg" width="141" height="12" alt="" /></td></tr>
<tr><td>quoted-printable</td><td align="right">34.3</td><td>2.9× slower</td><td><img src="https://portablejs.com/bar.svg" width="56" height="12" alt="" /></td></tr>
<tr><th colspan="4" align="left">Decode the encoded 256 KB of random bytes</th></tr>
<tr><td>@portable/quoted-printable</td><td align="right">255</td><td></td><td><img src="https://portablejs.com/bar.svg" width="160" height="12" alt="" /></td></tr>
<tr><td>libqp</td><td align="right">76.3</td><td>3.3× slower</td><td><img src="https://portablejs.com/bar.svg" width="48" height="12" alt="" /></td></tr>
<tr><td>quoted-printable</td><td align="right">19.0</td><td>13× slower</td><td><img src="https://portablejs.com/bar.svg" width="12" height="12" alt="" /></td></tr>
<tr><th colspan="4" align="left">Decode the encoded text as a stream</th></tr>
<tr><td>@portable/quoted-printable</td><td align="right">105</td><td></td><td><img src="https://portablejs.com/bar.svg" width="160" height="12" alt="" /></td></tr>
<tr><td>libqp</td><td align="right">78.1</td><td>1.3× slower</td><td><img src="https://portablejs.com/bar.svg" width="119" height="12" alt="" /></td></tr>
</tbody>
</table>

Operations per second from `pnpm bench`, higher is better, in Node 24.22.0, on Intel(R) Xeon(R) Processor @ 2.10GHz (4 cores). Each benchmark lists only the libraries that can do the same work, fastest first. The relative speed compares each library with @portable/quoted-printable, and the bars are scaled to the fastest library.

| Library | Version | Minified and gzipped | Runtime dependencies | Node built-ins | TypeScript types |
| --- | --- | ---: | ---: | --- | --- |
| @portable/quoted-printable | – | 2.3 kB | 3 | none | included |
| libqp | 3.0.1 | 1.8 kB | 0 | `Buffer`, `stream` | included |
| quoted-printable | 1.0.1 | 1.1 kB | 1 | none | `@types/quoted-printable` |

Sizes cover the imports in the usage example, or the equivalent imports of each library, bundled for the browser by `scripts/bundle-size.ts`. Runtime dependencies count every package installed with the published package. A library that uses Node built-ins needs polyfills in a browser and the `nodejs_compat` flag in Cloudflare Workers.
<!-- bench:end -->
