---
'@portable/mime-headers': minor
---

Initial release. `MimeHeaders.encodeWord`, `encodeWords`, and `decodeWords` convert text to RFC 2047 encoded-words and back; `fold` and `unfold` fold and unfold header lines; `parseHeaders` splits a header block into fields; `parseValue` and `formatValue` read and write values with RFC 2231 parameters; and `parseAddresses`, `parseMailboxes`, and `formatAddresses` read and write address lists. Replaces libmime's header functions, addressparser, and email-addresses.
