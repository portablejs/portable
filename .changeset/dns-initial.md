---
'@portable/dns': minor
---

Added `create`, which resolves names over DNS-over-HTTPS (RFC 8484) with `fetch` and uses the method names, result shapes and error codes of `node:dns/promises`. Added the `Resolver` type, which both `create()` and `node:dns/promises` fit, and `isNotFound`, which checks whether an error code means the name has no records. It replaces `node:dns/promises`, tangerine and dohjs in runtimes without a system resolver.
