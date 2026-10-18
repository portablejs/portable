---
'@portable/queue': minor
---

Added `create`, a queue that runs at most `concurrency` async tasks at once with priorities, pause and resume, `AbortSignal` cancellation and an optional sliding-window rate limit; `limit`, `map` and `once`. Replaces p-limit, p-queue, p-map and p-throttle.
