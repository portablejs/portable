---
'@portable/timers': minor
---

Added `sleep`, `retry` and `poll`, which take an `AbortSignal` and leave no timers behind. `retry` and `poll` share one `delay` option, and `retry` calls `onRetry` before each wait. The delay is a fixed wait, exponential backoff with full jitter, or a function that can return a server's `Retry-After`. `debounce` and `throttle` match lodash's timing, and each call returns a promise of the result of the invocation it was merged into. A `signal` disables them. Replaces delay, p-retry, async-retry, p-wait-for, lodash.debounce, lodash.throttle, throttle-debounce and p-debounce.
