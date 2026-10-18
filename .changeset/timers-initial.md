---
'@portable/timers': minor
---

Added `sleep`, `retry` and `poll`, which take an `AbortSignal` and leave no timers behind. `retry` and `poll` share one `delay` option: a fixed wait, exponential backoff with full jitter, or a function that can return a server's `Retry-After`. Replaces delay, p-retry, async-retry and p-wait-for.
