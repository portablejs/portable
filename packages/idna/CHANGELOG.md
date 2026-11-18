# @portable/idna

## 0.2.0

### Minor Changes

- [#59](https://github.com/portablejs/portable/pull/59) [`e6b7965`](https://github.com/portablejs/portable/commit/e6b79659df02963502e63a580ba5bad3901ff038) - `toUnicode` and `toAscii` now use the runtime's URL host parser instead of this package's Unicode 18 tables, so the package is 3.3 kB minified and gzipped instead of 16 kB. They apply the bidi rule themselves, because the URL parsers in Node and Cloudflare Workers don't. Both functions now throw `Idna.InvalidInputError` for some input they used to accept: a domain with a character newer than the runtime's Unicode tables; a domain with a URL delimiter, such as `?`; or Unicode input that `URL` reads as an IPv4 address.
  
  ```ts
  // Before
  Idna.toUnicode('a?b.com'); // 'a?b.com'
  Idna.toAscii('１２７.０.０.１'); // '127.0.0.1'
  
  // After: both throw Idna.InvalidInputError. Catch it wherever you pass a domain from outside your program.
  Idna.toUnicode('a?b.com');
  Idna.toAscii('１２７.０.０.１');
  ```

## 0.1.0

### Minor Changes

- [`3a566ea`](https://github.com/portablejs/portable/commit/3a566ea00267d6c74313137345532bcc59227b35) - Initial release. `Idna.toUnicode` and `Idna.toAscii` convert internationalized domain names between Unicode and Punycode by UTS [#46](https://github.com/portablejs/portable/issues/46), with Unicode 18.0.0 tables. Replaces punycode, `node:punycode`, and tr46.

### Patch Changes

- Updated dependencies [[`f637257`](https://github.com/portablejs/portable/commit/f637257a41ca66306438256279150ee9e214671a)]:
  - @portable/errors@0.1.0
