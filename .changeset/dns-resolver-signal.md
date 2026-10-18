---
'@portable/dns': patch
---

The `Resolver` type's methods take an optional `{ signal }` as their second argument, as the resolver from `createResolver` does, so a library that takes a `Dns.Resolver` can cancel its lookups.
