# @portable/idna

Converts internationalized domain names between Unicode and the ASCII form that DNS and `URL` use, by [UTS #46](https://www.unicode.org/reports/tr46/) with Unicode 18.0.0 tables. Runs in browsers, Cloudflare Workers, Deno, Bun and Node 24+.

Replaces [punycode](https://www.npmjs.com/package/punycode), the deprecated `node:punycode`, and [tr46](https://www.npmjs.com/package/tr46).

```sh
npm install @portable/idna
```

```ts
import * as Idna from '@portable/idna'

const { hostname } = new URL('https://bücher.example/')
hostname // 'xn--bcher-kva.example'
Idna.toUnicode(hostname) // 'bücher.example'

Idna.toAscii('Bücher.example') // 'xn--bcher-kva.example'
```

`URL` converts hostnames to ASCII, but the platform has no function that converts them back to Unicode. `toUnicode` is that function. `toAscii` gives the same result as `URL` without parsing a URL, and in every runtime.

## API

### `toUnicode(domain, options?)`

Decodes each `xn--` label and checks the result against UTS #46 with the URL Standard's settings: the bidi rule (CheckBidi), the joiner rules (CheckJoiners) and nontransitional processing. Unicode input is mapped and normalized too, so `toUnicode('BÜCHER.example')` returns `'bücher.example'`.

It throws `Idna.InvalidInputError` when the domain breaks a rule, such as an `xn--` label that isn't valid Punycode or that decodes to a character IDNA doesn't allow. UTS #46 lets the caller decide what to show instead. Browsers show the ASCII form:

```ts
function displayHost(hostname: string): string {
  try {
    return Idna.toUnicode(hostname)
  } catch {
    return hostname
  }
}
```

### `toAscii(domain, options?)`

Follows the URL Standard's domain parser: ASCII input is lowercased, and other input goes through UTS #46 ToASCII, which maps, normalizes, validates and encodes each non-ASCII label as `xn--` Punycode. It throws `Idna.InvalidInputError` when the domain breaks a rule, when the result is empty, or when the result contains a character that URL forbids in a host, such as a space, `%`, `/` or `@`.

The result equals `new URL('http://' + domain).hostname` with three exceptions. `URL` parses a host that ends in a number as an IPv4 address (`0x7f.1` becomes `127.0.0.1`), and decodes percent-encoding. Neither is IDNA, and `toAscii` does neither. The third is that runtimes don't agree with each other or with the standard, as the next section shows.

### Options

| Option | Default | Description |
| --- | --- | --- |
| `strict` | `false` | Apply the STD 3 hostname rules: only `a-z`, `0-9` and `-` in a label, and no `-` at either end of a label or in its third and fourth positions. In `toAscii` it also checks DNS lengths: every label is 1 to 63 characters and the name at most 253, so a trailing dot throws. This is the URL Standard's `beStrict`, and what Unicode's conformance tests use. |

## Why use this over punycode and tr46

punycode only converts the Punycode encoding of each label. It doesn't map uppercase or compatibility characters and doesn't check the result, so `punycode.toUnicode('xn--google-')` returns `google`, and `punycode.toASCII('ÜBER.COM')` returns `xn--BER-ska.COM`, which no browser produces. tr46 implements UTS #46, but needs punycode, which prints a deprecation warning on Node 21 and later.

- All 6396 cases in Unicode's `IdnaTestV2.txt` 18.0.0 pass in Node and Chromium, and so do WPT's URL tests for IDNA. The output equals tr46 7.0.0's on those cases and 20,000 random domains.
- It is 15 kB minified and gzipped with both functions, against 63 kB for tr46 with punycode. The tables are generated from the Unicode data files by `scripts/generate.ts`.
- `toUnicode` on 10 hostnames was 6.6× as fast as tr46 and as fast as punycode, which does no mapping or validation. `toAscii` was 5.9× as fast as tr46 and as fast as punycode. `new URL()` is about 1.4× faster than `toAscii` in Node, where it runs in C++.
- `toAscii` and `toUnicode` take O(n log n) time on long labels. punycode and tr46 take about 15 s to encode a 40,000-character label, as Python's idna did before CVE-2024-3651.
- Both functions throw errors instead of returning them. tr46's `toUnicode` returns `{ domain, error }`, and code that reads only `domain` displays `xn--google-` as `google`.

### Where `URL` isn't exact

The URL Standard runs UTS #46 for hosts, but implementations lag behind it. On `IdnaTestV2.txt`, leaving out IPv4 and URL delimiters:

- Node 24's `new URL()` and `url.domainToASCII` skip the bidi rule, so they accept `0à.א`. Their tables predate Unicode 18 and reject its new characters.
- Node's `url.domainToUnicode` returns the labels it could decode and leaves the others, instead of the whole input as the standard says.
- Chromium 141's `new URL()` gives a different result for 255 of 6253 cases. It skips the joiner rules, so it accepts U+200C ZERO WIDTH NON-JOINER between two Latin letters, and it rejects some valid domains.

`toAscii` and `toUnicode` use their own tables, so they give one answer everywhere.

<!-- bench:start -->
| | @portable/idna | tr46 | punycode | `node:url` | `new URL()` |
| --- | ---: | ---: | ---: | ---: | ---: |
| Convert 10 hostnames to Unicode | 87,400 | 12,900 | 76,700 | 79,000 | – |
| Convert 10 domains to ASCII | 84,200 | 14,500 | 79,200 | 79,900 | 102,000 |

Operations per second from `pnpm bench`, higher is better, in Node 24.22.0, on Intel(R) Xeon(R) Processor @ 2.10GHz (4 cores). A dash means the library has no equivalent.

| | @portable/idna | tr46 | punycode | `node:url` | `new URL()` |
| --- | --- | --- | --- | --- | --- |
| Minified and gzipped | 16 kB | 64 kB | 1.5 kB | built in | built in |
| Runtime dependencies | 0 | 1 | 0 | – | – |
| Node built-ins used | none | none | none | Node only | none |
| TypeScript types | included | `@types/tr46` | `@types/punycode` | – | – |
| Version compared | – | 7.0.0 | 2.3.1 | – | – |

Sizes cover the imports in the usage example, or the equivalent imports of each library, bundled for the browser by `scripts/bundle-size.ts`. Runtime dependencies count every package installed with the published package. A library that uses Node built-ins needs polyfills in a browser and the `nodejs_compat` flag in Cloudflare Workers.
<!-- bench:end -->

## Migrating

| punycode / tr46 | @portable/idna |
| --- | --- |
| `punycode.toUnicode(domain)` | `Idna.toUnicode(domain)` |
| `punycode.toASCII(domain)` | `Idna.toAscii(domain)` |
| `punycode.toASCII(email)` | `local + '@' + Idna.toAscii(domain)`, after splitting at the last `@` |
| `punycode.encode(label)`, `punycode.decode(label)` | `Idna.toAscii(label)` and `Idna.toUnicode('xn--' + label)`, which also validate. Raw Punycode isn't exported. |
| `punycode.ucs2.decode(text)` | `Array.from(text, (char) => char.codePointAt(0))` |
| `punycode.ucs2.encode(codePoints)` | `String.fromCodePoint(...codePoints)` |
| `tr46.toUnicode(domain, options).domain` | `Idna.toUnicode(domain)`, which throws where tr46 sets `error` |
| `tr46.toASCII(domain, options)` | `Idna.toAscii(domain)`, which throws where tr46 returns `null` |
| `useSTD3ASCIIRules`, `checkHyphens`, `verifyDNSLength` | `strict: true` turns on all three |
| `checkBidi`, `checkJoiners` | Always on, as in the URL Standard |
| `transitionalProcessing` | Not supported. UTS #46 deprecated it, and browsers dropped it. `faß.de` becomes `xn--fa-hia.de`, not `fass.de`. |
| `ignoreInvalidPunycode` | Not supported. The URL Standard doesn't use it. |

Differences from tr46 with the URL Standard's flags:

- ASCII input to `toAscii` is lowercased without decoding, as the URL Standard now specifies, so `toAscii('xn--b.com')` returns `'xn--b.com'` where tr46 returns `null`. `toUnicode` still throws for it.
- `toAscii` throws for an empty result and for characters URL forbids in a host. tr46 returns `'a b'` for `'a b'`.
