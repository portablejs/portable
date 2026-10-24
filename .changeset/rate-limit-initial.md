---
'@portable/rate-limit': minor
---

Added `create`, `headers` and `memoryStore`: GCRA rate limiting per key with a compare-and-set store, and the `RateLimit` and `RateLimit-Policy` header fields, as a replacement for rate-limiter-flexible, limiter and bottleneck's reservoir.
