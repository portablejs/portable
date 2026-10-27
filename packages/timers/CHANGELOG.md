# @portable/timers

## 0.1.0

### Minor Changes

- [`c04a3b9`](https://github.com/portablejs/portable/commit/c04a3b916eacf40859ed1cd8a4de9544de8208a1) - Initial release. `Timers.sleep`, `retry`, and `poll` take an `AbortSignal` and leave no timers behind. `retry` and `poll` share one `delay` option: a fixed wait, exponential backoff with full jitter, or a function that can return a server's `Retry-After`. `backoff` turns a `delay` into a function that returns each wait. `debounce` and `throttle` match lodash's timing, and each call returns a promise of the result of the invocation it was merged into. The `Instant` type, which other `@portable/*` packages accept for `now` and other times, is a `Date`, a `Temporal.Instant`, or a `Temporal.ZonedDateTime`. Replaces delay, p-retry, async-retry, p-wait-for, lodash.debounce, lodash.throttle, throttle-debounce, and p-debounce.

### Patch Changes

- Updated dependencies [[`f637257`](https://github.com/portablejs/portable/commit/f637257a41ca66306438256279150ee9e214671a)]:
  - @portable/errors@0.1.0
