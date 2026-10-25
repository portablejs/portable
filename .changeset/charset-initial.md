---
'@portable/charset': minor
---

Initial release. `Charset.encode` and `EncoderStream` encode text into the WHATWG legacy charsets (the single-byte charsets, Shift_JIS, EUC-JP, ISO-2022-JP, GBK, gb18030, Big5, EUC-KR and UTF-16), with one subpath per charset family so unused tables stay out of a bundle. `normalizeLabel` and `load` look up a charset by label, and `utf8` is a UTF-8 charset object that can be passed wherever the other charsets are accepted. Each charset has an `encode(text)` method, so it can be passed to `@portable/mail` and `@portable/mime-headers` as it is. Replaces the encoding half of iconv-lite.
