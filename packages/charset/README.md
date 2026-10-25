# @portable/charset

Encodes text into legacy charsets such as Shift_JIS, GBK, Big5 and windows-1251, and normalizes charset labels. Runs in browsers, Cloudflare Workers, Deno, Bun and Node 24+.

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

Every charset and label follows the [WHATWG Encoding Standard](https://encoding.spec.whatwg.org/), so the bytes decode back to the same text with `TextDecoder` in any browser.

## Charsets

Each family is its own entry point, so a bundle only includes the tables it imports. Sizes are minified and gzipped, including `encode`.

| Entry point | Exports | gzip |
| --- | --- | --- |
| `@portable/charset` | `encode`, `EncoderStream`, `utf8`, `normalizeLabel`, `load`, `UnsupportedError` | 1.0 kB |
| `@portable/charset/single-byte` | `ibm866`, `iso8859_2` to `iso8859_16`, `iso8859_8i`, `koi8R`, `koi8U`, `macintosh`, `windows874`, `windows1250` to `windows1258`, `xMacCyrillic`, `xUserDefined` | 1.6 kB for one, 3.1 kB for all |
| `@portable/charset/shift_jis` | `shiftJis` | 11.6 kB |
| `@portable/charset/euc-jp` | `eucJp` | 11.5 kB |
| `@portable/charset/iso-2022-jp` | `iso2022Jp` | 11.8 kB |
| `@portable/charset/gbk` | `gbk`, `gb18030` | 18.2 kB |
| `@portable/charset/big5` | `big5` | 18.2 kB |
| `@portable/charset/euc-kr` | `eucKr` | 13.5 kB |
| `@portable/charset/utf-16` | `utf16le`, `utf16be` | 0.4 kB |

The three Japanese charsets share one table, so all three together are about 13 kB. Each table is unpacked on first use and takes 128 kB of memory after that.

## Labels known at runtime

When the charset comes from a header or a form, `load` resolves the label and imports only that family:

```ts
import * as Charset from '@portable/charset';

const charset = await Charset.load('windows-31j'); // the Shift_JIS charset
const bytes = Charset.encode(text, charset);
```

`load` rejects with `UnsupportedError` for an unknown label. Pass `{ signal }` to stop waiting for the import: `load` then rejects with `signal.reason`. `normalizeLabel(label)` returns the label's WHATWG name, such as `'Shift_JIS'`, or `undefined` if the label is unknown or its charset has no encoder, so you can use it to check a label before you call `load`. The name's type is `Charset.Name`, and each charset export is a `Charset.Charset` whose `name` is that name. A charset's `encode(text)` method encodes with the default options, so a charset can be passed where `@portable/mime-headers` and `@portable/mail` take a `CharsetEncoder`. Labels can be any WHATWG label or iconv-lite name for these charsets. Case, punctuation, surrounding ASCII whitespace and a trailing year (`ISO_8859-5:1988`) are ignored.

Bundlers split `load` into one chunk per family. With every family reachable, the entry chunk is 3.2 kB and each family loads on demand.

## Options

`encode(text, charset, options)` and `new EncoderStream(charset, options)` take the same options.

| Option | Default | Description |
| --- | --- | --- |
| `unmappable` | `'replace'` | What to write for a character the charset can't represent. `'replace'` writes `?`. `'html'` writes a numeric character reference such as `&#26085;`, as browsers do when submitting forms. `'error'` throws `UnsupportedError`. A function `(codePoint) => string` returns the text to write instead. |
| `bom` | `false` | Write a byte order mark first. Only UTF-8, UTF-16LE and UTF-16BE have one. |
| `signal` | none | `EncoderStream` only. Aborting errors the stream with `signal.reason` and cancels the source piped into it. |

`'replace'` is the default for three reasons: iconv-lite also writes `?`, one `?` replaces one character, and a `?` can't inject markup into a non-HTML output such as CSV or email. Use `'html'` for HTML forms and pages, and `'error'` when silent data loss is worse than failing.

Text input can be a string or a `Uint8Array` of UTF-8. A UTF-8 byte order mark at the start of byte input is dropped, as `TextDecoder` drops it, so it isn't encoded as a character. Pass `bom: true` to write the output charset's own byte order mark. Lone surrogates are encoded as U+FFFD, as `TextEncoder` does. `EncoderStream` takes string and `Uint8Array` chunks, and a character split across chunks is encoded once.

## Decoding

`TextDecoder` decodes every charset here. In browsers it follows the WHATWG standard exactly. Node's `TextDecoder` uses ICU, which differs from WHATWG for Big5, EUC-KR, ISO-2022-JP and Shift_JIS on rarely used code points, and some edge runtimes ship `TextDecoder` with UTF-8 and UTF-16 only. Check the runtime you deploy to if you decode legacy charsets there.

## Types

| Type | Description |
| --- | --- |
| `Charset.Charset` | A charset that `encode` and `EncoderStream` write, with its `name` and an `encode(text)` method. |
| `Charset.Name` | The WHATWG name of a charset this package encodes, such as `'Shift_JIS'`. |

## Why use this over iconv-lite

iconv-lite looks charsets up by name in one registry, so a bundle includes every table. In this package, each charset family is its own entry point, decoding is left to `TextDecoder`, and the package depends only on other `@portable/*` packages.

- `encode` from the root is 1.0 kB gzipped, and one single-byte charset adds 0.6 kB. The gb18030 table is 17 kB gzipped, against 32 kB in iconv-lite.
- Encoding 230 kB of Japanese text to Shift_JIS was about 2.4× faster than iconv-lite, and 380 kB of Cyrillic text to windows-1251 ran at the same speed. UTF-8 is slightly slower than `TextEncoder`, so call `TextEncoder` when you only need UTF-8.
- The output follows the WHATWG tables, so browsers decode it back to the same text. iconv-lite writes U+FFFD as a byte that several single-byte charsets leave undefined, writes four-byte sequences in GBK that GBK decoders reject, and writes lone surrogates raw in UTF-16.
- `EncoderStream` encodes a surrogate pair split across chunks as one character (iconv-lite #282), and a prototype key such as `constructor` is not a charset label (iconv-lite #328).
- ISO-2022-JP can be encoded. iconv-lite doesn't support it.

<!-- bench:start -->
<table>
<thead><tr><th align="left">Library</th><th align="right">Ops/s</th><th align="left">Relative</th><th></th></tr></thead>
<tbody>
<tr><th colspan="4" align="left">Encode 380 kB of Cyrillic text to windows-1251</th></tr>
<tr><td>iconv-lite</td><td align="right">736</td><td>same</td><td><img src="../../assets/bar.svg" width="160" height="12" alt="" /></td></tr>
<tr><td><strong>@portable/charset</strong></td><td align="right">725</td><td></td><td><img src="../../assets/bar-ours.svg" width="158" height="12" alt="" /></td></tr>
<tr><th colspan="4" align="left">Encode 230 kB of Japanese text to Shift_JIS</th></tr>
<tr><td><strong>@portable/charset</strong></td><td align="right">870</td><td></td><td><img src="../../assets/bar-ours.svg" width="160" height="12" alt="" /></td></tr>
<tr><td>iconv-lite</td><td align="right">363</td><td>2.4× slower</td><td><img src="../../assets/bar.svg" width="67" height="12" alt="" /></td></tr>
<tr><th colspan="4" align="left">Encode 610 kB of text to UTF-8</th></tr>
<tr><td><code>TextEncoder</code></td><td align="right">453</td><td>1.1× faster</td><td><img src="../../assets/bar.svg" width="160" height="12" alt="" /></td></tr>
<tr><td>iconv-lite</td><td align="right">435</td><td>same</td><td><img src="../../assets/bar.svg" width="154" height="12" alt="" /></td></tr>
<tr><td><strong>@portable/charset</strong></td><td align="right">425</td><td></td><td><img src="../../assets/bar-ours.svg" width="150" height="12" alt="" /></td></tr>
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

- Labels follow WHATWG, as in browsers, so `latin1`, `ascii` and `iso-8859-1` map to windows-1252 and `gb2312` maps to GBK. `KOI8-U` is KOI8-RU, `x-mac-cyrillic` is the Ukrainian variant, and `macintosh` has € at 0xDB.
- iconv-lite writes a byte order mark for the `utf-16` label by default. Here the `utf-16` label maps to UTF-16LE, which is written without one unless you pass `bom: true`.
- Characters that a charset only decodes are unmappable when encoding, as WHATWG specifies: HKSCS in Big5, JIS X 0212 in EUC-JP and the IBM duplicates in the NEC rows of Shift_JIS. They still decode with `TextDecoder`.
- iconv-lite writes `?` for the C1 controls that the windows-125x tables map. `encode` writes the bytes the WHATWG tables give them.
- iconv-lite's `base64`, `hex`, `binary` and `ucs2` codecs aren't charsets, so this package doesn't have them. Use `@portable/base64` for `base64`, `Bytes.toHex` from `@portable/bytes` for `hex`, and `utf16le` for `ucs2`. `binary` maps each byte to the character with the same code, which `String.fromCharCode` and `charCodeAt` already do.
- cp437, cp850 and the other DOS and IBM code pages, UTF-7, UTF-32 and CESU-8 are not supported yet.
