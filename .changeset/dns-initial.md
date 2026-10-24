---
'@portable/dns': minor
---

Added `create`, which resolves names over DNS-over-HTTPS (RFC 8484) with `fetch`, with the method names, result shapes and error codes of `node:dns/promises`, the `Resolver` type that both fit, and `isNotFound` for the codes that mean a name has no records, as a replacement for `node:dns/promises`, tangerine and dohjs in runtimes without a system resolver.
