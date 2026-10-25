---
'@portable/rate-limit': minor
---

Initial release. `RateLimit.create` limits requests per key with GCRA and a compare-and-set store, `memoryStore` keeps the state in memory, and `headers` returns the `RateLimit`, `RateLimit-Policy`, and `Retry-After` header fields for a result. The README shows stores for Workers KV, a Durable Object, and Redis over HTTP. Replaces rate-limiter-flexible, limiter, and bottleneck's reservoir options.
