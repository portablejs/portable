---
'@portable/mime-headers': minor
---

Added `encodeWord`, `encodeWords` and `decodeWords` for RFC 2047 encoded-words, `fold`, `unfold` and `parseHeaders` for header lines, `parseValue` and `formatValue` for values with RFC 2231 parameters, and `parseAddresses` and `formatAddresses` for address lists, as a replacement for libmime's header functions, addressparser and email-addresses.
