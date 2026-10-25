---
'@portable/spf': minor
---

Initial release. `Spf.check` evaluates SPF (RFC 7208) for a client IP, MAIL FROM address and HELO name through any `Dns.Resolver`, and enforces the RFC's DNS lookup limits. Replaces mailauth's SPF module.
