# Test parity

Upstream suites: [p-limit 7.3.3 `test.js`](https://github.com/sindresorhus/p-limit/blob/main/test.js), [p-queue 10.0.0 `test/`](https://github.com/sindresorhus/p-queue/tree/main/test), [p-map 7.1.1 `test.js`](https://github.com/sindresorhus/p-map/blob/main/test.js), and [p-throttle 8.1.1 `tests/`](https://github.com/sindresorhus/p-throttle/tree/main/tests). Every test is listed below with the test that covers the same case, written as `describe > test` from the `*.conformance.ts` files. `oracle > ...` names a test in `queue.oracle.test.ts`, which runs the same plan through our package and the upstream library under fake timers and compares start order, start times, finish order, results, and errors.

Most skipped tests belong to features this package leaves out on purpose. They are listed once under "Not built" and referenced by name in the tables. p-map 7.1 is mostly `pMapIterable`, `pMapSettled`, `pMapKeyed`, and the `pMapSkip` and `pMapStop` sentinels, so most of its rows are skipped.

## Known upstream issues

| Issue | How we handle it | Test |
| --- | --- | --- |
| p-queue [#217](https://github.com/sindresorhus/p-queue/issues/217): aborting 10,000 waiting tasks that share a signal overflows the stack. | Aborting marks the task removed in O(1), and the queue skips removed tasks when it starts the next one. | `known upstream issues > aborting 10,000 waiting tasks with one signal neither overflows the stack nor hangs`, `known upstream issues > clearing 10,000 waiting tasks does not overflow the stack` |
| p-queue [#219](https://github.com/sindresorhus/p-queue/issues/219), [#241](https://github.com/sindresorhus/p-queue/issues/241): an aborted signal didn't remove a waiting task or reject its promise. | The task is removed, and its promise rejects with `signal.reason` at once. | `signal > aborting while the task waits removes it and rejects with the reason` |
| p-queue [#239](https://github.com/sindresorhus/p-queue/issues/239), p-limit `clearQueue()`: cleared tasks' promises stayed pending forever. | `clear()` always rejects them with an `AbortError`, and marks the promises handled. | `p-limit > clear removes the waiting tasks and rejects them with an AbortError`, `idle, pause, and clear > an ignored promise of a removed task is not an unhandled rejection` |
| p-queue [#237](https://github.com/sindresorhus/p-queue/issues/237): `idle` never fires when the queue never had a task. | `idle()` resolves at once. | `idle, pause, and clear > idle resolves at once for a queue that never had a task` |
| p-queue [#255](https://github.com/sindresorhus/p-queue/issues/255): adding tasks from a listener exceeds the concurrency. | There are no listeners. A task added from inside a running task waits for a slot. | `add > a task added from inside a running task waits for a free slot` |
| p-queue: aborting a running task frees its slot while the task may still run, so more than `concurrency` tasks run. | The slot stays taken until the task settles. `add` still rejects at once. | `signal > an aborted running task keeps its slot until it settles` |
| p-queue: fixed windows let `2 × intervalCap` tasks start around a window boundary unless `strict: true` is set. | The rate limit is always a sliding window. | `rate limit > has no burst at a window boundary` |
| p-queue: the rate limit uses `Date.now()`, so a clock that goes back stalls the queue (documented in its options). | The window is measured with `performance.now()`, which never goes back. | Not testable without moving the system clock. |
| p-queue: an `interval` above 2³¹−1 ms made `setTimeout` fire every 1 ms (now rejected). | The timer waits in steps of at most 2³¹−1 ms and rechecks the window. | `rate limit > waits out an interval longer than the timer limit instead of firing early` |
| p-limit [#110](https://github.com/sindresorhus/p-limit/issues/110): `limit.map` left unhandled rejections when the iterable threw. | Every call's promise has a handler. | `map errors > an iterable that throws after its first items leaves no unhandled rejection` |
| p-limit [#91](https://github.com/sindresorhus/p-limit/issues/91): a task that awaits another task on the same limit deadlocks at `concurrency: 1`. | We keep this behavior, because the limit exists to make tasks wait for a free slot. The README says to give nested work its own queue. | None |
| p-map [#42](https://github.com/sindresorhus/p-map/issues/42): with high concurrency, `stopOnError` doesn't stop the calls already started. | The `signal` passed to each running call aborts on the first error. | `map errors > aborts the signal of calls still running after the first error` |
| p-map [#75](https://github.com/sindresorhus/p-map/issues/75): abort listeners leaked. | The listener is removed when `map` settles. | `map signal > removes its abort listener when it resolves or rejects` |
| p-map: an iterator whose `next()` returns a non-object hung the run. | Rejects with a `TypeError`. | `map > rejects when next() returns something that is not an object` |

## Deliberate differences

- `map` doesn't await promise items before calling `fn` (p-map does), and passes `{ index, signal }` instead of a bare index.
- `map` doesn't call `return()` on an iterator whose `next()` threw, as `for...of` doesn't. With an already aborted signal it never opens the iterator, so there is nothing to close.
- Invalid arguments throw at once instead of rejecting the returned promise.
- After a task settles, the next task counts in `pending` at once and its function runs one microtask later, in the async context of its `add` call.
- The rate limit starts a task as soon as the sliding window has room. p-throttle's strict mode spaces saturated calls `interval / limit` apart, so the oracle checks that every call starts no later than with p-throttle and that no window has more than `limit` starts.

## Not built

- **events.** No events. The queue is a plain object, not an `EventTarget`. Each `add()` promise settles with its own task's result or error.
- **timeout.** No `timeout` option. Pass `signal: AbortSignal.timeout(ms)` to `add`, or use `Timers.retry` with `timeout` inside the task (README).
- **addAll.** No `addAll()`. Use `Promise.all(tasks.map((task) => queue.add(task)))`.
- **setPriority.** No task ids or `setPriority()`. Abort the waiting task and add it again with the new priority.
- **onEmpty.** No `onEmpty()`. `size` reads the waiting count, and `idle()` waits for waiting and running tasks.
- **onSizeLessThan.** No `onSizeLessThan()`. It is mostly used for backpressure, and `Queue.map` reads its input only as slots free up.
- **onPendingZero.** No `onPendingZero()`. `idle()` waits for waiting and running tasks.
- **onError.** No `onError()`. Each `add()` promise rejects with its own task's error.
- **rate-limit state.** No `isRateLimited`, `onRateLimit()`, or `onRateLimitCleared()`. The queue exposes `size` and `pending` only.
- **fixed windows.** The rate limit is a sliding window only, the same as p-queue's and p-throttle's strict mode. There is no fixed-window mode and no `carryoverIntervalCount`.
- **runningTasks.** No `runningTasks` or `isSaturated`. `pending`, `size`, and `concurrency` are readable.
- **queueClass.** No `queueClass` or task ids. The priority queue is internal.
- **pMapIterable.** No iterable output (`pMapIterable`). `map` resolves once with every result.
- **pMapSettled.** No `pMapSettled` or `pMapSettledKeyed`. `stopOnError: false` reports every error, and `Promise.allSettled(items.map((item) => limit(() => fn(item))))` gives a result per item.
- **pMapKeyed.** No `pMapKeyed`. Map `Object.entries(object)` and rebuild it with `Object.fromEntries`.
- **pMapStop.** No `pMapStop`. Abort `options.signal` or throw to stop.
- **pMapSkip.** No `pMapSkip`. Filter the results.
- **weight.** No `weight` option. Each task counts as one start.
- **onDelay.** No `onDelay`. `size` shows how many tasks wait.
- **isEnabled.** No `isEnabled`. Call the function directly to bypass the limit.

## Upstream tests

### p-limit 7.3.3 `test.js`

| Upstream test | Covered by | Notes |
| --- | --- | --- |
| concurrency: 1 | `p-limit > runs one task at a time with concurrency 1` |  |
| concurrency: 4 | `p-limit > never runs more tasks than the concurrency` |  |
| propagates async execution context properly | `oracle > limit matches p-limit > a task runs in the async context of its call` | Node only, because it uses `AsyncLocalStorage`. |
| non-promise returning function | `p-limit > accepts a task that returns a value instead of a promise` |  |
| continues after sync throw | `p-limit > a task that throws synchronously rejects, and the next task still runs` |  |
| accepts additional arguments | skipped | `limit(task)` passes the task a context, not extra arguments. Pass them through a closure. |
| shared context with a limited provider helper | skipped | Passes extra arguments, as above. The counts it checks are covered by `p-limit > counts running and waiting tasks`. |
| does not ignore errors | `p-limit > rejects with the error of the failing task` |  |
| runs all tasks asynchronously | `` p-limit > starts each task after `add` returns `` |  |
| activeCount and pendingCount properties | `p-limit > counts running and waiting tasks` |  |
| clearQueue | `p-limit > clear removes the waiting tasks and rejects them with an AbortError` |  |
| map | `map > resolves with the results in input order` |  |
| map works when detached from the limit | `map with a queue > shares a limit between map and other tasks` |  |
| map passes index and preserves order with concurrency | `map > keeps input order when calls finish in reverse order` |  |
| map accepts an iterable (set) | `map > maps any iterable: a Set, a Map, a string, and an array iterator` |  |
| map accepts an iterable (array iterator) | `map > maps any iterable: a Set, a Map, a string, and an array iterator` |  |
| map accepts array-like inputs | skipped | `input` must be iterable. Pass `Array.from(arrayLike)`. |
| map does not leave unhandled rejections when the iterable throws | `map errors > an iterable that throws after its first items leaves no unhandled rejection` |  |
| map rejects with the mapper error | `map errors > rejects at once with the first error when stopOnError is true` |  |
| map resolves to an empty array for an empty iterable | `map > resolves with an empty array for empty input` |  |
| map rejects with the iterable error when it throws before the first item | `map errors > rejects with a source error that comes first` |  |
| map rejects immediately with the iterable error and still runs already scheduled tasks | `map errors > rejects with a source error at the item that throws` | `map` reads the input as slots free up, as p-map does, so it reaches the error later than p-limit, which reads the whole input first. |
| map passes sequential indexes for a generator | `map > passes each item its index` |  |
| accepts options object | skipped | `limit` takes a number. `create({ concurrency })` takes options. |
| throws on invalid concurrency argument | `p-limit > throws on an invalid concurrency` |  |
| change concurrency to smaller value | `p-limit > lowering the concurrency lets running tasks finish and starts fewer` |  |
| change concurrency to bigger value | `p-limit > raising the concurrency starts waiting tasks at once` |  |
| limitFunction() | skipped | No `limitFunction`. Write `(...args) => limit(() => fn(...args))`. |
| clearQueue rejects pending promises when enabled | `p-limit > clear removes the waiting tasks and rejects them with an AbortError` |  |
| limitFunction exposes clearQueue | skipped | No `limitFunction`. The queue from `create` has `clear()`. |

### p-queue 10.0.0 `test/basic.ts`

| Upstream test | Covered by | Notes |
| --- | --- | --- |
| .add() | `add > resolves with the result of the task` |  |
| .add() - limited concurrency | `` add > runs at most `concurrency` tasks at once `` |  |
| .add() - concurrency: 1 | `add > starts tasks in the order they were added with concurrency 1` |  |
| .add() - concurrency: 5 | `` add > runs at most `concurrency` tasks at once `` |  |
| .add() - update concurrency | `p-limit > raising the concurrency starts waiting tasks at once` |  |
| .add() - priority | `add > starts tasks with a higher priority first` |  |
| .sizeBy() - priority | skipped | No `sizeBy()`. `size` counts every waiting task. |
| .add() - priority defaults to 0 when undefined | `add > keeps the order of equal priorities, including Infinity and -Infinity` |  |
| .add() - timeout always throws | skipped | Not built: timeout |
| .add() - timeout behavior | skipped | Not built: timeout |
| .add() - the task signal aborts on timeout | skipped | Not built: timeout |
| .add() - the timeout aborts the task signal when a user signal is also set | skipped | Not built: timeout |
| .add() - timeout: undefined disables the queue timeout for one task | skipped | Not built: timeout |
| .add() - the timeout wins over an abort listener of the task | skipped | Not built: timeout |
| .add() - a signal that aborts while the task starts rejects and frees the slot (timeout: ${timeout}) | skipped | Not built: timeout |
| .add() - the abort listeners are removed when a task with a timeout completes | skipped | Not built: timeout |
| .add() - the task signal aborts on the user signal when a timeout is set | skipped | Not built: timeout |
| .add() - timeout timer is cleared when the task completes | skipped | Not built: timeout |
| .add() - change timeout in between | skipped | Not built: timeout |
| .onEmpty() | skipped | Not built: onEmpty |
| .onEmpty() resolves when the last waiting task starts | skipped | Not built: onEmpty |
| .onEmpty() called in an `add` listener resolves when the task starts, not when it finishes | skipped | Not built: onEmpty |
| .onIdle() | `idle, pause, and clear > idle resolves when every task has settled` |  |
| .onSizeLessThan() | skipped | Not built: onSizeLessThan |
| .onSizeLessThan() resolves after clear() | skipped | Not built: onSizeLessThan |
| .onSizeLessThan() resolves when start() drains the queue | skipped | Not built: onSizeLessThan |
| .onSizeLessThan() resolves when concurrency is raised at runtime | skipped | Not built: onSizeLessThan |
| .onSizeLessThan() resolves when a rate-limit interval tick drains the queue | skipped | Not built: onSizeLessThan |
| .onSizeLessThan() resolves multiple waiters with different limits on a single drain | skipped | Not built: onSizeLessThan |
| .onSizeLessThan() removes its listeners once resolved | skipped | Not built: onSizeLessThan |
| .onIdle() - no pending | `idle, pause, and clear > idle resolves at once for a queue that never had a task` |  |
| .onPendingZero() - resolves immediately when pending === 0 | skipped | Not built: onPendingZero |
| .onPendingZero() - waits for running tasks to finish | skipped | Not built: onPendingZero |
| .onPendingZero() - works while paused with queued items | skipped | Not built: onPendingZero |
| .onPendingZero() - multiple concurrent waiters all resolve | `idle, pause, and clear > several idle calls all resolve` |  |
| .onPendingZero() - resolves even if tasks throw errors | `idle, pause, and clear > idle resolves after failed tasks too` |  |
| .onPendingZero() - works after clear() | `idle, pause, and clear > idle resolves after clear once the running task settles` |  |
| .onPendingZero() - integration with pause/start | skipped | Not built: onPendingZero |
| .onPendingZero() - adding tasks while waiting | `idle, pause, and clear > idle waits for tasks added while waiting` |  |
| .onPendingZero() - rapid sequential calls | skipped | Not built: onPendingZero |
| .onPendingZero() - high concurrency | skipped | Not built: onPendingZero |
| .onPendingZero() - starts with empty queue | skipped | Not built: onPendingZero |
| .onPendingZero() - works with onEmpty and onIdle | skipped | Not built: onEmpty |
| .clear() | `p-limit > clear removes the waiting tasks and rejects them with an AbortError` |  |
| .clear() rejects the removed tasks and lets the running tasks finish | `idle, pause, and clear > clear lets the running tasks finish` |  |
| .clear() does not cause an unhandled rejection for an ignored promise | `idle, pause, and clear > an ignored promise of a removed task is not an unhandled rejection` |  |
| an ignored promise of a failed task is still an unhandled rejection | skipped | Needs a child process, because Vitest fails any test with an unhandled rejection. As in p-queue, only removed tasks have their promises marked handled. |
| .add() - the next waiting task has started when the promise resolves | `add > the next waiting task has started when a task settles` | The next task counts in `pending` when the promise resolves, and its function runs one microtask later. |
| .clear() resolves onEmpty() and onIdle() waiters | `idle, pause, and clear > idle resolves after clear once the running task settles` |  |
| .clear() with running tasks emits empty but not idle | skipped | Not built: events |
| .addAll() | skipped | Not built: addAll |
| .addAll() assigns unique IDs to each task | skipped | Not built: addAll |
| .addAll() with options does not mutate the options object | skipped | Not built: addAll |
| autoStart: false | `idle, pause, and clear > pause stops starting tasks and resume starts them again` | There is no `autoStart`. Call `pause()` after `create`. |
| .start() - return this | skipped | `resume()` returns nothing. The queue has no chained calls. |
| .start() - not paused | `idle, pause, and clear > pause stops starting tasks and resume starts them again` |  |
| .pause() | `idle, pause, and clear > pause stops starting tasks and resume starts them again` |  |
| .add() sync/async mixed tasks | `add > accepts sync and async tasks together` |  |
| .add() - handle task throwing error | `add > rejects with the error of a task that throws or rejects, and keeps running` |  |
| .add() - handle task promise failure | `add > rejects with the error of a task that throws or rejects, and keeps running` |  |
| .addAll() sync/async mixed tasks | skipped | Not built: addAll |
| should resolve empty when size is zero | skipped | Not built: onEmpty |
| .add() - throttled | `rate limit > starts at most intervalCap tasks in any interval` |  |
| .add() - throttled, carryoverIntervalCount false | skipped | Not built: fixed windows |
| .add() - throttled, carryoverIntervalCount true | skipped | Not built: fixed windows |
| .add() - throttled 10, concurrency 5 | `rate limit > works together with a concurrency limit` |  |
| .add() - throttled finish and resume | `rate limit > remembers the starts of the current window after the queue is idle` |  |
| pause should work when throttled | `rate limit > pausing while rate-limited, then resuming, still limits` |  |
| .onError() - rejects when task errors | skipped | Not built: onError |
| .onError() - captures first error in queue | skipped | Not built: onError |
| .onError() - works with Promise.race pattern | skipped | Not built: onError |
| .onError() - multiple listeners | skipped | Not built: onError |
| .onError() - works when called before adding tasks | skipped | Not built: onError |
| an active listener cannot exceed the concurrency limit | `add > a task added from inside a running task waits for a free slot` | There are no listeners. Adding from inside a task is the same re-entrant case. |
| .add() runs tasks with `Infinity` priority first, in the order they were added | `add > keeps the order of equal priorities, including Infinity and -Infinity` |  |
| .onError() - pausing in an `error` listener stops the remaining tasks, as documented | skipped | Not built: onError |
| .addAll() resolves with the results in task order when the tasks finish in reverse order | skipped | Not built: addAll |
| .addAll() with an empty array resolves with an empty array | skipped | Not built: addAll |
| .setPriority() moves an `Infinity` priority task behind the tasks with its new priority | skipped | Not built: setPriority |
| .onError() - pausing in an `error` listener stops the remaining tasks after a synchronous throw | skipped | Not built: onError |

### p-queue 10.0.0 `test/advanced.ts`

| Upstream test | Covered by | Notes |
| --- | --- | --- |
| clear interval on pause | `rate limit > pausing while rate-limited, then resuming, still limits` | A paused queue's timer fires once and sets no new one. |
| many waiters do not cause a listener leak warning | `idle, pause, and clear > several idle calls all resolve` | `idle()` keeps resolvers in an array, not event listeners. |
| should be an event target | skipped | Not built: events |
| should emit active event per item | skipped | Not built: events |
| should emit idle event when idle | skipped | Not built: events |
| should emit empty event when empty | skipped | Not built: events |
| should emit add event when adding task | skipped | Not built: events |
| should emit next event when completing task | skipped | Not built: events |
| should emit completed / error events | skipped | Not built: events |
| should verify timeout overrides passed to add | skipped | Not built: timeout |
| should reject when signal is aborted while task is waiting in queue | `signal > aborting while the task waits removes it and rejects with the reason` |  |
| abort with custom reason forwards the reason | `signal > aborting while the task waits removes it and rejects with the reason` |  |
| abort works on a paused queue without unpausing | `signal > aborting works on a paused queue without resuming it` |  |
| aborting multiple queued tasks with same AbortController | `signal > aborting several waiting tasks with one controller removes only them` |  |
| aborting a queued task with explicit id removes the correct task | skipped | Not built: queueClass |
| aborting a queued task removes it from a custom queue class by id | skipped | Not built: queueClass |
| aborting a queued task with duplicate id removes the correct task | skipped | Not built: queueClass |
| abort listener for queued task is cleaned up when the task starts running | `signal > removes its abort listeners when tasks finish` |  |
| aborting a queued task emits correct events | skipped | Not built: events |
| onError does not reject when a queued task is aborted | skipped | Not built: onError |
| clear() removes queued abort listeners | `signal > clear removes the abort listeners of the waiting tasks` |  |
| clear() removes queued abort listeners for shared signals | `signal > clear removes the abort listeners of the waiting tasks` |  |
| clear() lets the same signal be reused without stale queued listeners | `signal > clear removes the abort listeners of the waiting tasks` |  |
| clear() keeps the running task abort listener while removing queued ones | `signal > clear removes the abort listeners of the waiting tasks` |  |
| clear() only leaves the running task affected when a shared signal aborts later | `signal > clear removes the abort listeners of the waiting tasks` |  |
| clear() does not accumulate abort listeners across repeated discard cycles | `signal > tasks that share a signal add one listener to it` |  |
| should pass AbortSignal instance to job | `signal > passes an AbortSignal to every task` |  |
| aborting multiple jobs at the same time | `signal > aborting several running tasks at the same time` |  |
| abort listener is removed when job is completed | `signal > removes its abort listeners when tasks finish` |  |
| pending promises counted fast enough | `p-limit > counts running and waiting tasks` |  |
| pending promises with abortions counted fast enough | `signal > an aborted running task keeps its slot until it settles` | Different on purpose: p-queue frees the slot at once, so more tasks than `concurrency` can run. |
| intervalCap | `rate limit > starts at most intervalCap tasks in any interval` |  |
| consumed interval is remembered between idle states | `rate limit > remembers the starts of the current window after the queue is idle` |  |
| consumed interval is updated on time, even between idle states | `rate limit > starts a task at once after a long idle period` |  |
| .setPriority() - execute a promise before planned | skipped | Not built: setPriority |
| interval should be maintained when using await between adds (issue #182) | `rate limit > keeps the limit when many tasks are added over time` |  |
| task added in a fresh window runs immediately after queue went idle mid-window (issue #251) | `rate limit > starts a task at once after a long idle period` | The sliding window has no window boundaries. |
| fresh window after idle still enforces the cap for the following task (issue #251) | `rate limit > remembers the starts of the current window after the queue is idle` | The sliding window has no window boundaries. |
| carryoverIntervalCount does not break the fresh window after idle mid-window (issue #251) | `rate limit > remembers the starts of the current window after the queue is idle` | The sliding window has no window boundaries. |
| task added after going idle but before the boundary still waits for the current window (issue #251) | `rate limit > remembers the starts of the current window after the queue is idle` | The sliding window has no window boundaries. |
| interval maintained when queue becomes empty multiple times | `rate limit > remembers the starts of the current window after the queue is idle` |  |
| interval reset after long idle period | `rate limit > starts a task at once after a long idle period` |  |
| interval with carryoverIntervalCount after queue empty | skipped | Not built: fixed windows |
| .setPriority() - execute a promise after planned | skipped | Not built: setPriority |
| .setPriority() - execute a promise before planned - concurrency 2 | skipped | Not built: setPriority |
| .setPriority() - execute a promise before planned - concurrency 3 | skipped | Not built: setPriority |
| .setPriority() - execute a multiple promise before planned, with variable priority | skipped | Not built: setPriority |
| .setPriority() - execute a promise before planned - concurrency 3 and unspecified `id` | skipped | Not built: setPriority |
| process exits cleanly after interval tasks complete | skipped | Counts Node's active timers. Our queue sets a timer only while a task waits for the window, and `clear()` removes it. |
| intervalCap should be respected with high concurrency (issue #126) | `rate limit > starts at most intervalCap tasks in any interval` |  |
| isRateLimited property | skipped | Not built: rate-limit state |
| rate-limit event emission | skipped | Not built: rate-limit state |
| onRateLimit() promise helper | skipped | Not built: rate-limit state |
| onRateLimitCleared() promise helper | skipped | Not built: rate-limit state |
| rate-limit works with pause/start | `rate limit > pausing while rate-limited, then resuming, still limits` |  |
| rate-limit with high concurrency | `rate limit > starts at most intervalCap tasks in any interval` |  |
| rate-limit events fire only once per transition | skipped | Not built: rate-limit state |
| rate-limit with interval boundary conditions | `rate limit > frees a start as soon as the oldest one leaves the window` |  |
| should not cause stack overflow with many aborted tasks | `known upstream issues > aborting 10,000 waiting tasks with one signal neither overflows the stack nor hangs` |  |
| rate-limit with carryoverIntervalCount behavior | skipped | Not built: fixed windows |
| rate-limit with aborted tasks | `rate limit > a waiting task that is aborted does not use a start` |  |
| rate-limit with error-throwing tasks | `rate limit > a task that throws still counts as a start` |  |
| rate-limit state remains stable within intervals | skipped | Not built: rate-limit state |
| rate-limit microtask batching - multiple events in same tick | skipped | Not built: rate-limit state |
| rate-limit with dynamic concurrency changes | `rate limit > works together with a concurrency limit` |  |
| rate-limit with setPriority() while rate-limited | `rate limit > starts the higher priority task first when a slot frees` | There is no `setPriority()`. |
| rate-limit multiple concurrent onRateLimit() calls | skipped | Not built: rate-limit state |
| rate-limit when all queued tasks are aborted | `rate limit > a waiting task that is aborted does not use a start` |  |
| changing `concurrency`, `.clear()`, or `.start()` on an empty queue emits no `empty` or `idle` | skipped | Not built: events |
| a task that throws synchronously emits `error` after `active`, so `.onError()` catches it | skipped | Not built: onError |
| an `empty` or `idle` listener can set `concurrency`, call `.clear()`, or pause and start without infinite recursion | skipped | Not built: events |
| starting a paused queue with no waiting tasks emits `idle` only when the running task finishes | skipped | Not built: events |
| a task that throws synchronously with only a `signal` emits `error` after `active`, then becomes idle | skipped | Not built: events |
| aborting a shared signal emits `error` only for the running task, not for the waiting tasks | skipped | Not built: events |
| a custom queue class typed with the exported types works end to end | skipped | Not built: queueClass |
| a waiting task whose signal aborts before its own abort listener runs does not start or emit `error` | `signal > aborting several waiting tasks with one controller removes only them` |  |
| aborting waiting tasks that share a signal emits `empty` and `idle` once | `idle, pause, and clear > idle resolves when the last waiting task is aborted` |  |
| skipping many waiting tasks whose shared signal aborted does not overflow the stack | `known upstream issues > aborting 10,000 waiting tasks with one signal neither overflows the stack nor hangs` |  |
| .add() with an already aborted signal rejects without adding the task or emitting events | `signal > an already aborted signal rejects without adding the task` |  |
| a task runs in the async context of its `.add()` call, also when it starts later | `oracle > limit matches p-limit > a task runs in the async context of its call` | Node only, because it uses `AsyncLocalStorage`. |
| aborting many waiting tasks is fast, with one shared signal and with a signal for each task | `known upstream issues > aborting 10,000 waiting tasks with one signal neither overflows the stack nor hangs` |  |
| adding and running many tasks with one shared signal is fast | `` signal > tasks that share a signal add one listener to it, and `queue.bench.ts` (priorities and a signal) `` |  |
| tasks that share a signal add at most one listener to it, and remove it when they are done | `signal > tasks that share a signal add one listener to it` |  |
| a signal shared by two queues aborts the waiting and running tasks of both, and each queue removes its listener | `signal > a task signal and the queue signal both abort the task` |  |
| a task with a signal and a timeout runs in the async context of its `.add()` call | skipped | Not built: timeout |

### p-queue 10.0.0 `test/priority-queue.ts`

| Upstream test | Covered by | Notes |
| --- | --- | --- |
| PriorityQueue ignores dequeued items in queue operations | skipped | Tests p-queue's exported `PriorityQueue` class. Ours is internal, and its effect on order is covered by `add > keeps priority order after many tasks have started`. |
| PriorityQueue inserts high-priority items correctly after partial dequeue | skipped | Tests p-queue's exported `PriorityQueue` class. Ours is internal, and its effect on order is covered by `add > keeps priority order after many tasks have started`. |
| PriorityQueue appends same-priority and lower-priority items correctly after partial dequeue | skipped | Tests p-queue's exported `PriorityQueue` class. Ours is internal, and its effect on order is covered by `add > keeps priority order after many tasks have started`. |
| PriorityQueue removes the live duplicate id after partial dequeue | skipped | Not built: queueClass |
| PriorityQueue removes by run after partial dequeue | skipped | Tests p-queue's exported `PriorityQueue` class. Ours is internal, and its effect on order is covered by `add > keeps priority order after many tasks have started`. |
| PriorityQueue ignores consumed items with no live match | skipped | Tests p-queue's exported `PriorityQueue` class. Ours is internal, and its effect on order is covered by `add > keeps priority order after many tasks have started`. |
| PriorityQueue stays ordered after cursor compaction | skipped | Tests p-queue's exported `PriorityQueue` class. Ours is internal, and its effect on order is covered by `add > keeps priority order after many tasks have started`. |
| PriorityQueue setPriority works when only one live item remains | skipped | Not built: setPriority |
| PriorityQueue keeps FIFO order among `Infinity` priorities | `add > keeps the order of equal priorities, including Infinity and -Infinity` |  |
| PriorityQueue orders `-Infinity` priorities last and keeps their FIFO order | `add > keeps the order of equal priorities, including Infinity and -Infinity` |  |
| PriorityQueue setPriority with the current priority keeps the position, also after partial dequeue and for `Infinity` or `-Infinity` | skipped | Not built: setPriority |
| PriorityQueue setPriority with the current priority still throws for an unknown id | skipped | Not built: setPriority |
| PriorityQueue setPriority moves an `Infinity` priority item behind the items with its new priority | skipped | Not built: setPriority |
| PriorityQueue keeps FIFO order among `Infinity` priorities inserted after partial dequeue | `add > keeps priority order after many tasks have started` |  |
| PriorityQueue does not keep dequeued items, so their functions can be garbage collected | skipped | Needs `--expose-gc`. Our queue sets a started task's slot to `undefined` so it can be collected. |
| tasks that ran can be garbage collected while other tasks still wait | skipped | Needs `--expose-gc`. Our queue sets a started task's slot to `undefined` so it can be collected. |
| PriorityQueue removes the first item, also after dequeues and compaction, and keeps the order | skipped | Tests p-queue's exported `PriorityQueue` class. Ours is internal, and its effect on order is covered by `add > keeps priority order after many tasks have started`. |

### p-queue 10.0.0 `test/validation.ts`

| Upstream test | Covered by | Notes |
| --- | --- | --- |
| backlog drains before interval reset - triggers rate-limit-cleared | skipped | Not built: rate-limit state |
| timeout validation in constructor | skipped | Not built: timeout |
| timeout validation in add | skipped | Not built: timeout |
| carryover mode with no backlog does not report limited | skipped | Not built: fixed windows |
| priority validation in add rejects non-number values without adding the task | `add > throws on a priority that is not a number` | Different: `add` throws a `RangeError` at once instead of returning a rejected promise. |
| timeout up to the maximum timer delay is accepted, and a larger one is rejected instead of timing out at once | skipped | Not built: timeout |
| interval above the maximum timer delay is rejected instead of resetting every 1 ms | `rate limit > waits out an interval longer than the timer limit instead of firing early` | Different: the interval is accepted, and the timer waits it out in steps. |
| a rejected `NaN` priority does not change the order of the other tasks | `add > a rejected priority does not change the order of the other tasks` |  |
| setPriority validates input, and a rejected priority keeps the order | skipped | Not built: setPriority |
| setPriority with the current priority still throws for a running task | skipped | Not built: setPriority |
| a rejected concurrency value keeps the previous limit | `p-limit > setting an invalid concurrency throws and keeps the previous one` |  |
| intervalCap and concurrency accept large integers and `Infinity`, and reject other values | `` rate limit > rejects invalid interval and intervalCap values, and `p-limit > throws on an invalid concurrency` `` |  |
| interval above the maximum timer delay is accepted when rate limiting is off | `rate limit > rejects invalid interval and intervalCap values` |  |
| interval must be a finite number from 0 and up | `rate limit > rejects invalid interval and intervalCap values` |  |
| setting an invalid `timeout` on the queue throws and keeps the previous value | skipped | Not built: timeout |
| constructor options that are `undefined` use their defaults | `` p-limit > throws on an invalid concurrency (`concurrency: undefined`) `` |  |

### p-queue 10.0.0 `test/types.ts`

| Upstream test | Covered by | Notes |
| --- | --- | --- |
| types | skipped | Type tests. `pnpm check:types` type-checks every test against the declared types. |

### p-queue 10.0.0 `test/rate-limit.ts`

| Upstream test | Covered by | Notes |
| --- | --- | --- |
| rate-limit rapid pause/start cycles | `rate limit > pausing while rate-limited, then resuming, still limits` |  |
| rate-limit preserves the interval count for re-entrant task additions | `rate limit > a task added from inside a running task still counts against the limit` |  |
| rate-limit preserves the interval count for re-entrant active listeners | skipped | Not built: rate-limit state |
| rate-limit edge case with zero-interval | `rate limit > interval 0 turns rate limiting off` |  |
| rate-limit state consistency with sync microtask scheduling | skipped | Not built: rate-limit state |
| rate-limit with queue manipulation during rate-limit event | skipped | Not built: rate-limit state |
| onRateLimit() with microtask race condition | skipped | Not built: rate-limit state |
| onRateLimitCleared() with microtask race condition | skipped | Not built: rate-limit state |
| onRateLimit() called during state transition | skipped | Not built: rate-limit state |
| onRateLimit/onRateLimitCleared rapid transitions | skipped | Not built: rate-limit state |
| onRateLimit() resolves when rate limit is triggered | skipped | Not built: rate-limit state |
| rate-limit does not reset the count when it resumes at the window boundary | `rate limit > frees a start as soon as the oldest one leaves the window` |  |
| rate-limit does not reset the count when a completion starts the next window before the resume timeout fires | `rate limit > frees a start as soon as the oldest one leaves the window` |  |
| rate-limit starts a new window when tasks start exactly at the window end | `rate limit > starts at most intervalCap tasks in any interval` |  |
| rate-limit runs a task that an `empty` listener adds when the last task finishes | skipped | Not built: events |
| aborting waiting tasks that share a signal does not start them or emit `error` | `rate limit > a waiting task that is aborted does not use a start` |  |
| rate limit clears at the window end while paused, also after the queue drained | `rate limit > pausing while rate-limited, then resuming, still limits` |  |
| isRateLimited and isSaturated are up to date right after `.add()` | skipped | Not built: rate-limit state |
| onRateLimitCleared() resolves after `.clear()` or an abort in the same tick as the adds | skipped | Not built: rate-limit state |
| aborting one waiting task lets the next task with a different signal start once the window ended | `rate limit > a waiting task that is aborted does not use a start` |  |
| a waiting task that is skipped because its signal aborted does not use up the interval slot | `rate limit > a waiting task that is aborted does not use a start` |  |
| a paused queue whose rate limit cleared runs the waiting task on `.start()` and still limits the next task | `rate limit > pausing while rate-limited, then resuming, still limits` |  |
| isRateLimited stays true after the window ends while a carried over task still runs | skipped | Not built: rate-limit state |
| a task added after `.clear()` in the same window is rate-limited at once and runs at the window end | `rate limit > clearing a rate-limited queue lets the next task wait only for the window` |  |
| onRateLimit() resolves when an abort clears the rate limit and a synchronous add limits it again before the batched update | skipped | Not built: rate-limit state |
| isRateLimited is false in an `add` listener when the window ended while the queue was idle | skipped | Not built: rate-limit state |
| a paused queue that is not rate-limited does not keep a timer | skipped | Counts Node's active timers. Our queue sets a timer only while a task waits for the window, and `clear()` removes it. |
| a paused rate-limited queue keeps no timer after the window ended | skipped | Counts Node's active timers. Our queue sets a timer only while a task waits for the window, and `clear()` removes it. |
| .clear() on a paused rate-limited queue removes the timer for the window end | skipped | Counts Node's active timers. Our queue sets a timer only while a task waits for the window, and `clear()` removes it. |
| a task that a `rateLimitCleared` listener adds during `.clear()` runs at the window end, and `empty` is not emitted while it waits | skipped | Not built: rate-limit state |
| an `.add()` or an abort right after the window ended, before the resume timeout runs, starts all the waiting tasks that the new window allows | `rate limit > frees a start as soon as the oldest one leaves the window` |  |
| `.onEmpty()` resolves when an `.add()` or an abort at the window end starts the last waiting task | skipped | Not built: onEmpty |

### p-queue 10.0.0 `test/strict.ts`

| Upstream test | Covered by | Notes |
| --- | --- | --- |
| strict mode enforces sliding window rate limiting | `rate limit > starts at most intervalCap tasks in any interval` |  |
| strict mode vs fixed window timing | `rate limit > has no burst at a window boundary` |  |
| strict mode with large intervalCap | `oracle > create matches p-queue > sliding-window rate limit, 5 per 30 ms, concurrency 1` |  |
| strict mode with concurrency limit | `rate limit > works together with a concurrency limit` |  |
| strict mode rate limit events | skipped | Not built: rate-limit state |
| strict mode isRateLimited property | skipped | Not built: rate-limit state |
| strict mode with pause/start | `rate limit > pausing while rate-limited, then resuming, still limits` |  |
| strict mode throws error with interval=0 | `rate limit > interval 0 turns rate limiting off` | There is no `strict` flag, so there is nothing to reject. |
| strict mode with priority | `rate limit > starts the higher priority task first when a slot frees` |  |
| strict mode with onRateLimit() | skipped | Not built: rate-limit state |
| strict mode with carryoverIntervalCount | skipped | Not built: fixed windows |
| strict mode throws error with intervalCap: Infinity | `rate limit > rejects invalid interval and intervalCap values` | `intervalCap: Infinity` turns rate limiting off. |
| strict mode with AbortSignal | `rate limit > a waiting task that is aborted does not use a start` |  |
| strict mode after queue becomes idle | `rate limit > remembers the starts of the current window after the queue is idle` |  |
| strict mode frees a slot as soon as the oldest tick ages out, even with spread ticks | `rate limit > frees a start as soon as the oldest one leaves the window` |  |
| strict mode prevents boundary bursts | `rate limit > has no burst at a window boundary` |  |
| strict mode with long-running tasks | `rate limit > works together with a concurrency limit` |  |
| strict mode isSaturated property | skipped | Not built: rate-limit state |
| strict mode multiple complete intervals | `rate limit > starts at most intervalCap tasks in any interval` |  |
| strict mode precision timing | `rate limit > starts at most intervalCap tasks in any interval` |  |
| strict mode with concurrency: Infinity | `rate limit > starts at most intervalCap tasks in any interval` |  |
| strict mode with timeout option | skipped | Not built: timeout |
| strict mode rapid sequential adds | `rate limit > keeps the limit when many tasks are added over time` |  |
| strict mode clear with pending timeout | `rate limit > clearing a rate-limited queue lets the next task wait only for the window` |  |
| strict mode handles edge case of exactly intervalCap tasks | `rate limit > runs the first intervalCap tasks at once` |  |
| strict mode interleaved add and await | `rate limit > keeps the limit when many tasks are added over time` |  |
| strict mode circular buffer compaction | `rate limit > keeps the limit when many tasks are added over time` |  |

### p-queue 10.0.0 `test/debug.ts`

| Upstream test | Covered by | Notes |
| --- | --- | --- |
| runningTasks returns current running tasks | skipped | Not built: runningTasks |
| runningTasks returns empty array when no tasks running | skipped | Not built: runningTasks |
| runningTasks updates as tasks complete | skipped | Not built: runningTasks |
| runningTasks includes timeout and timeoutRemaining | skipped | Not built: timeout |
| runningTasks returns fresh arrays | skipped | Not built: runningTasks |
| runningTasks timeoutRemaining is undefined when no timeout is set | skipped | Not built: timeout |
| runningTasks timeoutRemaining decreases over time | skipped | Not built: timeout |
| runningTasks handles tasks without IDs | skipped | Not built: runningTasks |
| runningTasks works with interval rate limiting | skipped | Not built: runningTasks |
| isSaturated property detects when queue is at capacity | skipped | Not built: rate-limit state |
| isSaturated with paused queue | skipped | Not built: rate-limit state |
| isSaturated with rate-limited queue | skipped | Not built: rate-limit state |
| isSaturated when concurrency is lowered below the running tasks | skipped | Not built: rate-limit state |
| timeout error has the queue state at the time of the timeout | skipped | Not built: timeout |
| isSaturated when concurrency is raised back after lowering it | skipped | Not built: rate-limit state |
| lowering concurrency below the running tasks starts no waiting task until enough tasks finish | `p-limit > lowering the concurrency lets running tasks finish and starts fewer` |  |
| runningTasks has the last priority after several setPriority calls | skipped | Not built: setPriority |
| runningTasks keeps the priority when setPriority throws for a running task | skipped | Not built: setPriority |
| runningTasks has the priority set by setPriority with a custom queue class | skipped | Not built: setPriority |
| setPriority throws a `ReferenceError` for an id that is not waiting, also with a custom queue class | skipped | Not built: setPriority |

### p-map 7.1.1 `test.js`

| Upstream test | Covered by | Notes |
| --- | --- | --- |
| main | `map > resolves with the results in input order` | Also checked by `oracle > map matches p-map`. |
| concurrency: 1 | `map > runs one call at a time with concurrency 1` |  |
| concurrency: 4 | `map > never runs more calls than the concurrency` |  |
| pMap - never runs more mappers at once than the concurrency limit | `map > never runs more calls than the concurrency` |  |
| pMapIterable - never runs more mappers at once than the concurrency limit | skipped | Not built: pMapIterable |
| handles empty iterable | `map > resolves with an empty array for empty input` |  |
| maps a Set | `map > maps any iterable: a Set, a Map, a string, and an array iterator` |  |
| maps a Map, so the mapper gets the entries | `map > maps any iterable: a Set, a Map, a string, and an array iterator` |  |
| maps a frozen array | `map > maps any iterable: a Set, a Map, a string, and an array iterator` |  |
| pMapSkip for every element | skipped | Not built: pMapSkip |
| maps an empty string | `map > maps any iterable: a Set, a Map, a string, and an array iterator` |  |
| maps a string, one character at a time | `map > maps any iterable: a Set, a Map, a string, and an array iterator` |  |
| continues a generator that was already partly consumed, and closes it | `map > continues a generator that was already partly read` |  |
| closes a generator that was already partly consumed when the mapper throws | `map errors > stops reading the input and closes it after the first error` |  |
| keeps undefined results | `map > keeps undefined results` |  |
| async with concurrency: 2 (random time sequence) | `oracle > map matches p-map` |  |
| async with concurrency: 2 (problematic time sequence) | `oracle > map matches p-map` |  |
| async with concurrency: 2 (out of order time sequence) | `oracle > map matches p-map` |  |
| enforce number in options.concurrency | `map > throws on an invalid concurrency or fn` |  |
| immediately rejects when stopOnError is true | `map errors > rejects at once with the first error when stopOnError is true` |  |
| aggregate errors when stopOnError is false | `map errors > collects every error in input order into an AggregateError when stopOnError is false` |  |
| mapper error stack trace includes the caller | skipped | Tests V8 async stack traces, which p-map rebuilds by hand. We don't promise a stack shape. |
| mapper error stack trace includes the caller for an element mapped after the first ones | skipped | Tests V8 async stack traces, which p-map rebuilds by hand. We don't promise a stack shape. |
| mapper error stack trace includes the caller when stopOnError is false | skipped | Tests V8 async stack traces, which p-map rebuilds by hand. We don't promise a stack shape. |
| mapper error stack trace includes the caller for an async iterable | skipped | Tests V8 async stack traces, which p-map rebuilds by hand. We don't promise a stack shape. |
| pMapSettled - rejection reason stack trace includes the caller | skipped | Tests V8 async stack traces, which p-map rebuilds by hand. We don't promise a stack shape. |
| pMapKeyed - mapper error stack trace includes the caller | skipped | Tests V8 async stack traces, which p-map rebuilds by hand. We don't promise a stack shape. |
| pMapIterable - mapper error stack trace includes the consumer | skipped | Tests V8 async stack traces, which p-map rebuilds by hand. We don't promise a stack shape. |
| pMap - a source whose `next()` settles out of order keeps input order | skipped | `map` calls `next()` on an async input only after the previous call settles, so pulls never overlap or settle out of order. |
| pMap - a source whose `next()` settles out of order keeps input order with concurrency 2 | skipped | `map` calls `next()` on an async input only after the previous call settles, so pulls never overlap or settle out of order. |
| pMap - closes the source when the source itself throws | `map errors > rejects with a source error at the item that throws` | Different: `map` does not call `return()` on an iterator whose `next()` threw, as `for...of` doesn't. |
| pMapIterable - closes the source when the source itself throws | skipped | Not built: pMapIterable |
| pMap - a source that resolves `done` before an earlier item does not drop that item | skipped | `map` calls `next()` on an async input only after the previous call settles, so pulls never overlap or settle out of order. |
| pMap - waits for a pull before `done` | skipped | `map` calls `next()` on an async input only after the previous call settles, so pulls never overlap or settle out of order. |
| pMap - does not wait for a pull after `done` | skipped | `map` calls `next()` on an async input only after the previous call settles, so pulls never overlap or settle out of order. |
| pMap - ignores a rejected pull after `done` | skipped | `map` calls `next()` on an async input only after the previous call settles, so pulls never overlap or settle out of order. |
| pMap - propagates a rejected pull before `done` | skipped | `map` calls `next()` on an async input only after the previous call settles, so pulls never overlap or settle out of order. |
| pMap - ignores a mapper rejection after `done` | skipped | `map` calls `next()` on an async input only after the previous call settles, so pulls never overlap or settle out of order. |
| pMap - excludes an error after `done` from an aggregate | skipped | `map` calls `next()` on an async input only after the previous call settles, so pulls never overlap or settle out of order. |
| pMap - a source that reports `done` and then keeps producing stops at the `done` | skipped | `map` calls `next()` on an async input only after the previous call settles, so pulls never overlap or settle out of order. |
| pMap and pMapIterable agree on a source that reports `done` and then keeps producing | skipped | Not built: pMapIterable |
| pMap - a `pMapSkip` in front of a `done` that lands between two elements | skipped | Not built: pMapSkip |
| pMapIterable - a finite `backpressure` keeps an endless source flowing | skipped | Not built: pMapIterable |
| stopOnError: false keeps a mapper error that is `undefined` | `map errors > keeps errors that are undefined or null when stopOnError is false` |  |
| stopOnError: false keeps a mapper error that is `null` | `map errors > keeps errors that are undefined or null when stopOnError is false` |  |
| stopOnError: false reports the errors in input order | `map errors > collects every error in input order into an AggregateError when stopOnError is false` |  |
| pMapSkip | skipped | Not built: pMapSkip |
| multiple pMapSkips | skipped | Not built: pMapSkip |
| all pMapSkips | skipped | Not built: pMapSkip |
| all mappers should run when concurrency is infinite, even after stop-on-error happened | `` map > runs every call at once by default, and `map errors > aborts the signal of calls still running after the first error` `` |  |
| asyncIterator - main | `map > maps an async iterable` |  |
| asyncIterator - concurrency: 1 | `oracle > map matches p-map > async iterable input, concurrency 1` |  |
| asyncIterator - concurrency: 4 | `oracle > map matches p-map > async iterable input, concurrency 3` |  |
| asyncIterator - handles empty iterable | `map > resolves with an empty array for empty input` |  |
| asyncIterator - async with concurrency: 2 (random time sequence) | `oracle > map matches p-map` |  |
| asyncIterator - async with concurrency: 2 (problematic time sequence) | `oracle > map matches p-map` |  |
| asyncIterator - async with concurrency: 2 (out of order time sequence) | `oracle > map matches p-map` |  |
| asyncIterator - enforce number in options.concurrency | `map > throws on an invalid concurrency or fn` |  |
| asyncIterator - immediately rejects when stopOnError is true | `map errors > closes an async source when a mapper fails` |  |
| asyncIterator - aggregate errors when stopOnError is false | `map errors > rejects with an async source error, also when stopOnError is false` | Also checked by `oracle > map matches p-map`. |
| asyncIterator - pMapSkip | skipped | Not built: pMapSkip |
| asyncIterator - multiple pMapSkips | skipped | Not built: pMapSkip |
| asyncIterator - all pMapSkips | skipped | Not built: pMapSkip |
| asyncIterator - already-started mappers continue after stop-on-error | `map errors > aborts the signal of calls still running after the first error` |  |
| catches exception from source iterator - 1st item | `map errors > rejects with a source error that comes first` |  |
| catches exception from source iterator - 2nd item | `map errors > rejects with a source error at the item that throws` |  |
| catches exception from source iterator - 2nd item after 1st item mapper throw | `map errors > rejects at once with the first error when stopOnError is true` |  |
| catches exception from source iterator - after a mapper resolved with stopOnError: false | `map errors > rejects with an async source error, also when stopOnError is false` |  |
| asyncIterator - catches exception from source iterator with stopOnError: false | `map errors > rejects with an async source error, also when stopOnError is false` |  |
| aggregates rejected input elements when stopOnError is false | skipped | Items are passed to `fn` as they are, without awaiting them (`map > passes items to fn as they are, without awaiting them`). |
| asyncIterator - first mapper error wins after stop-on-error | `map errors > rejects with the first error, and later errors are not unhandled` |  |
| incorrect input type | `map > rejects on input that is not iterable` |  |
| incorrect input type: nullish | `map > rejects on input that is not iterable` |  |
| pMapIterable - incorrect input type: nullish | skipped | Not built: pMapIterable |
| prefers the async iterator when the input has both, like `for await` | `map > prefers the async iterator when the input has both` |  |
| no unhandled rejected promises from mapper throws - infinite concurrency | `map errors > rejects with the first error, and later errors are not unhandled` |  |
| no unhandled rejected promises from mapper throws - concurrency 1 | `map errors > rejects with the first error, and later errors are not unhandled` |  |
| invalid mapper | `map > throws on an invalid concurrency or fn` | Different: argument errors throw at once instead of rejecting. |
| pMapIterable - invalid mapper | skipped | Not built: pMapIterable |
| installs the abort listener while the run is in flight and removes it when it resolves | `map signal > removes its abort listener when it resolves or rejects` |  |
| installs the abort listener while the run is in flight and removes it when it rejects | `map signal > removes its abort listener when it resolves or rejects` |  |
| rejects with the abort reason | `map signal > rejects with the abort reason and aborts the signal passed to fn` |  |
| an already aborted signal still closes the source | `map signal > rejects with an already aborted signal without reading the input` | Different: `map` never opens the iterator, so there is nothing to close. |
| an abort does not wait for a source that is blocked in `next()` | `map signal > does not wait for an async source blocked in next()` |  |
| no mapper runs for an input element that arrives after the abort | `map signal > stops reading the input and closes it on abort` |  |
| an abort wins over the collected errors when stopOnError is false | `map signal > an abort wins over collected errors when stopOnError is false` |  |
| abort by AbortController | `map signal > rejects with the abort reason and aborts the signal passed to fn` |  |
| already aborted signal | `map signal > rejects with an already aborted signal without reading the input` |  |
| pMapIterable | skipped | Not built: pMapIterable |
| pMapIterable - index in mapper | skipped | Not built: pMapIterable |
| pMapIterable - index in mapper (out-of-order-settling promises) | skipped | Not built: pMapIterable |
| pMapIterable - enforce the options | skipped | Not built: pMapIterable |
| pMapIterable - empty | skipped | Not built: pMapIterable |
| pMapIterable - iterable that throws | skipped | Not built: pMapIterable |
| pMapIterable - iterable that rejects with undefined | skipped | Not built: pMapIterable |
| pMapIterable - no unhandled rejection when an in-flight `next()` rejects after an error | skipped | Not built: pMapIterable |
| pMap - no unhandled rejection when an in-flight `next()` rejects after an error | `map errors > closes an async source when a mapper fails` | The pending `next()` always has a rejection handler. |
| pMapIterable - mapper that throws | skipped | Not built: pMapIterable |
| pMapIterable - stop on error | skipped | Not built: pMapIterable |
| pMapIterable - concurrency: 1 | skipped | Not built: pMapIterable |
| pMapIterable - concurrency: 2 | skipped | Not built: pMapIterable |
| pMapIterable - backpressure | skipped | Not built: pMapIterable |
| pMapIterable - reads the next element while the mappers run when `backpressure` allows it | skipped | Not built: pMapIterable |
| pMapIterable - read-ahead never overlaps more `next()` calls than `concurrency` | skipped | Not built: pMapIterable |
| pMapIterable - a chain of stages overlaps reading and mapping | skipped | Not built: pMapIterable |
| pMapIterable - `backpressure` caps the elements read ahead together with the running mappers | skipped | Not built: pMapIterable |
| pMapIterable - does not map the elements waiting for a mapper when `return()` is called | skipped | Not built: pMapIterable |
| pMapIterable - pMapStop does not map the later elements waiting for a mapper | skipped | Not built: pMapIterable |
| pMapIterable - a mapper that throws hands its slot to an earlier element waiting for a mapper | skipped | Not built: pMapIterable |
| pMapIterable - async input, backpressure > concurrency | skipped | Not built: pMapIterable |
| pMapIterable - a skipped result holds its backpressure slot until the consumer passes it | skipped | Not built: pMapSkip |
| pMapIterable - a source whose `next()` settles out of order keeps input order | skipped | Not built: pMapIterable |
| pMapIterable - `preserveOrder: false` yields the results in the order they settle | skipped | Not built: pMapIterable |
| pMapIterable - `preserveOrder: false` keeps mapping while an earlier element is pending | skipped | Not built: pMapIterable |
| pMapIterable - `preserveOrder: false` throws a mapper error while an earlier element is pending | skipped | Not built: pMapIterable |
| pMapIterable - `preserveOrder: false` still applies `backpressure` | skipped | Not built: pMapIterable |
| pMapIterable - `preserveOrder: false` yields every result when the source ends while mappers are running | skipped | Not built: pMapIterable |
| pMapIterable - does not wait for a pull made after the source reported `done` | skipped | Not built: pMapIterable |
| pMapIterable - `preserveOrder: false` yields the item of a pull that settles after a later pull reported `done` | skipped | Not built: pMapIterable |
| pMapIterable - `preserveOrder: false` with pMapSkip | skipped | Not built: pMapIterable |
| pMapIterable - `preserveOrder: false` stops pulling and closes the source when the consumer breaks | skipped | Not built: pMapIterable |
| pMapIterable - `preserveOrder` defaults to `true` | skipped | Not built: pMapIterable |
| pMapIterable - `preserveOrder: false` yields an input element that is a promise when it resolves | skipped | Not built: pMapIterable |
| pMapIterable - `preserveOrder: false` with an async source | skipped | Not built: pMapIterable |
| pMapIterable - `preserveOrder: false` passes the input position as `index` for a source whose `next()` settles out of order | skipped | Not built: pMapIterable |
| pMapIterable - `preserveOrder: false` never runs more mappers at once than the concurrency limit | skipped | Not built: pMapIterable |
| pMapIterable - `preserveOrder: false` with `concurrency: 1` keeps the input order | skipped | Not built: pMapIterable |
| pMapIterable - `preserveOrder: false` yields a completed result before a synchronous source error | skipped | Not built: pMapIterable |
| pMapIterable - `preserveOrder: false` throws a source error while an earlier element is pending | skipped | Not built: pMapIterable |
| pMapIterable - `preserveOrder: false` yields the results that settled before a mapper throws | skipped | Not built: pMapIterable |
| pMapIterable - `preserveOrder: false` does not call the mapper for input that arrives after a mapper throws | skipped | Not built: pMapIterable |
| pMapIterable - `preserveOrder: false` has no unhandled rejection when several mappers throw | skipped | Not built: pMapIterable |
| pMapIterable - `preserveOrder: false` stops at once when `return()` is called while an earlier element is pending | skipped | Not built: pMapIterable |
| pMapIterable - `preserveOrder: false` reads as far ahead as with `preserveOrder` | skipped | Not built: pMapIterable |
| pMapIterable - `preserveOrder: false` with an empty input or only skipped results | skipped | Not built: pMapSkip |
| pMapIterable - `preserveOrder: false` yields falsy results | skipped | Not built: pMapIterable |
| pMapIterable - `preserveOrder: false` yields every result exactly once under random timing | skipped | Not built: pMapIterable |
| pMapIterable - `preserveOrder: false` gives each iteration its own state | skipped | Not built: pMapIterable |
| pMapIterable - `preserveOrder: false` stages can be chained | skipped | Not built: pMapIterable |
| pMapIterable - the iterator it hands out can be consumed with `for await` | skipped | Not built: pMapIterable |
| pMapIterable - two chained stages keep the input order | skipped | Not built: pMapIterable |
| pMapIterable - two consumers of the same result over a re-iterable source | skipped | Not built: pMapIterable |
| pMap - a long input does not build up a deep call stack | `map > maps 100,000 items with a sync fn without overflowing the stack` |  |
| pMap - an input element that resolves to `pMapSkip` is still passed to the mapper | skipped | Not built: pMapSkip |
| pMapIterable - pMapSkip | skipped | Not built: pMapIterable |
| pMapIterable - stops pulling input when `return()` is called while a `next()` is pending | skipped | Not built: pMapIterable |
| pMapIterable - stops pulling input when `throw()` is called while a `next()` is pending | skipped | Not built: pMapIterable |
| pMapIterable - closes the source when `return()` is called while a `next()` is pending | skipped | Not built: pMapIterable |
| pMapIterable - stops pulling input after `return()` is called | skipped | Not built: pMapIterable |
| pMapIterable - stops pulling input after the consumer throws | skipped | Not built: pMapIterable |
| pMapIterable - in-flight mappers still settle after the consumer breaks | skipped | Not built: pMapIterable |
| pMapIterable - does not call the mapper for input that arrives after the consumer breaks | skipped | Not built: pMapIterable |
| pMapIterable - a pending mapper that resolves to \`pMapSkip\` after the consumer breaks does not map the rest of the source (${preserveOrder ? '' : 'un'}ordered) | skipped | Not built: pMapIterable |
| pMapIterable - does not call the mapper for promise input that settles after the consumer breaks | skipped | Not built: pMapIterable |
| pMapIterable - does not call the mapper for input that arrives after a mapper throws | skipped | Not built: pMapIterable |
| pMapIterable - does not call the mapper for input that arrives after `return()` is called | skipped | Not built: pMapIterable |
| pMapIterable - maps pending earlier input when a later mapper throws, and yields it before the error | skipped | Not built: pMapIterable |
| pMapIterable - the first error in input order wins, even when a later one settles first | skipped | Not built: pMapIterable |
| pMapIterable - does not leave a gap for pending earlier input when a later mapper throws | skipped | Not built: pMapIterable |
| pMapIterable - a mapper error stops pulling and mapping past it, but still maps the pending earlier input | skipped | Not built: pMapIterable |
| pMapIterable - with `preserveOrder: false`, a mapper error drops pending input while the consumer is busy | skipped | Not built: pMapIterable |
| pMapIterable - yields pending earlier input before a source error, and does not pull again | skipped | Not built: pMapIterable |
| pMapIterable - closes the source iterator when the consumer breaks | skipped | Not built: pMapIterable |
| pMapIterable - closes the source iterator when the consumer throws | skipped | Not built: pMapIterable |
| pMapIterable - closes the source when a mapper throws while buffered results remain | skipped | Not built: pMapIterable |
| pMapIterable - closes the source iterator when the mapper throws | skipped | Not built: pMapIterable |
| pMapIterable - closes a sync source iterator when `return()` is called | skipped | Not built: pMapIterable |
| pMapIterable - does not close the source iterator before it is exhausted | skipped | Not built: pMapIterable |
| pMapIterable - a source `return()` that rejects does not affect the consumer | skipped | Not built: pMapIterable |
| pMapIterable - a source blocked in `next()` does not block the consumer from stopping | skipped | Not built: pMapIterable |
| closes the source iterator when a mapper rejects | `map errors > closes an async source when a mapper fails` |  |
| closes the source iterator when aborted | `map signal > stops reading the input and closes it on abort` |  |
| does not close the source iterator when it completes | `map errors > does not close a source it read to the end` |  |
| a source `return()` that rejects does not affect the `pMap` rejection | `map errors > a source return() that rejects does not change the rejection` |  |
| pMapIterable - does not call `return()` on an exhausted source iterator | skipped | Not built: pMapIterable |
| does not call `next()` on an exhausted source iterator | `map > does not call next() again after the input is done` |  |
| pMap - does not pull again once a slow async source has reported `done` | `map > does not call next() again after the input is done` |  |
| asyncIterator - does not call `next()` on an exhausted source iterator with stopOnError: false | `map > does not call next() again after the input is done` |  |
| pMapIterable - does not call `next()` on an exhausted source iterator | skipped | Not built: pMapIterable |
| does not call `next()` on an exhausted sync source iterator | `map > does not call next() again after the input is done` |  |
| pMapIterable - does not call `next()` on an exhausted source iterator when mappers skip | skipped | Not built: pMapIterable |
| pMapStop - resolves with the results before the stop | skipped | Not built: pMapStop |
| pMapStop - drops the later results that finished first, and waits for the earlier ones | skipped | Not built: pMapStop |
| pMapStop - at the first element | skipped | Not built: pMapStop |
| pMapStop - handles a discarded input rejection with stopOnError: ${stopOnError} | skipped | Not built: pMapStop |
| pMapStop - at the last element | skipped | Not built: pMapStop |
| pMapStop - does not wait for the mappers of later elements | skipped | Not built: pMapStop |
| pMapStop - the lowest index wins, whatever order the stops settle in | skipped | Not built: pMapStop |
| pMapStop - an error before the stop rejects | skipped | Not built: pMapStop |
| pMapStop - an error after the stop is ignored | skipped | Not built: pMapStop |
| pMapStop - `stopOnError: false` collects only the errors before the stop | skipped | Not built: pMapStop |
| pMapStop - ends an endless sync source with the default concurrency | skipped | Not built: pMapStop |
| pMapStop - stops pulling from an async source and closes it | skipped | Not built: pMapStop |
| pMapStop - does not map a later element that resolves after the stop | skipped | Not built: pMapStop |
| pMapStop - with `pMapSkip` before it | skipped | Not built: pMapStop |
| pMapStop - a mapper that returns a promise of `pMapStop` | skipped | Not built: pMapStop |
| pMapStop - an input element that resolves to `pMapStop` is still passed to the mapper | skipped | Not built: pMapStop |
| pMapStop - from a synchronous mapper that uses the index | skipped | Not built: pMapStop |
| pMapStop - does not close a source that is already done | skipped | Not built: pMapStop |
| pMapStop - closes the source once when several elements stop | skipped | Not built: pMapStop |
| pMapStop - a stop after a rejection does not close the source again | skipped | Not built: pMapStop |
| pMapStop - aborting while an earlier element is still running rejects and closes the source once | skipped | Not built: pMapStop |
| pMapStop - waits for an earlier pull that settles after the stop before it closes the source | skipped | Not built: pMapStop |
| pMapIterable - pMapStop ends the stream after the earlier results | skipped | Not built: pMapIterable |
| pMapIterable - pMapStop with `preserveOrder: false` ends the stream after the results that were ready before it | skipped | Not built: pMapIterable |
| pMapIterable - pMapStop stops pulling and closes the source | skipped | Not built: pMapIterable |
| pMapIterable - pMapStop maps an earlier element that resolves after the stop, but not a later one | skipped | Not built: pMapIterable |
| pMapIterable - pMapStop agrees with pMap | skipped | Not built: pMapIterable |
| pMapIterable - pMapStop ignores an error after the stop, and keeps an earlier element that is still pending | skipped | Not built: pMapIterable |
| pMapIterable - pMapStop ignores an input element that rejects after the stop | skipped | Not built: pMapIterable |
| pMapIterable - pMapStop with `preserveOrder: false` stops pulling and closes the source | skipped | Not built: pMapIterable |
| pMapIterable - pMapStop with `preserveOrder: false` stops pulling while the consumer is busy | skipped | Not built: pMapIterable |
| pMapIterable - pMapStop stops pulling from an async source and closes it | skipped | Not built: pMapIterable |
| pMapIterable - pMapStop, the lowest index wins when a later stop settles last | skipped | Not built: pMapIterable |
| pMapIterable - pMapStop ignores an error from a later element, even when it lands before the stop | skipped | Not built: pMapIterable |
| pMapIterable - pMapStop with `preserveOrder: false` does not throw an error that settled after the stop | skipped | Not built: pMapIterable |
| pMapStop - an error from a later element that lands before the stop rejects | skipped | Not built: pMapStop |
| pMapSettled - settles every element in input order | skipped | Not built: pMapSettled |
| pMapSettled - matches `Promise.allSettled` for the same input | skipped | Not built: pMapSettled |
| pMapSettled - an element that rejects is settled without calling the mapper | skipped | Not built: pMapSettled |
| pMapSettled - respects concurrency | skipped | Not built: pMapSettled |
| pMapSettled - keeps a mapper error that is `undefined` | skipped | Not built: pMapSettled |
| pMapSettled - leaves out `pMapSkip` results | skipped | Not built: pMapSettled |
| pMapSettled - a fulfilled result can hold a value that looks like a settled result | skipped | Not built: pMapSettled |
| pMapSettled - `pMapStop` resolves with the results before the stop | skipped | Not built: pMapSettled |
| pMapSettled - an error after `pMapStop` does not change the results | skipped | Not built: pMapSettled |
| pMapSettled - works with an async iterable | skipped | Not built: pMapSettled |
| pMapSettled - rejects when the source iterator throws | skipped | Not built: pMapSettled |
| pMapSettled - rejects when the signal aborts | skipped | Not built: pMapSettled |
| pMapSettled - validates the arguments | skipped | Not built: pMapSettled |
| pMapSettled - ignores `stopOnError: false` | skipped | Not built: pMapSettled |
| pMapSettled - empty input | skipped | Not built: pMapSettled |
| pMapKeyed - maps each value with its key into a null-prototype object | skipped | Not built: pMapKeyed |
| pMapKeyed - uses the own enumerable string and symbol keys, in property order | skipped | Not built: pMapKeyed |
| pMapKeyed - checks and reads each key in turn, like `Promise.allKeyed` | skipped | Not built: pMapKeyed |
| pMapKeyed - a key like `__proto__` is an own property of the result | skipped | Not built: pMapKeyed |
| pMapKeyed - rejects on a mapper error | skipped | Not built: pMapKeyed |
| pMapKeyed - rejects on a value that rejects, without calling the mapper for it | skipped | Not built: pMapKeyed |
| pMapKeyed - collects the errors in key order with stopOnError: false | skipped | Not built: pMapKeyed |
| pMapKeyed - collects a value that rejects with stopOnError: false | skipped | Not built: pMapKeyed |
| pMapKeyed - a value that rejects before a mapper slot reaches it is not an unhandled rejection | skipped | Not built: pMapKeyed |
| pMapKeyed - `pMapSkip` leaves out the key | skipped | Not built: pMapKeyed |
| pMapKeyed - `pMapStop` keeps the keys before it, and ignores an error from a later key | skipped | Not built: pMapKeyed |
| pMapKeyed - rejects when the signal aborts | skipped | Not built: pMapKeyed |
| pMapKeyed - skips a key that a getter deletes before it is reached, like `Promise.allKeyed` | skipped | Not built: pMapSkip |
| pMapKeyed - rejects when reading a value throws | skipped | Not built: pMapKeyed |
| pMapKeyed - validates the arguments | skipped | Not built: pMapKeyed |
| pMapKeyed - accepts any object, like `Promise.allKeyed` | skipped | Not built: pMapKeyed |
| pMapKeyed - maps a `Map` into a `Map` with the same keys, in the same order | skipped | Not built: pMapKeyed |
| pMapKeyed - uses the entries of a `Map`, not its properties | skipped | Not built: pMapKeyed |
| pMapKeyed - reads a `Map` up front, so a later change does not affect the result | skipped | Not built: pMapKeyed |
| pMapKeyed - `pMapStop` keeps the keys of a `Map` before it | skipped | Not built: pMapKeyed |
| pMapKeyed - empty `Map` | skipped | Not built: pMapKeyed |
| pMapKeyed - empty object | skipped | Not built: pMapKeyed |
| pMapSettledKeyed - settles each key into a null-prototype object | skipped | Not built: pMapSettled |
| pMapSettledKeyed - settles each key of a `Map` into a `Map` | skipped | Not built: pMapSettled |
| pMapSettledKeyed - keeps a mapper error that is `undefined` | skipped | Not built: pMapSettled |
| pMapSettledKeyed - `pMapSkip` and `pMapStop` | skipped | Not built: pMapSettled |
| pMap - with `concurrency: 1`, pulls the next element only after the previous mapper settles | `map > reads an async iterable one item at a time, as slots free up` |  |
| pMap - a finite concurrency starts exactly that many mappers, and each freed slot starts the next element in input order | `oracle > map matches p-map` |  |
| pMap - an element that is still resolving holds its concurrency slot | skipped | Items are passed to `fn` as they are, without awaiting them (`map > passes items to fn as they are, without awaiting them`). |
| pMap - calls the mapper as each element resolves, with its input index | skipped | Items are passed to `fn` as they are, without awaiting them (`map > passes items to fn as they are, without awaiting them`). |
| pMap - calls the mapper with only the element and its index | `map > passes each item its index` | `fn` gets the item and `{ index, signal }`. |
| pMap - with infinite concurrency, starts the mapper of every element of an async source before any of them settles | `oracle > map matches p-map (async iterable input)` |  |
| pMap - `stopOnError: true` rejects with the first error in time, like `Promise.all` | `oracle > map matches p-map (first error)` |  |
| pMap - after a rejection, a mapper that settles later does not pull more input, and the source is closed once | `map errors > stops reading the input and closes it after the first error` |  |
| pMap - `stopOnError: false` reports element errors and mapper errors together, in input order | skipped | Items are passed to `fn` as they are, without awaiting them (`map > passes items to fn as they are, without awaiting them`). |
| pMap - `stopOnError: false` with `concurrency: 1` still maps every element after an error | `oracle > map matches p-map > errors with stopOnError false, concurrency 1, plan ${seed}` |  |
| pMap - `stopOnError: false` with skips and a stop around the errors | skipped | Not built: pMapSkip |
| pMap - throwing `pMapSkip` or `pMapStop` is an error, not a skip or a stop | skipped | Not built: pMapStop |
| pMap - rejects with a value that is not an `Error` as is | `map errors > keeps errors that are undefined or null when stopOnError is false` |  |
| pMap - a mapper that throws synchronously rejects the promise, and `pMap` itself does not throw | `map errors > a synchronous throw rejects the promise instead of throwing` |  |
| pMap - awaits a thenable element and a thenable mapper result | skipped | Items are passed to `fn` as they are, without awaiting them (`map > passes items to fn as they are, without awaiting them`). |
| pMap - maps a sparse array into a dense array, with `undefined` for the holes | `map > maps a sparse array into a dense array, and ignores a generator return value` |  |
| pMap - maps other built-in iterables | `map > maps any iterable: a Set, a Map, a string, and an array iterator` |  |
| pMap - ignores the return value of a generator, like `for...of` | `map > maps a sparse array into a dense array, and ignores a generator return value` |  |
| pMap - maps an async source whose `next()` returns thenables that are not promises | skipped | Tests an async iterator whose `next()` returns non-promise thenables. `map` passes each `next()` result through `Promise.resolve`. |
| subscribes once to a thenable from the source `next()` | skipped | Tests an async iterator whose `next()` returns non-promise thenables. `map` passes each `next()` result through `Promise.resolve`. |
| stops pulling once a thenable from the source `next()` reports `done` | skipped | Tests an async iterator whose `next()` returns non-promise thenables. `map` passes each `next()` result through `Promise.resolve`. |
| subscribes once to each thenable from the source `next()` when pulls overlap | skipped | Tests an async iterator whose `next()` returns non-promise thenables. `map` passes each `next()` result through `Promise.resolve`. |
| rejects with the error of a thenable from the source `next()` that rejects | skipped | Tests an async iterator whose `next()` returns non-promise thenables. `map` passes each `next()` result through `Promise.resolve`. |
| pMap - rejects instead of hanging when the source `next()` returns something that is not an object | `map > rejects when next() returns something that is not an object` |  |
| pMap - maps 100k elements with a sync mapper and the default concurrency | `map > maps 100,000 items with a sync fn without overflowing the stack` |  |
| pMap - maps a 100k element sync generator where most results are skipped | skipped | Not built: pMapSkip |
| pMap - an endless sync source with the default concurrency stops when the first mapper throws | `map errors > ends an endless source when the first call throws` |  |
| pMap - rejects invalid `concurrency` values with a message that names the value | `map > throws on an invalid concurrency or fn` |  |
| pMap - invalid arguments reject instead of throwing, and do not start iterating the input | `map > throws on an invalid concurrency or fn` | Different: argument errors throw at once instead of rejecting, and the input is not read either way. |
| pMap - an already aborted signal does not pull from the source or call the mapper | `map signal > rejects with an already aborted signal without reading the input` |  |
| pMap - rejects with an abort reason that is not an `Error` as is | `map signal > rejects with the abort reason and aborts the signal passed to fn` |  |
| pMap - a mapper that aborts the signal stops the run at once | `map signal > rejects with the abort reason and aborts the signal passed to fn` |  |
| pMap - one signal shared by concurrent runs aborts all of them with the same reason | `map signal > one signal shared by several runs aborts all of them` |  |
| pMap - sequential runs that share a signal never leave an abort listener behind, whichever way they settle | `map signal > removes its abort listener when it resolves or rejects` |  |
| pMap - rejects when an `AbortSignal.timeout()` fires | `map signal > rejects when AbortSignal.timeout fires` |  |
| pMap - elements and mappers that reject after the run has rejected are not unhandled rejections | `map errors > rejects with the first error, and later errors are not unhandled` |  |
| pMap - maps a Node.js readable stream, and destroys it when a mapper throws | skipped | Node-only input. A Node `Readable` is an async iterable, covered by `map > maps an async iterable` and `map errors > closes an async source when a mapper fails`. |
| pMapSettled - throwing `pMapSkip` or `pMapStop`, or an element that rejects with one, gives a rejected result | skipped | Not built: pMapSettled |
| pMapSettled - keeps reasons that are not an `Error` as they are, from the mapper and from the input | skipped | Not built: pMapSettled |
| pMapSettled - a sync throw and a rejected promise from the mapper both give a rejected result, and the run goes on | skipped | Not built: pMapSettled |
| pMapSettled - settles thenable elements and thenable mapper results | skipped | Not built: pMapSettled |
| pMapSettled - reads the source to its end, and does not close it, when every mapper fails | skipped | Not built: pMapSettled |
| pMapSettled - `pMapStop` stops pulling, and closes the source once | skipped | Not built: pMapSettled |
| pMapSettled - rejects when an async source rejects, even after rejected results | skipped | Not built: pMapSettled |
| pMapSettled - settles 100k elements with the default concurrency | skipped | Not built: pMapSettled |
| pMapSettled - matches `Promise.allSettled` for random inputs and concurrencies | skipped | Not built: pMapSettled |
| pMap - with `stopOnError: false`, agrees with `Promise.allSettled` for random inputs and concurrencies | `oracle > map matches p-map (errors with stopOnError false)` |  |
| pMap, pMapSettled, pMapKeyed, and pMapSettledKeyed agree on random plans with skips and stops | skipped | Not built: pMapSkip |
| pMapKeyed and pMapSettledKeyed agree on random plans with skips and stops for a `Map` | skipped | Not built: pMapSkip |
| pMapIterable agrees with pMap on random plans with skips and stops and no errors | skipped | Not built: pMapSkip |
| pMapIterable - `preserveOrder: false` yields only possible results, without duplicates, on random plans with skips and stops | skipped | Not built: pMapSkip |
| pMapIterable throws the first error in input order on random plans with skips, stops, and errors | skipped | Not built: pMapSkip |
| pMapIterable - `backpressure` does not change the results or the error on random plans | skipped | Not built: pMapIterable |
| pMapIterable - a consumer break yields no duplicate or foreign value on random plans | skipped | Not built: pMapIterable |
| pMap, pMapSettled, and pMapIterable reach a source error in pull order on random plans | skipped | Not built: pMapIterable |
| pMapIterable - does not open or read the input until the first `next()` | skipped | Not built: pMapIterable |
| pMapIterable - `return()` before the first `next()` never opens the input | skipped | Not built: pMapIterable |
| pMapIterable - `throw()` before the first `next()` rejects without opening the input | skipped | Not built: pMapIterable |
| pMapIterable - an input whose iterator method throws rejects the first `next()` | skipped | Not built: pMapIterable |
| pMapIterable - each `[Symbol.asyncIterator]()` call is an independent iteration with its own source iterator | skipped | Not built: pMapIterable |
| pMapIterable - a one-shot source is shared by every iteration of the result | skipped | Not built: pMapIterable |
| pMapIterable - concurrent `next()` calls settle in call order with `preserveOrder` | skipped | Not built: pMapIterable |
| pMapIterable - concurrent `next()` calls with `preserveOrder: false` get the results in the order they settle | skipped | Not built: pMapIterable |
| pMapIterable - many concurrent `next()` calls do not read past `backpressure` | skipped | Not built: pMapIterable |
| pMapIterable - `return()` twice closes the source once, and passes its value through | skipped | Not built: pMapIterable |
| pMapIterable - `throw()` after a result closes the source once and stops all work | skipped | Not built: pMapIterable |
| pMapIterable - `throw()` while a `next()` is pending does not map the elements waiting for a mapper | skipped | Not built: pMapIterable |
| pMapIterable - with `preserveOrder: false`, a mapper error stops new work at once, while the consumer is busy | skipped | Not built: pMapIterable |
| pMapIterable - with `concurrency: 1` and `backpressure: 2`, reading the next element overlaps the running mapper | skipped | Not built: pMapIterable |
| pMapIterable - with `concurrency: 1`, at most one element waits for the mapper, whatever the `backpressure` | skipped | Not built: pMapIterable |
| pMapIterable - `backpressure` counts each element until the consumer takes its result | skipped | Not built: pMapIterable |
| pMapIterable - `backpressure: Infinity` lets the results pile up while the consumer is idle | skipped | Not built: pMapIterable |
| pMapIterable - with `preserveOrder`, a slow first element holds back the mapping once `backpressure` is full | skipped | Not built: pMapIterable |
| pMapIterable - a skip-heavy stream never reads further ahead than `backpressure` allows | skipped | Not built: pMapIterable |
| pMapIterable - an element whose promise is still pending counts towards the read-ahead limit | skipped | Not built: pMapIterable |
| pMapIterable - a sync source that throws on the Nth `next()` yields the earlier results, throws, and is not pulled again | skipped | Not built: pMapIterable |
| pMapIterable - an async source that rejects on the Nth `next()` yields the earlier results, throws, and is not pulled again | skipped | Not built: pMapIterable |
| pMapIterable - an input element that rejects is thrown at its position with `preserveOrder`, and when it settles without | skipped | Not built: pMapIterable |
| pMapIterable - a mapper error keeps its identity, also when it is not an `Error` | skipped | Not built: pMapIterable |
| pMapIterable - `preserveOrder: false` yields the results that settled before an error, even when the consumer was not waiting | skipped | Not built: pMapIterable |
| pMapIterable - after a mapper error, the stream is done, the source is closed once, and nothing more is pulled | skipped | Not built: pMapIterable |
| pMapIterable - a source `return()` that throws synchronously or never settles does not affect the consumer | skipped | Not built: pMapIterable |
| pMapIterable - does not close a source that already reported `done`, even when the consumer breaks on the last result | skipped | Not built: pMapIterable |
| pMapIterable - no unhandled rejection from mappers or input elements that reject after the consumer breaks | skipped | Not built: pMapIterable |
| pMapIterable - pMapStop at the first element ends the stream without a result and closes the source once | skipped | Not built: pMapIterable |
| pMapIterable - pMapStop with `preserveOrder: false` still yields the results that settled before it while the consumer was not waiting | skipped | Not built: pMapIterable |
| pMapIterable - pMapSkip and pMapStop together, in both orders | skipped | Not built: pMapIterable |
| pMapIterable - the mapper `index` is the input position for an async source with read-ahead and skips | skipped | Not built: pMapSkip |
| pMapIterable - a long stream yields every result, with any `backpressure` | skipped | Not built: pMapIterable |
| pMapIterable - a long run of skipped results neither stalls nor overflows the stack | skipped | Not built: pMapSkip |
| pMapIterable - a long async source yields every result with `preserveOrder: false` | skipped | Not built: pMapIterable |
| pMapIterable - the `backpressure` validation message | skipped | Not built: pMapIterable |
| pMapIterable - checks the input, the mapper, and `concurrency` before `backpressure` | skipped | Not built: pMapIterable |
| pMapIterable - breaking out of a chained stage closes the upstream stage and its source | skipped | Not built: pMapIterable |
| pMapIterable - an error in an upstream stage reaches the consumer after the earlier results | skipped | Not built: pMapIterable |
| pMapIterable - a slow downstream stage keeps an upstream stage from reading ahead | skipped | Not built: pMapIterable |
| pMapIterable - a `pMap` that stops early closes the `pMapIterable` feeding it, and its source | skipped | Not built: pMapIterable |
| pMapIterable - awaits thenables, as input elements and as mapper results | skipped | Not built: pMapIterable |
| pMapIterable - the return value of a source generator is neither mapped nor yielded | skipped | Not built: pMapIterable |
| pMapKeyed - starts exactly `concurrency` mappers, and one more each time one finishes | skipped | Not built: pMapKeyed |
| pMapKeyed - with concurrency 1, calls the mapper in key order, even when the values resolve in reverse order | skipped | Not built: pMapKeyed |
| pMapKeyed - without a concurrency limit, a value that is still pending does not hold back the mappers of the later keys | skipped | Not built: pMapKeyed |
| pMapKeyed - calls the mapper with only the value and the key | skipped | Not built: pMapKeyed |
| pMapKeyed - reads every value before it returns | skipped | Not built: pMapKeyed |
| pMapKeyed - a change to the input while the mappers run does not affect the result | skipped | Not built: pMapKeyed |
| pMapKeyed - gives an extensible result with writable, enumerable, and configurable properties, even for a frozen or sealed input | skipped | Not built: pMapKeyed |
| pMapKeyed - gives a new object or `Map` on each call, never the input | skipped | Not built: pMapKeyed |
| pMapKeyed - keys with special names keep their place, and the mapper gets them as strings | skipped | Not built: pMapKeyed |
| pMapKeyed - a `then` key whose result is not a function is an ordinary key | skipped | Not built: pMapKeyed |
| pMapSettledKeyed - each settled result is a plain object, and a mapper result that looks like one is still wrapped | skipped | Not built: pMapSettled |
| pMapKeyed - a value that is `pMapSkip` or `pMapStop` is passed to the mapper like any other value | skipped | Not built: pMapKeyed |
| pMapKeyed - a key that is `pMapSkip` or `pMapStop` is an ordinary key | skipped | Not built: pMapKeyed |
| pMapKeyed - a mapper result that is an entry, an array, or a `Map` is kept as the value | skipped | Not built: pMapKeyed |
| pMapKeyed - keeps a key whose mapper returns `undefined` | skipped | Not built: pMapKeyed |
| pMapKeyed - skipping every key gives an empty null-prototype object or an empty `Map` | skipped | Not built: pMapKeyed |
| pMapKeyed - a mapper that returns a promise of `pMapSkip` or a thenable of `pMapStop` | skipped | Not built: pMapKeyed |
| pMapKeyed - a mapper that throws `pMapSkip` or `pMapStop` rejects, it does not skip or stop | skipped | Not built: pMapKeyed |
| pMapKeyed - a mapper that throws synchronously rejects the returned promise | skipped | Not built: pMapKeyed |
| pMapKeyed - awaits a value through nested promises and thenables | skipped | Not built: pMapKeyed |
| pMapKeyed - a value that is a thenable that throws rejects with the error, without calling the mapper for it | skipped | Not built: pMapKeyed |
| pMapKeyed - subscribes to a thenable value right away, before a mapper slot reaches it | skipped | Not built: pMapKeyed |
| pMapKeyed - stopOnError: false collects only the errors before a stop, in key order | skipped | Not built: pMapKeyed |
| pMapKeyed - rejects with the first error to happen, not the first in key order, without waiting for the other mappers | skipped | Not built: pMapKeyed |
| pMapKeyed - with concurrency 1, no mapper runs after a value of a `Map` rejects | skipped | Not built: pMapKeyed |
| pMapKeyed - stopOnError: false collects the errors of a `Map` in key order | skipped | Not built: pMapKeyed |
| pMapKeyed - a `Map` subclass gives a plain `Map` | skipped | Not built: pMapKeyed |
| pMapKeyed - passes on each key of a `Map` as is, with `NaN`, `-0` as `0`, and a promise key that is not awaited | skipped | Not built: pMapKeyed |
| pMapKeyed - a `Map` from another realm is used as an object | skipped | Not built: pMapKeyed |
| pMapKeyed - an input that is a promise is not awaited, like `Promise.allKeyed` | skipped | Not built: pMapKeyed |
| pMapKeyed - a string object, a typed array, and a sparse array give their own enumerable index keys | skipped | Not built: pMapKeyed |
| pMapKeyed - a class instance gives its own fields, not its methods or accessors | skipped | Not built: pMapKeyed |
| pMapKeyed - an object with its own `Symbol.iterator` is mapped by its keys, not iterated | skipped | Not built: pMapKeyed |
| pMapKeyed - puts the symbol keys after the string keys, even when a symbol was added first, and leaves out a non-enumerable symbol | skipped | Not built: pMapKeyed |
| pMapKeyed - maps an object with many keys, in key order | skipped | Not built: pMapKeyed |
| pMapKeyed - a proxy trap that throws rejects, and the values read before it keep their handlers | skipped | Not built: pMapKeyed |
| pMapKeyed - an aborted signal still reads every value, never calls the mapper, and leaves no unhandled rejection | skipped | Not built: pMapKeyed |
| ${method.name} - does not map a pending ${inputType} value after abort | skipped | Not built: pMapKeyed |
| ${method.name} - does not map pending ${inputType} values after a stop, but still maps earlier values | skipped | Not built: pMapKeyed |
| pMapKeyed - an abort while a mapper runs rejects with the reason, starts no more mappers, and removes the listener | skipped | Not built: pMapKeyed |
| pMapSettledKeyed - an abort rejects even when the keys before it have already settled | skipped | Not built: pMapSettled |
| pMapSettledKeyed - ignores `stopOnError: false` | skipped | Not built: pMapSettled |
| pMapSettledKeyed - validates `concurrency` | skipped | Not built: pMapSettled |
| pMapSettledKeyed - starts exactly `concurrency` mappers, and a mapper that throws frees its slot | skipped | Not built: pMapSettled |
| pMapSettledKeyed - `pMapStop` waits for the keys before it, and drops the keys after it that settled first | skipped | Not built: pMapSettled |
| pMapSettledKeyed - `pMapSkip` and `pMapStop` with a `Map` | skipped | Not built: pMapSettled |
| pMapSettledKeyed - keeps a rejection reason that is not an error as is | skipped | Not built: pMapSettled |
| pMapSettledKeyed - empty input | skipped | Not built: pMapSettled |
| pMapSettledKeyed - matches `Promise.allSettled` for random inputs | skipped | Not built: pMapSettled |
| pMapIterable - a pull that rejects after the source reported `done` does not drop an element waiting for a mapper, without `preserveOrder` | skipped | Not built: pMapIterable |
| pMapIterable - a pull that rejects in the same tick as, but after, the `done` of an earlier pull does not drop an element waiting for a mapper, without `preserveOrder` | skipped | Not built: pMapIterable |
| pMapIterable - a later `done` does not move the end of the source, so a pull that rejects between two `done` pulls is dropped, without `preserveOrder` | skipped | Not built: pMapIterable |
| pMapIterable - a pull that rejects before an earlier pull reports `done` still throws, without `preserveOrder` | skipped | Not built: pMapIterable |
| pMapIterable - a mapper error after the source reported `done` still stops an element waiting for a mapper, without `preserveOrder` | skipped | Not built: pMapIterable |
| pMapIterable - a pull that rejects after the source reported `done` is dropped and does not drop an element waiting for a mapper, with `preserveOrder` | skipped | Not built: pMapIterable |

### p-throttle 8.1.1 `tests/main.js`

| Upstream test | Covered by | Notes |
| --- | --- | --- |
| main | `rate limit > throttles a function like p-throttle` |  |
| queue size | `p-limit > counts running and waiting tasks` |  |
| guarantees last call execution with correct context and arguments | `rate limit > throttles a function like p-throttle` | `this` and arguments are passed through a closure. |
| strict mode | `rate limit > starts at most intervalCap tasks in any interval` |  |
| strict mode handles limit 0 without crashing | `` rate limit > rejects invalid interval and intervalCap values (`intervalCap: 0` throws) `` |  |
| strict mode never exceeds the limit within an interval | `rate limit > keeps the limit when many tasks are added over time` |  |
| strict mode enforces spacing between saturated executions | skipped | p-throttle's strict mode spaces saturated calls `interval / limit` apart. Ours starts a call as soon as the window allows, and the oracle checks that it never starts a call later than p-throttle and never exceeds the limit. |
| limits after pause in strict mode | `rate limit > starts a task at once after a long idle period` |  |
| limits after pause in windowed mode | skipped | Not built: fixed windows |
| passes arguments through | `rate limit > throttles a function like p-throttle` |  |
| throw if aborted | `signal > an already aborted signal rejects without adding the task` |  |
| can be aborted | `signal > the queue signal rejects waiting, running, and later tasks` |  |
| can be disabled | skipped | Not built: isEnabled |
| promise rejections are thrown | `rate limit > a task that throws still counts as a start` |  |
| `this` is preserved in throttled function | skipped | Tasks are closures, so `this` is whatever the closure captures. |
| respects limit of ${limit} calls | `rate limit > starts at most intervalCap tasks in any interval` |  |
| handles multiple instances independently | `oracle > rate limit keeps p-throttle strict mode guarantee` |  |
| disable and re-enable functionality | skipped | Not built: isEnabled |
| isEnabled=false does not cancel already queued items | skipped | Not built: isEnabled |
| double abort is safe | `signal > the queue signal rejects waiting, running, and later tasks` |  |
| stability under high load | `rate limit > keeps the limit when many tasks are added over time` |  |
| handles zero interval | `rate limit > interval 0 turns rate limiting off` |  |
| handles zero interval in strict mode with no delays and no onDelay | `rate limit > interval 0 turns rate limiting off` |  |
| invalid options throw | `rate limit > rejects invalid interval and intervalCap values` |  |
| handles simultaneous calls | `rate limit > runs the first intervalCap tasks at once` |  |
| clears queue after abort | `signal > the queue signal rejects waiting, running, and later tasks` |  |
| abort resets windowed counters so next call is not delayed | skipped | Not built: fixed windows |
| abort resets strict counters so next call is not delayed | skipped | Aborting the queue signal rejects every later task too, so there is no next call. `clear()` keeps the window, as `rate limit > clearing a rate-limited queue lets the next task wait only for the window` shows. |
| allows immediate execution with high limit | `rate limit > runs the first intervalCap tasks at once` |  |
| queues calls beyond limit | `rate limit > starts at most intervalCap tasks in any interval` |  |
| resets interval after inactivity | `rate limit > starts a task at once after a long idle period` |  |
| maintains function execution order | `` add > starts tasks in the order they were added with concurrency 1, and `rate limit > starts at most intervalCap tasks in any interval` `` |  |
| handles extremely short intervals | `oracle > rate limit keeps p-throttle strict mode guarantee > 1 per 20 ms` |  |
| windowed with interval 0 executes all immediately without onDelay | `rate limit > interval 0 turns rate limiting off` |  |
| executes immediately for limit greater than calls | `rate limit > runs the first intervalCap tasks at once` |  |
| manages rapid successive calls | `rate limit > keeps the limit when many tasks are added over time` |  |
| onDelay | skipped | Not built: onDelay |
| onDelay receives arguments for blocked calls (limit 0) | skipped | Not built: onDelay |
| onDelay exceptions do not affect execution | skipped | Not built: onDelay |
| onDelay fires for delayed calls even if later aborted | skipped | Not built: onDelay |
| very short intervals preserve order and resolve (windowed and strict) | `oracle > rate limit keeps p-throttle strict mode guarantee > 1 per 20 ms` |  |
| supports errors in the throttled function | `rate limit > a task that throws still counts as a start` |  |
| shared signal abort clears queues (windowed and strict) | `signal > the queue signal rejects waiting, running, and later tasks` |  |
| abort affects only instances using that signal | `signal > aborting several waiting tasks with one controller removes only them` |  |
| signal registration shared across multiple throttled functions | `signal > tasks that share a signal add one listener to it` |  |
| signal registration cleanup after abort | `signal > removes its abort listeners when tasks finish` |  |
| signal registration isolation between different signals | `signal > aborting several waiting tasks with one controller removes only them` |  |
| shared signal abort rejects both blocked and windowed throttles | `signal > the queue signal rejects waiting, running, and later tasks` |  |
| signal registration with complex abort reasons | `signal > aborting while the task waits removes it and rejects with the reason` |  |
| bypassed calls while disabled do not affect future throttling state | skipped | Not built: isEnabled |
| FinalizationRegistry WeakRef behavior with signal registration | skipped | Needs `--expose-gc`. Our queue sets a started task's slot to `undefined` so it can be collected. |
| strict mode handles setTimeout drift | `rate limit > starts at most intervalCap tasks in any interval` | The window is checked with `performance.now()` when the timer fires, so an early or late timer cannot break it. |
| strict weighted mode with sequential scheduling respects future ticks | skipped | Not built: weight |
| strict weighted mode with heavy weights and future ticks | skipped | Not built: weight |
| strict weighted mode with mixed immediate and delayed calls | skipped | Not built: weight |
| weight with interval=0 is rejected | skipped | Not built: weight |
| non-strict mode with interval=0 still works | `rate limit > interval 0 turns rate limiting off` |  |

### p-throttle 8.1.1 `tests/weight-option.js`

| Upstream test | Covered by | Notes |
| --- | --- | --- |
| strict mode with weights - enforces sliding window constraint | skipped | Not built: weight |
| strict mode with weights - never exceeds capacity in sliding window | skipped | Not built: weight |
| strict mode with weights - spacing proportional to weight | skipped | Not built: weight |
| weight function must return a number | skipped | Not built: weight |
| weight must be finite | skipped | Not built: weight |
| weight must be non-negative | skipped | Not built: weight |
| weight must be <= limit | skipped | Not built: weight |
| weight function can throw | skipped | Not built: weight |
| weight of 0 executes immediately | skipped | Not built: weight |
| limit = 0 only allows weight 0 | skipped | Not built: weight |
| weight with interval = 0 throws | skipped | Not built: weight |
| windowed mode with weights enforces limit per window | skipped | Not built: weight |
| strict mode sliding window boundary is exclusive | `rate limit > frees a start as soon as the oldest one leaves the window` | A start exactly `interval` ago no longer counts. |
| strict mode handles mixed weights correctly | skipped | Not built: weight |
| abort clears weighted throttle queue | skipped | Not built: weight |
| very small weights work correctly | skipped | Not built: weight |
| weight equal to limit executes immediately when window empty | skipped | Not built: weight |
| weighted strict mode respects sliding window with queued requests | skipped | Not built: weight |
| weighted strict mode handles burst of different weights | skipped | Not built: weight |
| weight returns NaN | skipped | Not built: weight |
| fractional weights work correctly | skipped | Not built: weight |
| weights exactly filling window execute together | skipped | Not built: weight |
| weight 0 mixed with non-zero weights | skipped | Not built: weight |
| many concurrent small weighted requests | skipped | Not built: weight |
| onDelay callback receives arguments with weights | skipped | Not built: onDelay |
| isEnabled=false bypasses weight limit | skipped | Not built: weight |
| weighted windowed mode handles overflow to next window | skipped | Not built: weight |
| weighted strict mode with single heavy request | skipped | Not built: weight |
| weight calculation with multiple arguments | skipped | Not built: weight |
| weighted strict mode executes when capacity available | skipped | Not built: weight |
| weighted strict mode protects future reservations when smaller calls arrive later | skipped | Not built: weight |
| weighted strict mode revalidates delayed executions after timer drift | skipped | Not built: weight |
| weighted strict mode handles drift for reservations at the same time | skipped | Not built: weight |
| weighted strict mode revalidates timers that fire out of order | skipped | Not built: weight |
| weighted strict mode revalidates a reservation removed as stale | skipped | Not built: weight |
| weighted strict mode accounts for calls arriving after drift | skipped | Not built: weight |
| weighted strict mode aborts a call rescheduled after drift | skipped | Not built: weight |
| weighted strict mode calls onDelay once when drift reschedules a call | skipped | Not built: onDelay |
| weighted strict mode supports reentrant calls after timer drift | skipped | Not built: weight |
| weighted strict mode settles many calls after an initial timer drift | skipped | Not built: weight |

## Benchmarks

p-limit's `benchmark.js` times p-limit alone on simulated workloads with real delays, and p-queue's `bench.ts` times p-queue alone with and without priorities. Neither compares libraries. `queue.bench.ts` measures the overhead per task of `limit` and `create` against p-limit, p-queue, and `Promise.all` with no limit, of a queue with priorities and a shared signal against p-queue, and of `map` against p-map and p-limit's `map`. Each fails if the upstream library is more than 25% faster.
