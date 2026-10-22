---
'@portable/timers': minor
---

`Timers.retry` takes an `onRetry` option, called with the error and `{ attempt, delay }` before each wait, as p-retry's `onFailedAttempt` is.
