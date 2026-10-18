---
'@portable/spf': minor
---

Added `check`, which evaluates SPF (RFC 7208) for a client IP, MAIL FROM address and HELO name with any `Dns.Resolver`, as a replacement for mailauth's SPF module.
