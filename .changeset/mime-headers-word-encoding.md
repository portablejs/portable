---
'@portable/mime-headers': minor
'@portable/mail': patch
---

The `encoding` option of `encodeWord`, `encodeWords` and `formatAddresses` is now `wordEncoding`, and the `Encoding` type is now `WordEncoding`, because `encoding` means a text encoding in csv, lines and streams.
