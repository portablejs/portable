# @portable/rate-limit

## 0.1.0

### Minor Changes

- [`fce799f`](https://github.com/portablejs/portable/commit/fce799f80c2af7a1f7361ecac95d01772b7154e9) - Initial release. `RateLimit.create` limits requests per key with GCRA and a compare-and-set store, `memoryStore` keeps the state in memory, and `headers` returns the `RateLimit`, `RateLimit-Policy`, and `Retry-After` header fields for a result. The README shows stores for Workers KV, a Durable Object, and Redis over HTTP. Replaces rate-limiter-flexible, limiter, and bottleneck's reservoir options.

### Patch Changes

- Updated dependencies [[`c04a3b9`](https://github.com/portablejs/portable/commit/c04a3b916eacf40859ed1cd8a4de9544de8208a1)]:
  - @portable/timers@0.1.0
