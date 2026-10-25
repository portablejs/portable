---
'@portable/queue': minor
---

Added `create`, a queue that runs at most `concurrency` async tasks at once with priorities, pause and resume, `AbortSignal` cancellation and an optional sliding-window rate limit; `limit`, `map` and `once`. Where the runtime has `Symbol.asyncDispose`, a queue declared with `await using` rejects its waiting and running tasks at the end of the scope. Replaces p-limit, p-queue, p-map and p-throttle.
