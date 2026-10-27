# @portable/charset

## 0.1.0

### Minor Changes

- [`68959dc`](https://github.com/portablejs/portable/commit/68959dc678ed97e060044416cd48541d4ed682dd) - Initial release. `Charset.encode` and `EncoderStream` encode text into the WHATWG legacy charsets (the single-byte charsets, Shift_JIS, EUC-JP, ISO-2022-JP, GBK, gb18030, Big5, EUC-KR, and UTF-16), with one subpath per charset family so unused tables stay out of a bundle. `normalizeLabel` and `load` look up a charset by label, and `utf8` is a UTF-8 charset object that can be passed wherever the other charsets are accepted. Each charset has an `encode(text)` method, so it can be passed to @portable/mail and @portable/mime-headers as it is. Replaces the encoding half of iconv-lite.

### Patch Changes

- Updated dependencies [[`ef22071`](https://github.com/portablejs/portable/commit/ef22071656ac46dc37c780989da9b1caed3d7375), [`f637257`](https://github.com/portablejs/portable/commit/f637257a41ca66306438256279150ee9e214671a), [`a09a240`](https://github.com/portablejs/portable/commit/a09a240fc290f73902b2ffd85b7ac0fc3460aa97)]:
  - @portable/bytes@0.1.0
  - @portable/errors@0.1.0
  - @portable/streams@0.1.0
