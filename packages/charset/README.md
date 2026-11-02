# @portable/charset

Encodes text into legacy charsets such as Shift_JIS, GBK, Big5, and windows-1251, and normalizes charset labels. Runs in browsers, Cloudflare Workers, Node 24+, Bun, and Deno.

Replaces the encoding half of [iconv-lite](https://www.npmjs.com/package/iconv-lite). For decoding, use `TextDecoder`, which already supports every charset here.

```sh
npm install @portable/charset
```

```ts
import * as Charset from '@portable/charset';
import { shiftJis } from '@portable/charset/shift_jis';

Charset.encode('こんにちは', shiftJis); // Uint8Array [0x82, 0xb1, 0x82, 0xf1, ...]

const csv = response.body!.pipeThrough(new Charset.EncoderStream(shiftJis));
```

Every charset and label follows the [WHATWG Encoding Standard](https://encoding.spec.whatwg.org/), so `TextDecoder` in any browser decodes the bytes back to the same text.

## API

| Export | Does |
| --- | --- |
| `encode(text, charset, options?)` | Encodes a string, or a `Uint8Array` of UTF-8, into a `Uint8Array` in `charset`. |
| `new EncoderStream(charset, options?)` | `TransformStream<string \| Uint8Array, Uint8Array>` that encodes text in `charset`. The output equals `encode` of the whole input, however it is chunked. ISO-2022-JP's escape back to ASCII is written when the stream closes. |
| `normalizeLabel(label)` | Returns the WHATWG name of a charset label, such as `'Shift_JIS'` for `'sjis'`. Returns `undefined` if the label is unknown or its charset has no encoder, such as `iso-2022-kr`. |
| `load(label, options?)` | Imports the family of a label's charset and resolves to the charset. Rejects with `UnsupportedError` if `normalizeLabel` returns `undefined`. Aborting `signal` rejects with `signal.reason`, but the import keeps running. |
| `utf8` | UTF-8, encoded with `TextEncoder`. Use it when a label may be UTF-8, or to write a UTF-8 byte order mark. |
| `UnsupportedError` | Thrown by `load` for an unknown label. With `unmappable: 'error'`, thrown by `encode`, or errors `EncoderStream`, for a character the charset can't represent. |

## Charsets

Each family is its own entry point, so a bundle includes only the tables it imports. Sizes are minified and gzipped, including `encode`.

| Entry point | Exports | gzip |
| --- | --- | --- |
| @portable/charset | `encode`, `EncoderStream`, `utf8`, `normalizeLabel`, `load`, `UnsupportedError` | 1.0 kB |
| `@portable/charset/single-byte` | `ibm866`, `iso8859_2` to `iso8859_8`, `iso8859_8i`, `iso8859_10`, `iso8859_13` to `iso8859_16`, `koi8R`, `koi8U`, `macintosh`, `windows874`, `windows1250` to `windows1258`, `xMacCyrillic`, `xUserDefined` | 1.6 kB for one, 3.1 kB for all |
| `@portable/charset/shift_jis` | `shiftJis` | 11.6 kB |
| `@portable/charset/euc-jp` | `eucJp` | 11.5 kB |
| `@portable/charset/iso-2022-jp` | `iso2022Jp` | 11.8 kB |
| `@portable/charset/gbk` | `gbk`, `gb18030` | 18.2 kB |
| `@portable/charset/big5` | `big5` | 18.2 kB |
| `@portable/charset/euc-kr` | `eucKr` | 13.5 kB |
| `@portable/charset/utf-16` | `utf16le`, `utf16be` | 0.4 kB |

WHATWG maps the ISO-8859-1, ISO-8859-9, and ISO-8859-11 labels to `windows1252`, `windows1254`, and `windows874`, so there is no `iso8859_1`, `iso8859_9`, or `iso8859_11`.

The three Japanese charsets share one table, so all three together are about 13 kB. Each table is unpacked on first use and then takes 128 kB of memory.

## Labels known at runtime

When the charset comes from a header or a form, `load` resolves the label and imports only that family:

```ts
import * as Charset from '@portable/charset';

const charset = await Charset.load('windows-31j'); // the Shift_JIS charset
const bytes = Charset.encode(text, charset);
```

`normalizeLabel` and `load` accept any WHATWG label or iconv-lite name for these charsets. They ignore case, punctuation, surrounding ASCII whitespace, and a trailing year (`ISO_8859-5:1988`). A label with any other character, such as NUL or a no-break space, is unknown.

Bundlers split `load` into one chunk per family, and the entry chunk is 3.2 kB.

## Options

`encode(text, charset, options)` and `new EncoderStream(charset, options)` take the same options.

| Option | Default | Description |
| --- | --- | --- |
| `unmappable` | `'replace'` | What to write for a character the charset can't represent. `'replace'` writes `?`, as iconv-lite does. `'html'` writes a numeric character reference such as `&#26085;`, as browsers do in form submissions. `'error'` throws `UnsupportedError`. A function `(codePoint) => string` returns replacement text, which must be encodable in the same charset or `encode` throws `UnsupportedError`. |
| `bom` | `false` | Write a byte order mark first. Only UTF-8, UTF-16LE, and UTF-16BE have one. |
| `signal` | none | `EncoderStream` only. Aborting errors the stream with `signal.reason` and cancels the source piped into it. |

Use `'html'` for HTML forms and pages, and `'error'` when losing characters is worse than failing. The default `'replace'` can't inject markup into CSV, email, or other non-HTML output.

A UTF-8 byte order mark at the start of `Uint8Array` input is dropped, as `TextDecoder` does. Lone surrogates are encoded as U+FFFD, as `TextEncoder` does. A character split across `EncoderStream` chunks is encoded once.

## Decoding

`TextDecoder` decodes every charset here, and in browsers it follows WHATWG exactly. Node's `TextDecoder` differs from WHATWG on some rare code points in Big5, EUC-KR, ISO-2022-JP, and Shift_JIS. Some edge runtimes only decode UTF-8 and UTF-16, so check yours if you decode legacy charsets there.

## Types

| Type | Description |
| --- | --- |
| `Charset.Charset` | A charset that `encode` and `EncoderStream` write. Its `name` is a `Charset.Name`, and its `encode(text)` method encodes with the default options. A charset is therefore a `CharsetEncoder`, so you can pass it where [@portable/mime-headers](https://portablejs.com/packages/mime-headers) and [@portable/mail](https://portablejs.com/packages/mail) take one. |
| `Charset.Name` | The WHATWG name of a charset this package encodes, such as `'Shift_JIS'`. |

## Why use this over iconv-lite

iconv-lite puts every table in your bundle. Here each charset family is its own entry point, and decoding is left to `TextDecoder`.

- `encode` from the root is 1.0 kB gzipped, and one single-byte charset adds 0.6 kB. The gb18030 table is 17 kB gzipped, against 32 kB in iconv-lite.
- Encoding 230 kB of Japanese text to Shift_JIS was about 2.4× faster than iconv-lite, and 380 kB of Cyrillic text to windows-1251 ran at the same speed. UTF-8 is slightly slower than `TextEncoder`, so use `TextEncoder` if you only need UTF-8.
- The output follows the WHATWG tables, so browsers decode it back to the same text. iconv-lite writes U+FFFD as a byte that several single-byte charsets leave undefined, writes four-byte sequences in GBK that GBK decoders reject, and writes lone surrogates raw in UTF-16.
- `EncoderStream` encodes a surrogate pair split across chunks as one character (iconv-lite #282).
- A prototype key such as `constructor` is not a charset label (iconv-lite #328).
- ISO-2022-JP can be encoded. iconv-lite doesn't support it.

<!-- bench:start -->
<table>
<thead><tr><th align="left">Library</th><th align="right">Ops/s</th><th align="left">Relative</th><th></th></tr></thead>
<tbody>
<tr><th colspan="4" align="left">Encode 380 kB of Cyrillic text to windows-1251</th></tr>
<tr><td>iconv-lite</td><td align="right">736</td><td>same</td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="160" height="12" alt="" /></td></tr>
<tr><td>@portable/charset</td><td align="right">725</td><td></td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="158" height="12" alt="" /></td></tr>
<tr><th colspan="4" align="left">Encode 230 kB of Japanese text to Shift_JIS</th></tr>
<tr><td>@portable/charset</td><td align="right">870</td><td></td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="160" height="12" alt="" /></td></tr>
<tr><td>iconv-lite</td><td align="right">363</td><td>2.4× slower</td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="67" height="12" alt="" /></td></tr>
<tr><th colspan="4" align="left">Encode 610 kB of text to UTF-8</th></tr>
<tr><td><code>TextEncoder</code></td><td align="right">453</td><td>1.1× faster</td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="160" height="12" alt="" /></td></tr>
<tr><td>iconv-lite</td><td align="right">435</td><td>same</td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="154" height="12" alt="" /></td></tr>
<tr><td>@portable/charset</td><td align="right">425</td><td></td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="150" height="12" alt="" /></td></tr>
</tbody>
</table>

Operations per second from `pnpm bench`, higher is better, in Node 24.22.0, on Intel(R) Xeon(R) Processor @ 2.10GHz (4 cores). Each benchmark lists only the libraries that can do the same work, fastest first. The relative speed compares each library with @portable/charset, and the bars are scaled to the fastest library.

| Library | Version | Minified and gzipped | Runtime dependencies | Node built-ins | TypeScript types |
| --- | --- | ---: | ---: | --- | --- |
| @portable/charset | – | 14 kB | 3 | none | included |
| iconv-lite | 0.7.3 | 153 kB | 1 | `buffer`, `stream`, `string_decoder` | included |
| `TextEncoder` | – | built in | – | none | – |

Sizes cover the imports in the usage example, or the equivalent imports of each library, bundled for the browser by `scripts/bundle-size.ts`. Runtime dependencies count every package installed with the published package. A library that uses Node built-ins needs polyfills in a browser and the `nodejs_compat` flag in Cloudflare Workers.
<!-- bench:end -->

Differences to check when you switch from iconv-lite:

- Labels follow WHATWG, as in browsers, so `latin1`, `ascii`, and `iso-8859-1` map to windows-1252, and `gb2312` maps to GBK. `KOI8-U` is KOI8-RU, `x-mac-cyrillic` is the Ukrainian variant, and `macintosh` has € at 0xDB.
- iconv-lite writes a byte order mark for the `utf-16` label by default. Here `utf-16` maps to UTF-16LE, which has no byte order mark unless you pass `bom: true`.
- WHATWG specifies some characters as decode-only: HKSCS in Big5; JIS X 0212 in EUC-JP; and the IBM duplicates in the NEC rows of Shift_JIS. These still decode with `TextDecoder` but never encode.
- iconv-lite writes `?` for the C1 controls that the windows-125x tables map. `encode` writes the bytes the WHATWG tables give them.
- iconv-lite's `base64`, `hex`, `binary`, and `ucs2` codecs aren't charsets. Use [@portable/base64](https://portablejs.com/packages/base64) for `base64`, `Bytes.toHex` from [@portable/bytes](https://portablejs.com/packages/bytes) for `hex`, `utf16le` for `ucs2`, and `String.fromCharCode` and `charCodeAt` for `binary`.
- The DOS and IBM code pages, such as cp437 and cp850, are not supported yet, and neither are UTF-7, UTF-32, and CESU-8.
