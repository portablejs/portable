---
'@portable/charset': minor
---

Added `encode` and `EncoderStream` for the WHATWG legacy charsets (single-byte, Shift_JIS, EUC-JP, ISO-2022-JP, GBK, gb18030, Big5, EUC-KR, UTF-16), plus `normalizeLabel` and `load` for charset labels. Each charset has an `encode(text)` method, so it can be passed to `@portable/mail` and `@portable/mime-headers` as it is. It replaces the encoding half of iconv-lite.
