---
'@portable/dmarc': minor
---

Added `check`, which evaluates DMARC (RFC 9989) for a From domain from SPF and DKIM results with any `Dns.Resolver`, finding the policy and organizational domain with the DNS tree walk, as a replacement for mailauth's DMARC module.
