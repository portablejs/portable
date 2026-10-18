---
'@portable/timers': minor
---

Added `sleep`, `retry` and `poll`, which take an `AbortSignal` and leave no timers behind. `retry` and `poll` share one `delay` option: a fixed wait, exponential backoff with full jitter, or a function that can return a server's `Retry-After`. `debounce` and `throttle` match lodash's timing, return a promise of the invocation each call was folded into, and take a `signal` that disables them. Replaces delay, p-retry, async-retry, p-wait-for, lodash.debounce, lodash.throttle, throttle-debounce and p-debounce.
