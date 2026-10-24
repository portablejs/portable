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
import * as Charset from '@portable/charset'

const charset = await Charset.load('windows-31j') // the Shift_JIS charset
const bytes = Charset.encode(text, charset)
```

`load` throws `UnsupportedError` for an unknown label. Pass `{ signal }` to stop waiting for the import, which rejects with `signal.reason`. `normalizeLabel(label)` returns the label's WHATWG name, such as `'Shift_JIS'`, or `undefined` if the label is unknown or its charset has no encoder, so it can also check a label before calling `load`. The name's type is `Charset.Name`, and each charset export is a `Charset.Charset` whose `name` is that name. Labels can be any WHATWG label or iconv-lite name for these charsets. Case, punctuation, surrounding ASCII whitespace and a trailing year (`ISO_8859-5:1988`) are ignored.

Bundlers split `load` into one chunk per family. With every family reachable, the entry chunk is 3.2 kB and each family loads on demand.

## Options

`encode(text, charset, options)` and `new EncoderStream(charset, options)` take the same options.

| Option | Default | Description |
| --- | --- | --- |
| `unmappable` | `'replace'` | What to write for a character the charset can't represent. `'replace'` writes `?`. `'html'` writes a numeric character reference such as `&#26085;`, as browsers do when submitting forms. `'error'` throws `UnsupportedError`. A function `(codePoint) => string` returns the text to write instead. |
| `bom` | `false` | Write a byte order mark first. Only UTF-8, UTF-16LE and UTF-16BE have one. |
| `signal` | none | `EncoderStream` only. Aborting errors the stream with `signal.reason` and cancels the source piped into it. |

`'?'` is the default because iconv-lite writes `?`, it keeps one character for one character, and it can't inject markup into a non-HTML output such as CSV or email. Use `'html'` for HTML forms and pages, and `'error'` when silent data loss is worse than failing.

Text input can be a string or a `Uint8Array` of UTF-8. Lone surrogates are encoded as U+FFFD, as `TextEncoder` does. `EncoderStream` takes string and `Uint8Array` chunks, and a character split across chunks is encoded once.

## Decoding

`TextDecoder` decodes every charset here. In browsers it follows the WHATWG standard exactly. Node's `TextDecoder` uses ICU, which differs from WHATWG for Big5, EUC-KR, ISO-2022-JP and Shift_JIS on rarely used code points, and some edge runtimes ship `TextDecoder` with UTF-8 and UTF-16 only. Check the runtime you deploy to if you decode legacy charsets there.

## Why use this over iconv-lite

iconv-lite looks charsets up by name in one registry, so a bundle includes every table. In this package, each charset family is its own entry point, decoding is left to `TextDecoder`, and the package has no dependencies.

- `encode` from the root is 1.0 kB gzipped, and one single-byte charset adds 0.6 kB. The gb18030 table is 17 kB gzipped, against 32 kB in iconv-lite.
- Encoding 230 kB of Japanese text to Shift_JIS was about 2× faster than iconv-lite, and 380 kB of Cyrillic text to windows-1251 ran at the same speed. UTF-8 is slightly slower than `TextEncoder`, so call `TextEncoder` when you only need UTF-8.
- The output follows the WHATWG tables, so browsers decode it back to the same text. iconv-lite writes U+FFFD as a byte that several single-byte charsets leave undefined, writes four-byte sequences in GBK that GBK decoders reject, and writes lone surrogates raw in UTF-16.
- `EncoderStream` encodes a surrogate pair split across chunks as one character (iconv-lite #282), and a prototype key such as `constructor` is not a charset label (iconv-lite #328).
- ISO-2022-JP can be encoded. iconv-lite doesn't support it.

<!-- bench:start -->
| | @portable/charset | iconv-lite | `TextEncoder` |
| --- | ---: | ---: | ---: |
| Encode 380 kB of Cyrillic text to windows-1251 | 725 | 736 | – |
| Encode 230 kB of Japanese text to Shift_JIS | 870 | 363 | – |
| Encode 610 kB of text to UTF-8 | 425 | 435 | 453 |

Operations per second from `pnpm bench`, higher is better, in Node 24.22.0, on Intel(R) Xeon(R) Processor @ 2.10GHz (4 cores). A dash means the library has no equivalent.

| | @portable/charset | iconv-lite | `TextEncoder` |
| --- | --- | --- | --- |
| Minified and gzipped | 13 kB | 153 kB | built in |
| Runtime dependencies | 0 | 1 | – |
| Node built-ins used | none | `buffer`, `stream`, `string_decoder` | none |
| TypeScript types | included | included | – |
| Version compared | – | 0.7.3 | – |

Sizes cover the imports in the usage example, or the equivalent imports of each library, bundled for the browser by `scripts/bundle-size.ts`. Runtime dependencies count every package installed with the published package. A library that uses Node built-ins needs polyfills in a browser and the `nodejs_compat` flag in Cloudflare Workers.
<!-- bench:end -->

## Migrating

| iconv-lite | @portable/charset |
| --- | --- |
| `iconv.encode(text, 'sjis')` | `Charset.encode(text, shiftJis)`, or `Charset.encode(text, await Charset.load('sjis'))` |
| `iconv.encode(text, 'utf-16', { addBOM: true })` | `Charset.encode(text, utf16le, { bom: true })` |
| `iconv.encodeStream('gbk')` | `new Charset.EncoderStream(gbk)` |
| `iconv.encodingExists(label)` | `Charset.normalizeLabel(label) !== undefined` |
| `iconv.decode(bytes, label)` | `new TextDecoder(label).decode(bytes)` |
| `iconv.decodeStream(label)` | `new TextDecoderStream(label)` |
| `iconv.defaultCharSingleByte = '#'` | `{ unmappable: () => '#' }` |

What changed:

- **Charsets are values, not strings.** `encode` takes a charset object, so a bundle only includes the families it imports. `load` covers labels known only at runtime.
- **Labels follow WHATWG.** `latin1`, `ascii` and `iso-8859-1` are windows-1252, and `gb2312` is GBK, as in browsers. `KOI8-U` is KOI8-RU, `x-mac-cyrillic` is the Ukrainian variant, and `macintosh` has € at 0xDB.
- **The `utf-16` label writes UTF-16LE without a byte order mark** unless you pass `bom: true`. iconv-lite writes one by default.
- **Lone surrogates become U+FFFD** in every charset. iconv-lite writes them unchanged in UTF-16 and as `?` elsewhere.
- **Characters a charset only decodes are not encoded.** HKSCS in Big5, JIS X 0212 in EUC-JP and the IBM duplicates in Shift_JIS's NEC rows decode with `TextDecoder` but are unmappable when encoding, as WHATWG specifies.
- **U+FFFD and the C1 controls follow the WHATWG tables.** iconv-lite writes U+FFFD as an undefined byte in several single-byte charsets, and `?` for the C1 controls that windows-125x maps.
- **No `base64`, `hex`, `binary` or `ucs2` codecs.** Use `Uint8Array.prototype.toBase64` and `toHex`, `TextEncoder`, and `utf16le`.
- **Not yet supported:** cp437, cp850 and the other DOS and IBM code pages, UTF-7, UTF-32 and CESU-8.
