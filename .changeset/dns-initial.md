---
'@portable/dns': minor
---

Initial release. `Dns.create` returns a resolver that looks up records over DNS-over-HTTPS (RFC 8484) with `fetch`. Its methods, results, and error codes match those of `node:dns/promises`. Both this resolver and `node:dns/promises` match the `Dns.Resolver` type, `QueryError` has the same `code` values as Node's errors, and `isNotFound` checks whether a code means the name has no records. Replaces tangerine and dohjs, and `node:dns/promises` in runtimes that don't have it.
