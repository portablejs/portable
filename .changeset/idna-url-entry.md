---
'@portable/idna': minor
---

Add `@portable/idna/url`, with the same `toUnicode`, `toAscii`, and `InvalidInputError` as the main entry point. It uses the runtime's URL host parser in place of the Unicode tables, so it is 3.3 kB minified and gzipped instead of 16 kB. It applies the bidi rule itself, because the parsers in Node and Cloudflare Workers skip it. If the runtime's tables are older than Unicode 18, it rejects a domain with a character added since.
