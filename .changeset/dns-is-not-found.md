---
'@portable/dns': minor
---

Added `Dns.isNotFound(error)`, which is `true` for the codes `ENOTFOUND`, `ENODATA` and `EBADNAME`. It reads `code`, so it works for `node:dns` errors and for a `QueryError` from another copy of the package. Long DNS-over-HTTPS queries no longer throw a `RangeError` from spreading the message into `String.fromCharCode`.
