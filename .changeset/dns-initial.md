---
'@portable/dns': minor
---

Added `createResolver`, which resolves names over DNS-over-HTTPS (RFC 8484) with `fetch`, with the method names, result shapes and error codes of `node:dns/promises`, and the `Resolver` type that both fit, as a replacement for `node:dns/promises`, tangerine and dohjs in runtimes without a system resolver.
