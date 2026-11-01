# @portable/idna

Converts internationalized domain names between Unicode and the ASCII form that DNS and `URL` use, by [UTS #46](https://www.unicode.org/reports/tr46/) with Unicode 18.0.0 tables. Runs in browsers, Cloudflare Workers, Node 24+, Bun, and Deno.

Replaces [punycode](https://www.npmjs.com/package/punycode), the deprecated `node:punycode`, and [tr46](https://www.npmjs.com/package/tr46).

```sh
npm install @portable/idna
```

```ts
import * as Idna from '@portable/idna';

const { hostname } = new URL('https://bücher.example/');
hostname; // 'xn--bcher-kva.example'
Idna.toUnicode(hostname); // 'bücher.example'

Idna.toAscii('Bücher.example'); // 'xn--bcher-kva.example'
```

`URL` converts hostnames to ASCII, but the platform has no function that converts them back to Unicode. `toUnicode` is that function. `toAscii` gives the same result as `URL` without parsing a URL, and in every runtime.

## API

### `toUnicode(domain, options?)`

Decodes each `xn--` label and checks the result against UTS #46 with the URL Standard's settings: the bidi rule (CheckBidi), the joiner rules (CheckJoiners) and nontransitional processing. Unicode input is mapped and normalized too, so `toUnicode('BÜCHER.example')` returns `'bücher.example'`.

It throws `Idna.InvalidInputError` when the domain breaks a rule, such as an `xn--` label that isn't valid Punycode or that decodes to a character IDNA doesn't allow. UTS #46 leaves it to you to decide what to show instead. Browsers show the ASCII form:

```ts
function displayHost(hostname: string): string {
  try {
    return Idna.toUnicode(hostname);
  } catch {
    return hostname;
  }
}
```

### `toAscii(domain, options?)`

Follows the URL Standard's domain parser: ASCII input is lowercased, and other input goes through UTS #46 ToASCII, which maps, normalizes, validates, and encodes each non-ASCII label as `xn--` Punycode. It throws `Idna.InvalidInputError` when the domain breaks a rule, when the result is empty, or when the result contains a character that URL forbids in a host, such as a space, `%`, `/`, or `@`.

The result equals `new URL('http://' + domain).hostname` with three exceptions. `URL` parses a host that ends in a number as an IPv4 address (`0x7f.1` becomes `127.0.0.1`), and decodes percent-encoding. Neither is IDNA, and `toAscii` does neither. The third is that runtimes don't agree with each other or with the standard, as [Where `URL` isn't exact](#where-url-isnt-exact) shows.

### Options

| Option | Default | Description |
| --- | --- | --- |
| `strict` | `false` | Apply the STD 3 hostname rules: only `a-z`, `0-9`, and `-` in a label, and no `-` at either end of a label or in its third and fourth positions. In `toAscii` it also checks DNS lengths: every label is 1 to 63 characters and the name at most 253, so a trailing dot throws. This is the URL Standard's `beStrict`, and what Unicode's conformance tests use. |

### Smaller bundles with `@portable/idna/url`

Every runtime already applies UTS #46 in its URL host parser. `@portable/idna/url` has the same `toUnicode`, `toAscii`, `InvalidInputError`, and `strict` option, but it relies on that parser in place of the Unicode tables, so it is 3.3 kB minified and gzipped instead of 16 kB:

```ts
import * as Idna from '@portable/idna/url';

Idna.toUnicode('xn--bcher-kva.example'); // 'bücher.example'
```

`toUnicode` converts the domain to ASCII with `new URL()`, which maps, normalizes, and validates it with the runtime's tables. It decodes each `xn--` label and converts the decoded domain to ASCII again. The second conversion makes the parser check the code points each label decodes to, and `toUnicode` throws if the ASCII differs from the first conversion's. It applies the bidi rule itself, because the parsers in Node and Cloudflare Workers skip it. The bidi classes add about 1 kB. `toAscii` works the same way and returns the ASCII. Like the main entry point, it lowercases ASCII input without validating it unless you pass `strict: true`.

On `IdnaTestV2.txt`, it accepts no invalid domain in Node 24, Bun, Chromium, or Cloudflare Workers. Every result it returns equals the main entry point's, but it rejects some valid domains:

- If the runtime's tables are older than Unicode 18, it rejects a domain with a character added since. That's 9 cases in each of those runtimes. Browsers show the ASCII form of such a domain, and so does the `displayHost` example above.
- If the runtime's parser rejects a domain that UTS #46 allows, so does `@portable/idna/url`. Chromium rejects 42 cases that write `≮` or `≯` as `<` or `>` followed by U+0338 COMBINING LONG SOLIDUS OVERLAY, which UTS #46 normalizes to `≮` and `≯`.
- It rejects a domain with a URL delimiter, such as `?` or `#` (44 cases), and Unicode input that `URL` reads as an IPv4 address, such as `１２７.０.０.１` (1 case).

`toUnicode` and `toAscii` in `@portable/idna/url` take 2 to 3 times as long as the main entry point's, because they parse a domain with `xn--` labels twice.

## Why use this over punycode and tr46

punycode only converts the Punycode encoding of each label. It doesn't map uppercase or compatibility characters and doesn't check the result, so `punycode.toUnicode('xn--google-')` returns `google`, and `punycode.toASCII('ÜBER.COM')` returns `xn--BER-ska.COM`, which no browser produces. tr46 implements UTS #46 and depends on punycode.

- All 6396 cases in Unicode's `IdnaTestV2.txt` 18.0.0 pass in Node and Chromium, and so do WPT's URL tests for IDNA. The output equals tr46 7.0.0's on those cases and 20,000 random domains.
- It is 16 kB minified and gzipped with both functions, against 64 kB for tr46 with punycode. The tables are generated from the Unicode data files by `scripts/generate.ts`.
- `toUnicode` on 10 hostnames was 6.8× as fast as tr46 and as fast as punycode, which does no mapping or validation. `toAscii` was 5.8× as fast as tr46 and as fast as punycode. `new URL()` is about 1.2× faster than `toAscii` in Node, where it runs in C++.
- `toAscii` and `toUnicode` take O(n log n) time on long labels. punycode and tr46 take about 15 s to encode a 40,000-character label, as Python's idna did before CVE-2024-3651.
- Both functions throw errors instead of returning them. tr46's `toUnicode` returns `{ domain, error }`, so if you read only `domain`, you display `xn--google-` as `google`.
- tr46's `toASCII` returns `null` for an invalid domain, where `toAscii` throws `InvalidInputError`.
- Without `strict`, `toAscii` lowercases ASCII input without decoding it, as the URL Standard now specifies, so `toAscii('xn--b.com')` returns `'xn--b.com'` where tr46 returns `null`. `toUnicode` still throws for it.
- tr46's `toASCII` returns `'a b'` for `'a b'`, but `toAscii` throws for a space and the other characters that URL forbids in a host.
- tr46's `useSTD3ASCIIRules`, `checkHyphens`, and `verifyDNSLength` are one option here: `strict: true` turns on all three.
- tr46's `checkBidi` and `checkJoiners` have no equivalent, because both checks always run, as in the URL Standard.
- tr46's `transitionalProcessing` isn't supported, because UTS #46 deprecated it and browsers dropped it, so `faß.de` becomes `xn--fa-hia.de`, not `fass.de`.
- tr46's `ignoreInvalidPunycode` isn't supported, because the URL Standard doesn't use it.
- punycode's `encode` and `decode` have no equivalent, because raw Punycode isn't exported. `Idna.toAscii(label)` and `Idna.toUnicode('xn--' + label)` convert one label and also validate it.
- punycode's `toASCII` converts the domain of an email address and leaves the local part as it is, but `toAscii` throws for `@`. Split the address at the last `@` and convert only the domain.

### Where `URL` isn't exact

The URL Standard runs UTS #46 for hosts, but implementations lag behind it. On `IdnaTestV2.txt`, leaving out IPv4 and URL delimiters:

- Node 24's `new URL()` and `url.domainToASCII` skip the bidi rule, so they accept `0à.א`. Their tables predate Unicode 18 and reject its new characters.
- Node's `url.domainToUnicode` returns the labels it could decode and leaves the others, instead of the whole input as the standard says.
- Chromium 141's `new URL()` gives a different result for 255 of 6253 cases. It skips the joiner rules, so it accepts U+200C ZERO WIDTH NON-JOINER between two Latin letters, and it rejects some valid domains.

`toAscii` and `toUnicode` use their own tables, so they give one answer everywhere.

<!-- bench:start -->
<table>
<thead><tr><th align="left">Library</th><th align="right">Ops/s</th><th align="left">Relative</th><th></th></tr></thead>
<tbody>
<tr><th colspan="4" align="left">Convert 10 hostnames to Unicode</th></tr>
<tr><td>@portable/idna</td><td align="right">132,000</td><td></td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="160" height="12" alt="" /></td></tr>
<tr><td><code>node:url</code></td><td align="right">124,000</td><td>1.1× slower</td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="150" height="12" alt="" /></td></tr>
<tr><td>punycode</td><td align="right">117,000</td><td>1.1× slower</td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="143" height="12" alt="" /></td></tr>
<tr><td>@portable/idna/url</td><td align="right">54,000</td><td>2.4× slower</td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="66" height="12" alt="" /></td></tr>
<tr><td>tr46</td><td align="right">19,100</td><td>6.9× slower</td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="23" height="12" alt="" /></td></tr>
<tr><th colspan="4" align="left">Convert 10 domains to ASCII</th></tr>
<tr><td><code>new URL()</code></td><td align="right">159,000</td><td>1.2× faster</td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="160" height="12" alt="" /></td></tr>
<tr><td>@portable/idna</td><td align="right">128,000</td><td></td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="129" height="12" alt="" /></td></tr>
<tr><td><code>node:url</code></td><td align="right">125,000</td><td>same</td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="126" height="12" alt="" /></td></tr>
<tr><td>punycode</td><td align="right">122,000</td><td>1.1× slower</td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="122" height="12" alt="" /></td></tr>
<tr><td>@portable/idna/url</td><td align="right">44,300</td><td>2.9× slower</td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="45" height="12" alt="" /></td></tr>
<tr><td>tr46</td><td align="right">21,500</td><td>5.9× slower</td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="22" height="12" alt="" /></td></tr>
</tbody>
</table>

Operations per second from `pnpm bench`, higher is better, in Node 24.22.2, on Intel(R) Xeon(R) Processor (4 cores). Each benchmark lists only the libraries that can do the same work, fastest first. The relative speed compares each library with @portable/idna, and the bars are scaled to the fastest library.

| Library | Version | Minified and gzipped | Runtime dependencies | Node built-ins | TypeScript types |
| --- | --- | ---: | ---: | --- | --- |
| @portable/idna | – | 16 kB | 1 | none | included |
| @portable/idna/url | – | 3.3 kB | 1 | none | included |
| tr46 | 7.0.0 | 64 kB | 1 | none | @types/tr46 |
| punycode | 2.3.1 | 1.5 kB | 0 | none | @types/punycode |
| `node:url` | – | built in | – | Node only | – |
| `new URL()` | – | built in | – | none | – |

Sizes cover the imports in the usage example, or the equivalent imports of each library, bundled for the browser by `scripts/bundle-size.ts`. Runtime dependencies count every package installed with the published package. A library that uses Node built-ins needs polyfills in a browser and the `nodejs_compat` flag in Cloudflare Workers.
<!-- bench:end -->
