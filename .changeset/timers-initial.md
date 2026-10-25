---
'@portable/timers': minor
---

Initial release. `Timers.sleep`, `retry` and `poll` take an `AbortSignal` and leave no timers behind. `retry` and `poll` share one `delay` option: a fixed wait, exponential backoff with full jitter, or a function that can return a server's `Retry-After`, and `backoff` turns a `delay` into a function that returns each wait. `debounce` and `throttle` match lodash's timing, and each call returns a promise of the result of the invocation it was merged into. The `Instant` type, which other `@portable/*` packages accept for `now` and other times, is a `Date`, a `Temporal.Instant` or a `Temporal.ZonedDateTime`. Replaces delay, p-retry, async-retry, p-wait-for, lodash.debounce, lodash.throttle, throttle-debounce and p-debounce.
