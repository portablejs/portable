---
'@portable/idna': minor
---

`toUnicode` and `toAscii` now use the runtime's URL host parser instead of this package's Unicode 18 tables, so the package is 3.3 kB minified and gzipped instead of 16 kB. They apply the bidi rule themselves, because the URL parsers in Node and Cloudflare Workers don't. Both functions now throw `Idna.InvalidInputError` for some input they used to accept: a domain with a character newer than the runtime's Unicode tables; a domain with a URL delimiter, such as `?`; or Unicode input that `URL` reads as an IPv4 address.

```ts
// Before
Idna.toUnicode('a?b.com'); // 'a?b.com'
Idna.toAscii('１２７.０.０.１'); // '127.0.0.1'

// After: both throw Idna.InvalidInputError. Catch it wherever you pass a domain from outside your program.
Idna.toUnicode('a?b.com');
Idna.toAscii('１２７.０.０.１');
```
