# Test parity

Upstream suites:

- [punycode.js 2.3.1 `tests/tests.js`](https://github.com/mathiasbynens/punycode.js/blob/main/tests/tests.js). The test cases in `punycode.conformance.ts` are copied from it (MIT, Mathias Bynens).
- [tr46 7.0.0 `test/`](https://github.com/jsdom/tr46/tree/main/test): `std3ASCIIRules.js`, `toascii.js`, `unicode.js` and `url-host-parsing.js`.
- Unicode's [`IdnaTestV2.txt`](https://www.unicode.org/Public/18.0.0/idna/IdnaTestV2.txt), version 18.0.0, dated 2026-02-04. It is copied unchanged into `fixtures/` under the [Unicode License](https://www.unicode.org/license.txt).
- WPT's [`url/resources/toascii.json` and `IdnaTestV2.json`](https://github.com/web-platform-tests/wpt/tree/master/url/resources), which tr46 runs. They are copied unchanged into `fixtures/` (BSD 3-Clause, web-platform-tests contributors). `IdnaTestV2.json` is generated from an `IdnaTestV2.txt` before 18.0.0 and still passes.

`node:punycode` is the same code as punycode.js 2.1.0, so the punycode.js rows cover it.

Our `strict` option sets CheckHyphens, UseSTD3ASCIIRules and VerifyDnsLength, as the URL Standard's `beStrict` does. tr46 has a separate flag for each, and its tests set them in combinations our API can't express. Those rows say which of our modes covers the case.

## Unicode IdnaTestV2.txt

| Upstream column | Covered by | Notes |
| --- | --- | --- |
| toUnicode and toUnicodeStatus | `IdnaTestV2.txt > toUnicode with strict: true matches toUnicode` | All 6396 lines. `X4_2` is ignored, as the file's header allows. |
| toUnicode with the strict-only status codes removed | `IdnaTestV2.txt > toUnicode matches toUnicode, ignoring the errors that only strict checks` | The header lets an implementation that turns CheckHyphens, UseSTD3ASCIIRules or VerifyDnsLength off ignore `V2`, `V3`, `U1` and `A4_*`. |
| toAsciiN and toAsciiNStatus | `IdnaTestV2.txt > toAscii with strict: true matches toAsciiN` | All 6396 lines. |
| toAsciiT and toAsciiTStatus | skipped | Transitional processing is deprecated by UTS #46 and the URL Standard doesn't use it. See the README. |

## tr46

| Upstream test | Covered by | Notes |
| --- | --- | --- |
| `unicode.js` IdnaTestV2.txt, toASCII nontransitional | `IdnaTestV2.txt > toAscii with strict: true matches toAsciiN` | tr46 allows itself to fail where the file expects success. `toAscii` matches every line exactly. |
| `unicode.js` IdnaTestV2.txt, toASCII transitional | skipped | Transitional processing isn't supported. |
| `unicode.js` IdnaTestV2.txt, toUnicode | `IdnaTestV2.txt > toUnicode with strict: true matches toUnicode` | |
| `std3ASCIIRules.js` STD3 range (a-z, 0-9) | `tr46: ToASCII with useSTD3ASCIIRules > keeps a-z and 0-9` | |
| `std3ASCIIRules.js` STD3 range (`-`) | `tr46: ToASCII with useSTD3ASCIIRules > rejects "-" alone, because strict also checks hyphens` | tr46's test turns UseSTD3ASCIIRules on and CheckHyphens off, so `-` passes there. |
| `std3ASCIIRules.js` Outside of STD3 range | `tr46: ToASCII with useSTD3ASCIIRules > rejects every other ASCII character except A-Z` | |
| `std3ASCIIRules.js` Unicode, Valid label, Valid unicode label | `tr46: ToASCII with useSTD3ASCIIRules > encodes a Unicode label` | |
| `std3ASCIIRules.js` Invalid label, Invalid unicode label | `tr46: ToASCII with useSTD3ASCIIRules > rejects labels with a disallowed character` | |
| `toascii.js` ToASCII (WPT `toascii.json`) | `tr46: WPT URL tests > toascii.json` | tr46 skips ASCII input and the `urlStandardOnly` cases. This package runs all 87, because `toAscii` follows the URL Standard. |
| `toascii.js` ToASCII via IdnaTestV2.json in wpt | `tr46: WPT URL tests > IdnaTestV2.json` | tr46 skips ASCII input and input with `?`. This package runs all 2676. The empty input expects `""`, but `toAscii` throws, because the URL Standard's domain parser fails on an empty result. WPT never passes an empty host to it. |
| `url-host-parsing.js` WPT host parsing, toASCII | `tr46: WPT host parsing of ASCII characters > toAscii lowercases each character URL allows and rejects the others` | Different on purpose: the URL Standard's forbidden domain code points, such as space and `%`, throw. |
| `url-host-parsing.js` WPT host parsing, toUnicode | `tr46: WPT host parsing of ASCII characters > toUnicode lowercases each character` | |

## punycode.js

| Upstream test | Covered by | Notes |
| --- | --- | --- |
| `punycode.ucs2.decode` (7 cases) | skipped | `Array.from(text, (char) => char.codePointAt(0))` does this, so the package doesn't export it. |
| `punycode.ucs2.encode` (7 cases), does not mutate argument array | skipped | `String.fromCodePoint(...codePoints)` does this. |
| `punycode.decode` throws RangeError: Illegal input >= 0x80 | `punycode.js: decode > rejects a non-basic code point before the delimiter` | `decode` is internal, and the tests import it by path. |
| `punycode.decode` throws RangeError: Overflow | `punycode.js: decode > rejects a non-basic code point after the delimiter` | The upstream name is wrong: `\x81` is rejected as an invalid digit. `rejects a delta that overflows` covers overflow. |
| `punycode.decode` (24 strings) | `punycode.js: decode > <description>` | One test per string. Russian is decoded without mixed-case annotation, as upstream. |
| `punycode.decode` handles uppercase Z | `punycode.js: decode > handles uppercase Z` | |
| `punycode.decode` throws RangeError: Invalid input | `punycode.js: decode > rejects a character that is not a base-36 digit` | |
| `punycode.encode` (24 strings) | `punycode.js: encode > <description>` | |
| `punycode.toUnicode` (domains) | `punycode.js: toUnicode > <description>` | |
| `punycode.toUnicode` Non-printable ASCII, U+007F | `punycode.js: toUnicode > leaves non-printable ASCII alone` | |
| `punycode.toUnicode` Email address | `punycode.js: toUnicode > decodes only the domain of an email address` | Different on purpose: pass the domain only. `@` is a valid character in UTS #46 without STD3 rules, so the local part is not split off. |
| `punycode.toUnicode` does not convert names that don't start with `xn--` | `punycode.js: toUnicode > does not decode names that do not start with xn--, but lowercases them` | Different on purpose: UTS #46 maps uppercase to lowercase. |
| `punycode.toASCII` (domains) | `punycode.js: toASCII > <description>` | |
| `punycode.toASCII` Non-printable ASCII, U+007F, Email address | `punycode.js: toASCII > rejects characters that URL forbids in a host` | Different on purpose: these throw, as in `new URL()`. `encodes only the domain of an email address` covers the domain half. |
| `punycode.toASCII` does not convert domain names that are already in ASCII | `punycode.js: toASCII > does not convert names that are already ASCII, but lowercases them`, `rejects ASCII names with characters that URL forbids in a host` | Different on purpose: the two names with a space, `$`, `<` or `>` throw, as in `new URL()`. |
| `punycode.toASCII` supports IDNA2003 separators | `punycode.js: toASCII > supports <separator> as a separator` | |
| No upstream test | `idna.oracle.test.ts > matches punycode.js 2.3.1` | Compares three 3000-character random labels in both directions, because our encoder and decoder use a different algorithm. |

## Known upstream issues

| Issue | Test |
| --- | --- |
| punycode.js decodes `xn--google-` to `google`, so a Punycode label can display as a different ASCII name. tr46 returns `google` with `error: true`, which callers who read only `domain` miss. | `known upstream issues > a Punycode label that decodes to ASCII is rejected, so xn--google- never displays as google` |
| punycode.js decodes `xn--a` to U+0080, a control character. | `known upstream issues > a Punycode label that decodes to a control character is rejected` |
| punycode.js [#105](https://github.com/mathiasbynens/punycode.js/issues/105): `toUnicode('XN--BER-SKA.COM')` is returned unchanged, and `toASCII('ÜBER.COM')` keeps the uppercase. | `uppercase XN-- labels are decoded`, `a Punycode label that encodes an uppercase letter is rejected`, `uppercase input is lowercased before encoding, as browsers do` |
| punycode.js [#145](https://github.com/mathiasbynens/punycode.js/issues/145) and tr46 [#35](https://github.com/jsdom/tr46/issues/35): an emoji with U+FE0F VARIATION SELECTOR-16 encodes differently from the same emoji without it. UTS #46 ignores U+FE0F. | `known upstream issues > a variation selector is ignored` |
| punycode.js [#114](https://github.com/mathiasbynens/punycode.js/issues/114): emoji joined by U+200D ZERO WIDTH JOINER are encoded although IDNA allows the joiner only after a virama. | `known upstream issues > a zero width joiner outside a virama context is rejected` |
| punycode.js [#110](https://github.com/mathiasbynens/punycode.js/issues/110): `toASCII('https://sample.com')` returns `xn--https://…`. | `known upstream issues > a whole URL is rejected instead of being encoded as one label` |
| punycode.js [#117](https://github.com/mathiasbynens/punycode.js/issues/117) and [#129](https://github.com/mathiasbynens/punycode.js/issues/129): `encode` treats a dot as part of the label, and `decode('ls8h=')` once returned a value. | `a dot inside the input separates labels`, `punycode.js: decode > rejects a character that is not a base-36 digit` |
| tr46 [#64](https://github.com/jsdom/tr46/issues/64): `toASCII('www.xn--b.com')` returns `null`. The URL Standard now lowercases ASCII input without decoding it, so `toAscii` returns it, and `toUnicode` throws. | `toAscii > lowercases ASCII input without validating it, as URL does`, `toUnicode > rejects invalid Punycode` |
| tr46 [#69](https://github.com/jsdom/tr46/issues/69): `useSTD3ASCIIRules` did nothing in 5.1.0. | `tr46: ToASCII with useSTD3ASCIIRules > rejects every other ASCII character except A-Z`, `applies the rule to ASCII that a mapping produces` |
| tr46 [#41](https://github.com/jsdom/tr46/issues/41) and many duplicates, punycode.js [#132](https://github.com/mathiasbynens/punycode.js/issues/132): `node:punycode` prints a deprecation warning (DEP0040) on Node 21 and later. | None needed: the package doesn't depend on punycode. |
| tr46 [#28](https://github.com/jsdom/tr46/issues/28) and [#68](https://github.com/jsdom/tr46/issues/68): the 260 kB `mappingTable.json` broke bundlers. | None needed: the tables are a TypeScript module of base64url strings, 26 kB before gzip. |
| punycode.js and tr46 encode a label in O(n²) time: a 40,000-character label takes about 15 s in `toASCII`. Python's idna had the same bug (CVE-2024-3651). | `known upstream issues > converts a long label within the test timeout; punycode.js and tr46 take 15 s for this one` |
| Node's `url.domainToASCII` and `new URL()` skip the bidi rule of RFC 5893, which the URL Standard requires. | `idna.oracle.test.ts > matches node:url > domainToASCII, except that Node skips the bidi rule` |

## Benchmarks

Neither upstream library has benchmarks. `idna.bench.ts` converts 10 typical hostnames with `toUnicode` and 10 domains with `toAscii`, against tr46, punycode.js, `node:url` and `new URL()`, and fails if tr46 or punycode.js is more than 25% faster.
