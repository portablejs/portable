---
'@portable/dns': minor
'@portable/dkim': patch
'@portable/dmarc': patch
'@portable/spf': patch
'@portable/arc': patch
'@portable/mail-auth': patch
---

`Dns.createResolver` is now `Dns.create`, and its return type is `Dns.Resolver & { query }` instead of a copy of every method. The `fetch` option is called with a `Request`.
