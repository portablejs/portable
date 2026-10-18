# @portable/charset

Encodes text into legacy charsets such as Shift_JIS, GBK, Big5 and windows-1251, and normalizes charset labels. Runs in browsers, Cloudflare Workers, Deno, Bun and Node 24+.

Replaces the encoding half of [iconv-lite](https://www.npmjs.com/package/iconv-lite). For decoding, use `TextDecoder`, which already supports every charset here.

```sh
npm install @portable/charset
```

```ts
import * as Charset from '@portable/charset'
import { shiftJis } from '@portable/charset/shift_jis'

Charset.encode('こんにちは', shiftJis) // Uint8Array [0x82, 0xb1, 0x82, 0xf1, ...]

const csv = response.body!.pipeThrough(new Charset.EncoderStream(shiftJis))
```

Every charset and label follows the [WHATWG Encoding Standard](https://encoding.spec.whatwg.org/), so the bytes decode back to the same text with `TextDecoder` in any browser.

## Charsets

Each family is its own entry point, so a bundle only includes the tables it imports. Sizes are minified and gzipped, including `encode`.

| Entry point | Exports | gzip |
| --- | --- | --- |
| `@portable/charset` | `encode`, `EncoderStream`, `utf8`, `normalizeLabel`, `isSupported`, `load`, `UnsupportedError` | 1.0 kB |
| `@portable/charset/single-byte` | `ibm866`, `iso8859_2` to `iso8859_16`, `iso8859_8i`, `koi8R`, `koi8U`, `macintosh`, `windows874`, `windows1250` to `windows1258`, `xMacCyrillic`, `xUserDefined` | 1.6 kB for one, 3.1 kB for all |
| `@portable/charset/shift_jis` | `shiftJis` | 11.6 kB |
| `@portable/charset/euc-jp` | `eucJp` | 11.5 kB |
| `@portable/charset/iso-2022-jp` | `iso2022Jp` | 11.8 kB |
| `@portable/charset/gbk` | `gbk`, `gb18030` | 18.2 kB |
| `@portable/charset/big5` | `big5` | 18.2 kB |
| `@portable/charset/euc-kr` | `eucKr` | 13.5 kB |
| `@portable/charset/utf-16` | `utf16le`, `utf16be` | 0.4 kB |

The three Japanese charsets share one table, so all three together are about 13 kB. Tables are unpacked on first use; each table takes 128 kB of memory after that.

## Labels known at runtime

When the charset comes from a header or a form, `load` resolves the label and imports only that family:

```ts
import * as Charset from '@portable/charset'

const charset = await Charset.load('windows-31j') // the Shift_JIS charset
const bytes = Charset.encode(text, charset)
```

`load` throws `UnsupportedError` for an unknown label. `isSupported(label)` checks a label first, and `normalizeLabel(label)` returns its WHATWG name, such as `'Shift_JIS'`. Labels can be any WHATWG label or iconv-lite name for these charsets. Case, punctuation, surrounding ASCII whitespace and a trailing year (`ISO_8859-5:1988`) are ignored.

Bundlers split `load` into one chunk per family. With every family reachable, the entry chunk is 3.2 kB and each family loads on demand.

## Options

`encode(text, charset, options)` and `new EncoderStream(charset, options)` take the same options.

| Option | Default | Description |
| --- | --- | --- |
| `unmappable` | `'replace'` | What to write for a character the charset can't represent. `'replace'` writes `?`. `'html'` writes a numeric character reference such as `&#26085;`, as browsers do when submitting forms. `'error'` throws `UnsupportedError`. A function `(codePoint) => string` returns the text to write instead. |
| `bom` | `false` | Write a byte order mark first. Only UTF-8, UTF-16LE and UTF-16BE have one. |

`'?'` is the default because it is what iconv-lite writes, it keeps one character for one character, and it can't inject markup into a non-HTML output such as CSV or email. Use `'html'` for HTML forms and pages, and `'error'` when silent data loss is worse than failing.

Text input can be a string or a `Uint8Array` of UTF-8. Lone surrogates are encoded as U+FFFD, as `TextEncoder` does. `EncoderStream` takes string and `Uint8Array` chunks, and a character split across chunks is encoded once.

## Migrating from iconv-lite

| iconv-lite | @portable/charset |
| --- | --- |
| `iconv.encode(text, 'sjis')` | `Charset.encode(text, shiftJis)`, or `Charset.encode(text, await Charset.load('sjis'))` |
| `iconv.encode(text, 'utf-16', { addBOM: true })` | `Charset.encode(text, utf16le, { bom: true })` |
| `iconv.encodeStream('gbk')` | `new Charset.EncoderStream(gbk)` |
| `iconv.encodingExists(label)` | `Charset.isSupported(label)` |
| `iconv.decode(bytes, label)` | `new TextDecoder(label).decode(bytes)` |
| `iconv.decodeStream(label)` | `new TextDecoderStream(label)` |
| `iconv.defaultCharSingleByte = '#'` | `{ unmappable: () => '#' }` |

What changed:

- **Charsets are values, not strings.** `encode` takes a charset object, so a bundle only includes the families it imports. `load` covers labels known only at runtime.
- **WHATWG labels win.** `latin1`, `ascii` and `iso-8859-1` are windows-1252, and `gb2312` is GBK, as in browsers. `KOI8-U` is KOI8-RU, `x-mac-cyrillic` is the Ukrainian variant, and `macintosh` has € at 0xDB.
- **The `utf-16` label writes UTF-16LE without a byte order mark** unless you pass `bom: true`. iconv-lite writes one by default.
- **Lone surrogates become U+FFFD** in every charset. iconv-lite writes them unchanged in UTF-16 and as `?` elsewhere.
- **Characters a charset only decodes are not encoded.** HKSCS in Big5, JIS X 0212 in EUC-JP and the IBM duplicates in Shift_JIS's NEC rows decode with `TextDecoder` but are unmappable when encoding, as WHATWG specifies.
- **U+FFFD and the C1 controls follow the WHATWG tables.** iconv-lite writes U+FFFD as an undefined byte in several single-byte charsets, and `?` for the C1 controls that windows-125x maps.
- **No `base64`, `hex`, `binary` or `ucs2` codecs.** Use `Uint8Array.prototype.toBase64` and `toHex`, `TextEncoder`, and `utf16le`.
- **Not yet supported:** cp437, cp850 and the other DOS and IBM code pages, UTF-7, UTF-32 and CESU-8.

## Decoding

`TextDecoder` decodes every charset here. In browsers it follows the WHATWG standard exactly. Node's `TextDecoder` uses ICU, which differs from WHATWG for Big5, EUC-KR, ISO-2022-JP and Shift_JIS on rarely used code points, and some edge runtimes ship `TextDecoder` with UTF-8 and UTF-16 only. Check the runtime you deploy to if you decode legacy charsets there.
