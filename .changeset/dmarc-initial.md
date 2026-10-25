---
'@portable/dmarc': minor
---

Initial release. `Dmarc.check` takes a From domain and its SPF and DKIM results and evaluates DMARC (RFC 9989). It finds the policy and the organizational domain with the DNS tree walk, through any `Dns.Resolver`. Replaces mailauth's DMARC module.
