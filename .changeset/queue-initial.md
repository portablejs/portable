---
'@portable/queue': minor
---

Initial release. `Queue.create` returns a queue that runs at most `concurrency` async tasks at once. It has priorities, `AbortSignal` cancellation, and an optional rate limit, and it can pause and resume. `limit` wraps a function with a concurrency limit, `map` maps an iterable with a concurrency limit, and `once` shares one call between concurrent callers. Where the runtime has `Symbol.asyncDispose`, a queue declared with `await using` rejects its waiting and running tasks at the end of the scope. Replaces p-limit, p-queue, p-map, and p-throttle.
