---
'@portable/queue': minor
---

Initial release. `Queue.create` returns a queue that runs at most `concurrency` async tasks at once, with priorities, pause and resume, `AbortSignal` cancellation and an optional rate limit. `limit` wraps a function with a concurrency limit, `map` runs a function over an iterable with one, and `once` shares one call between concurrent callers. Where the runtime has `Symbol.asyncDispose`, a queue declared with `await using` rejects its waiting and running tasks at the end of the scope. Replaces p-limit, p-queue, p-map and p-throttle.
