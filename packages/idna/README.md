# @portable/idna

Converts internationalized domain names between Unicode and the ASCII form that DNS and `URL` use, by [UTS #46](https://www.unicode.org/reports/tr46/). Runs in browsers, Cloudflare Workers, Node 24+, Bun, and Deno.

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

`URL` converts hostnames to ASCII, but the platform has no function that converts them back to Unicode. `toUnicode` is that function. Every runtime already applies UTS #46 in its URL host parser, so we use that parser instead of shipping our own Unicode tables. We add the bidi rule, which the parsers in Node and Cloudflare Workers skip.

## API

### `toUnicode(domain, options?)`

Converts the domain to ASCII with the runtime's URL host parser, which maps, normalizes, and validates it. It then decodes each `xn--` label. The parser doesn't validate an `xn--` label in ASCII input, so if the input has one, `toUnicode` converts the decoded domain to ASCII again. That makes the parser check the code points each label decodes to, and `toUnicode` throws if the result differs from the first conversion. It also applies the bidi rule of RFC 5893 (CheckBidi), because the parsers in Node and Cloudflare Workers skip it. Unicode input is mapped and normalized too, so `toUnicode('BÜCHER.example')` returns `'bücher.example'`.

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

Follows the URL Standard's domain parser. It lowercases ASCII input and passes other input to the runtime's URL host parser, with the same checks as `toUnicode`. It throws `Idna.InvalidInputError` when the domain breaks a rule, when the result is empty, or when the domain contains a character that URL forbids in a host or treats as a delimiter, such as a space, `%`, `/`, `?`, or `@`.

The result equals `new URL('http://' + domain).hostname`, except that `toAscii` applies the bidi rule and doesn't parse IPv4 addresses or percent-encoding. It throws for Unicode input that `URL` reads as an IPv4 address, such as `１２７.０.０.１`, and lowercases ASCII input such as `0x7f.1` without converting it to `127.0.0.1`.

### Options

| Option | Default | Description |
| --- | --- | --- |
| `strict` | `false` | Apply the STD 3 hostname rules: only `a-z`, `0-9`, and `-` in a label, and no `-` at either end of a label or in its third and fourth positions. In `toAscii` it also checks DNS lengths: every label is 1 to 63 characters and the name at most 253, so a trailing dot throws. This is the URL Standard's `beStrict`, and what Unicode's conformance tests use. |

### Where runtimes differ

Because `toUnicode` and `toAscii` use the runtime's parser, they reject whatever that parser rejects. On Unicode's `IdnaTestV2.txt` 18.0.0, they accept no invalid domain in Node 24, Bun, Chromium, or Cloudflare Workers, and every result they return is the one the file expects. They reject some valid domains, none of which a registry would accept:

- Node 24, Bun, and Chromium have Unicode tables older than Unicode 18, so they reject the 9 cases with a character added since. Browsers show the ASCII form of such a domain, and so does the `displayHost` example above.
- Chromium rejects 42 cases that write `≮` or `≯` as `<` or `>` followed by U+0338 COMBINING LONG SOLIDUS OVERLAY, which UTS #46 normalizes to `≮` and `≯`.
- They reject a domain with a URL delimiter, such as `?` or `#` (44 cases), and Unicode input that `URL` reads as an IPv4 address (1 case). UTS #46 allows these, but no hostname can contain them.

## Why use this over punycode and tr46

punycode only converts the Punycode encoding of each label. It doesn't map uppercase or compatibility characters and doesn't check the result, so `punycode.toUnicode('xn--google-')` returns `google`, and `punycode.toASCII('ÜBER.COM')` returns `xn--BER-ska.COM`, which no browser produces. tr46 implements UTS #46 with its own tables and depends on punycode.

- It is 3.3 kB minified and gzipped with both functions, against 64 kB for tr46 with punycode. The bidi rule's data is about 1 kB of that. `scripts/generate.ts` generates it from the Unicode data files.
- Its results equal tr46 7.0.0's on `IdnaTestV2.txt`, WPT's URL tests for IDNA, and 20,000 random domains, except for the domains the runtime's parser rejects.
- `toUnicode` on 10 hostnames was about 3× as fast as tr46, and less than half as fast as punycode, which does no mapping or validation. `toAscii` was about 2× as fast as tr46.
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

<!-- bench:start -->
<table>
<thead><tr><th align="left">Library</th><th align="right">Ops/s</th><th align="left">Relative</th><th></th></tr></thead>
<tbody>
<tr><th colspan="4" align="left">Convert 10 hostnames to Unicode</th></tr>
<tr><td><code>node:url</code></td><td align="right">123,000</td><td>2.4× faster</td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="160" height="12" alt="" /></td></tr>
<tr><td>punycode</td><td align="right">120,000</td><td>2.3× faster</td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="156" height="12" alt="" /></td></tr>
<tr><td>@portable/idna</td><td align="right">51,500</td><td></td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="67" height="12" alt="" /></td></tr>
<tr><td>tr46</td><td align="right">17,900</td><td>2.9× slower</td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="23" height="12" alt="" /></td></tr>
<tr><th colspan="4" align="left">Convert 10 domains to ASCII</th></tr>
<tr><td><code>new URL()</code></td><td align="right">157,000</td><td>3.7× faster</td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="160" height="12" alt="" /></td></tr>
<tr><td><code>node:url</code></td><td align="right">125,000</td><td>2.9× faster</td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="127" height="12" alt="" /></td></tr>
<tr><td>punycode</td><td align="right">116,000</td><td>2.7× faster</td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="118" height="12" alt="" /></td></tr>
<tr><td>@portable/idna</td><td align="right">42,700</td><td></td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="44" height="12" alt="" /></td></tr>
<tr><td>tr46</td><td align="right">21,500</td><td>2.0× slower</td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="22" height="12" alt="" /></td></tr>
</tbody>
</table>

Operations per second from `pnpm bench`, higher is better, in Node 24.22.2, on Intel(R) Xeon(R) Processor (4 cores). Each benchmark lists only the libraries that can do the same work, fastest first. The relative speed compares each library with @portable/idna, and the bars are scaled to the fastest library.

| Library | Version | Minified and gzipped | Runtime dependencies | Node built-ins | TypeScript types |
| --- | --- | ---: | ---: | --- | --- |
| @portable/idna | – | 3.3 kB | 1 | none | included |
| tr46 | 7.0.0 | 64 kB | 1 | none | @types/tr46 |
| punycode | 2.3.1 | 1.5 kB | 0 | none | @types/punycode |
| `node:url` | – | built in | – | Node only | – |
| `new URL()` | – | built in | – | none | – |

Sizes cover the imports in the usage example, or the equivalent imports of each library, bundled for the browser by `scripts/bundle-size.ts`. Runtime dependencies count every package installed with the published package. A library that uses Node built-ins needs polyfills in a browser and the `nodejs_compat` flag in Cloudflare Workers.
<!-- bench:end -->
