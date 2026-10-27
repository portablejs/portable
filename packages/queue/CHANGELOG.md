# @portable/queue

## 0.1.0

### Minor Changes

- [`5c85a71`](https://github.com/portablejs/portable/commit/5c85a71382ab7afa18b3912cfb04d69f5f5015e9) - Initial release. `Queue.create` returns a queue that runs at most `concurrency` async tasks at once. It has priorities, `AbortSignal` cancellation, and an optional rate limit, and it can pause and resume. `limit` wraps a function with a concurrency limit, `map` maps an iterable with a concurrency limit, and `once` shares one call between concurrent callers. Where the runtime has `Symbol.asyncDispose`, a queue declared with `await using` rejects its waiting and running tasks at the end of the scope. Replaces p-limit, p-queue, p-map, and p-throttle.

### Patch Changes

- Updated dependencies [[`f637257`](https://github.com/portablejs/portable/commit/f637257a41ca66306438256279150ee9e214671a)]:
  - @portable/errors@0.1.0
