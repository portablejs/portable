---
'@portable/idna': minor
---

`toUnicode` and `toAscii` now use the runtime's URL host parser in place of this package's Unicode 18 tables, and apply the bidi rule themselves, because the parsers in Node and Cloudflare Workers skip it. The package is 3.3 kB minified and gzipped instead of 16 kB. Both functions reject whatever the runtime's parser rejects: a domain with a character newer than the runtime's Unicode tables; a domain with a URL delimiter, such as `?`; or Unicode input that `URL` reads as an IPv4 address.
