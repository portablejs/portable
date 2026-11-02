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

`URL` converts hostnames to ASCII, but nothing in the platform converts them back to Unicode. `toUnicode` does. `toAscii` gives the same result as `URL` without parsing a URL.

## API

### `toUnicode(domain, options?)`

Decodes each `xn--` label and checks the result against UTS #46 with the URL Standard's settings (CheckBidi, CheckJoiners, and nontransitional processing). Unicode input is mapped and normalized too, so `toUnicode('BÜCHER.example')` returns `'bücher.example'`.

It throws `Idna.InvalidInputError` when the domain breaks a rule, such as an `xn--` label that isn't valid Punycode. Browsers show the ASCII form instead:

```ts
function displayHost(hostname: string): string {
  try {
    return Idna.toUnicode(hostname);
  } catch {
    return hostname;
  }
}
```

`toUnicode` is for display and checks less than `toAscii`: it returns an empty domain unchanged, and without `strict` it accepts characters such as a space or `/`. Use `toAscii` to validate a domain.

### `toAscii(domain, options?)`

Follows the URL Standard's domain parser: ASCII input is lowercased, and other input is mapped, normalized, validated, and encoded as `xn--` Punycode (UTS #46 ToASCII). It throws `Idna.InvalidInputError` when the domain breaks a rule, the result is empty, or the result contains a character URL forbids in a host, such as a space, `%`, `/`, or `@`.

The result equals `new URL('http://' + domain).hostname`, except that `toAscii` doesn't parse IPv4 addresses (`URL` turns `0x7f.1` into `127.0.0.1`) or decode percent-encoding, and that runtimes' `URL` doesn't always follow the standard (see [Where `URL` isn't exact](#where-url-isnt-exact)).

### Options

| Option | Default | Description |
| --- | --- | --- |
| `strict` | `false` | Apply the STD 3 hostname rules: only `a-z`, `0-9`, and `-` in a label, and no `-` at either end or in the third and fourth positions. `toAscii` also checks DNS lengths: labels of 1 to 63 characters and a name of at most 253, so a trailing dot throws. This is the URL Standard's `beStrict`. |

## Why use this over punycode and tr46

punycode only converts the Punycode in each label, without mapping or checking it: `punycode.toUnicode('xn--google-')` returns `google`, and `punycode.toASCII('ÜBER.COM')` returns `xn--BER-ska.COM`, which no browser produces. tr46 implements UTS #46 on top of punycode.

- All 6396 cases in Unicode's `IdnaTestV2.txt` 18.0.0 and WPT's URL tests for IDNA pass in Node and Chromium. The output matches tr46 7.0.0 on those cases and on 20,000 random domains.
- It is 16 kB minified and gzipped, against 64 kB for tr46 with punycode.
- `toUnicode` was 6.8× as fast as tr46 and `toAscii` 5.8× as fast, and both matched punycode, which does no mapping or validation. `new URL()` is about 1.2× faster than `toAscii` in Node.
- Both functions take O(n log n) time on long labels. punycode and tr46 take about 15 s to encode a 40,000-character label, as Python's idna did before CVE-2024-3651.
- Both functions throw on error. tr46's `toUnicode` returns `{ domain, error }`, so if you read only `domain`, you display `xn--google-` as `google`.
- tr46's `toASCII` returns `null` for an invalid domain, where `toAscii` throws `InvalidInputError`.
- Without `strict`, `toAscii` lowercases ASCII input without decoding it, as the URL Standard now specifies, so `toAscii('xn--b.com')` returns `'xn--b.com'` where tr46 returns `null`. `toUnicode` still throws for it.
- tr46's `toASCII` returns `'a b'` for `'a b'`, but `toAscii` throws for a space and the other characters that URL forbids in a host.
- tr46's `useSTD3ASCIIRules`, `checkHyphens`, and `verifyDNSLength` are one option here: `strict: true` turns on all three.
- tr46's `checkBidi` and `checkJoiners` have no equivalent, because both checks always run (URL Standard).
- tr46's `transitionalProcessing` isn't supported (UTS #46 deprecated it), so `faß.de` becomes `xn--fa-hia.de`, not `fass.de`.
- tr46's `ignoreInvalidPunycode` isn't supported, because the URL Standard doesn't use it.
- punycode's `encode` and `decode` have no equivalent. `Idna.toAscii(label)` and `Idna.toUnicode('xn--' + label)` convert and validate one label.
- punycode's `toASCII` converts the domain of an email address, but `toAscii` throws for `@`, so split the address at the last `@` and convert only the domain.

### Where `URL` isn't exact

Runtimes' `URL` doesn't fully follow the URL Standard. On `IdnaTestV2.txt`, leaving out IPv4 and URL delimiters:

- Node 24's `new URL()` and `url.domainToASCII` skip the bidi rule, so they accept `0à.א`. Their tables predate Unicode 18 and reject its new characters.
- Node's `url.domainToUnicode` returns the labels it could decode and leaves the others, instead of the whole input as the standard says.
- Chromium 141's `new URL()` gives a different result for 255 of 6253 cases. It skips the joiner rules, so it accepts U+200C ZERO WIDTH NON-JOINER between two Latin letters, and it rejects some valid domains.

`toAscii` and `toUnicode` use their own tables, so they give the same answer in every runtime.

<!-- bench:start -->
<table>
<thead><tr><th align="left">Library</th><th align="right">Ops/s</th><th align="left">Relative</th><th></th></tr></thead>
<tbody>
<tr><th colspan="4" align="left">Convert 10 hostnames to Unicode</th></tr>
<tr><td>@portable/idna</td><td align="right">87,400</td><td></td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="160" height="12" alt="" /></td></tr>
<tr><td><code>node:url</code></td><td align="right">79,000</td><td>1.1× slower</td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="145" height="12" alt="" /></td></tr>
<tr><td>punycode</td><td align="right">76,700</td><td>1.1× slower</td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="140" height="12" alt="" /></td></tr>
<tr><td>tr46</td><td align="right">12,900</td><td>6.8× slower</td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="24" height="12" alt="" /></td></tr>
<tr><th colspan="4" align="left">Convert 10 domains to ASCII</th></tr>
<tr><td><code>new URL()</code></td><td align="right">102,000</td><td>1.2× faster</td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="160" height="12" alt="" /></td></tr>
<tr><td>@portable/idna</td><td align="right">84,200</td><td></td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="132" height="12" alt="" /></td></tr>
<tr><td><code>node:url</code></td><td align="right">79,900</td><td>1.1× slower</td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="125" height="12" alt="" /></td></tr>
<tr><td>punycode</td><td align="right">79,200</td><td>1.1× slower</td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="124" height="12" alt="" /></td></tr>
<tr><td>tr46</td><td align="right">14,500</td><td>5.8× slower</td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="23" height="12" alt="" /></td></tr>
</tbody>
</table>

Operations per second from `pnpm bench`, higher is better, in Node 24.22.0, on Intel(R) Xeon(R) Processor @ 2.10GHz (4 cores). Each benchmark lists only the libraries that can do the same work, fastest first. The relative speed compares each library with @portable/idna, and the bars are scaled to the fastest library.

| Library | Version | Minified and gzipped | Runtime dependencies | Node built-ins | TypeScript types |
| --- | --- | ---: | ---: | --- | --- |
| @portable/idna | – | 16 kB | 1 | none | included |
| tr46 | 7.0.0 | 64 kB | 1 | none | @types/tr46 |
| punycode | 2.3.1 | 1.5 kB | 0 | none | @types/punycode |
| `node:url` | – | built in | – | Node only | – |
| `new URL()` | – | built in | – | none | – |

Sizes cover the imports in the usage example, or the equivalent imports of each library, bundled for the browser by `scripts/bundle-size.ts`. Runtime dependencies count every package installed with the published package. A library that uses Node built-ins needs polyfills in a browser and the `nodejs_compat` flag in Cloudflare Workers.
<!-- bench:end -->
