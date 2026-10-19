---
'@portable/timers': minor
---

Add `Timers.backoff(delay)`, which checks a `Timers.Delay` and returns the function that computes each wait, so other code can wait the way `retry` and `poll` do.
