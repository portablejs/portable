---
'@portable/mime-headers': minor
---

Initial release. `MimeHeaders.encodeWord`, `encodeWords` and `decodeWords` convert text to RFC 2047 encoded-words and back, `fold`, `unfold` and `parseHeaders` handle header lines, `parseValue` and `formatValue` read and write values with RFC 2231 parameters, and `parseAddresses`, `parseMailboxes` and `formatAddresses` read and write address lists. Replaces libmime's header functions, addressparser and email-addresses.
