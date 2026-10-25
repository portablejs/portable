# @portable/queue

Limits how many async tasks run at once, in memory. A queue runs tasks by priority, pauses and resumes, cancels with `AbortSignal`, and can cap how many tasks start per interval. `map` runs a function over an iterable or async iterable with a concurrency limit, and `once` shares one call between concurrent callers. Runs in browsers, Cloudflare Workers, Deno, Bun and Node 24+.

Replaces [p-limit](https://www.npmjs.com/package/p-limit), [p-queue](https://www.npmjs.com/package/p-queue), [p-map](https://www.npmjs.com/package/p-map) and [p-throttle](https://www.npmjs.com/package/p-throttle). It is not a persistent job queue: tasks are kept in memory and are lost when the process exits.

```sh
npm install @portable/queue
```

```ts
import * as Queue from '@portable/queue';

const queue = Queue.create({ concurrency: 4 });
const pages = await Promise.all(
  urls.map((url) => queue.add(async ({ signal }) => (await fetch(url, { signal })).text())),
);

const limit = Queue.limit(4);
const sizes = await Promise.all(files.map((file) => limit(() => upload(file))));

const thumbnails = await Queue.map(images, (image, { signal }) => resize(image, { signal }), {
  concurrency: 2,
});

const connect = Queue.once(() => openDatabase(url));
const db = await connect();
```

## API

### `Queue.create(options?)`

Returns a queue object.

| Option | Default | Description |
| --- | --- | --- |
| `concurrency` | `Infinity` | The most tasks that run at once. A positive integer or `Infinity`. |
| `interval` | `0` | The length of the sliding window for `intervalCap`, in ms. `0` turns rate limiting off. |
| `intervalCap` | `Infinity` | The most tasks that start in any `interval` ms. |
| `signal` | | Aborting it rejects every waiting and running task with `signal.reason`, and every task added later. |

| Member | Description |
| --- | --- |
| `add(task, { priority, signal })` | Adds a task and returns a promise for its result. `task` receives `{ signal }`. Higher `priority` starts first (default `0`), and equal priorities start in the order they were added. |
| `idle()` | Resolves when no task is waiting or running. It never rejects. |
| `pause()`, `resume()` | Stop and restart starting tasks. Running tasks continue. |
| `clear()` | Removes every waiting task and rejects its promise with an `AbortError` `DOMException`. Running tasks continue. |
| `size` | The number of waiting tasks. |
| `pending` | The number of running tasks. |
| `paused` | Whether the queue is paused. |
| `concurrency` | Read or set the limit. Raising it starts waiting tasks at once. |

The `signal` passed to a task aborts when the task's own `signal` or the queue's `signal` aborts. If the task is still waiting, it is removed. If it is running, `add` rejects with the abort reason at once, but the task keeps its slot until it settles, so no more than `concurrency` tasks ever run. Pass the signal on to `fetch` or whatever the task awaits so it stops early.

When `clear()` or an abort removes a task that never started, the queue marks the promise from `add` as handled, so ignoring it doesn't cause an unhandled rejection. A task that fails still rejects its promise as usual, so handle it or `await` it.

A task added from inside a running task waits for a free slot like any other. If the outer task awaits it with `concurrency: 1`, both wait forever, so give nested work its own queue.

### `Queue.limit(concurrency)`

Returns `create({ concurrency }).add`, for code that only needs to run tasks.

### `Queue.map(input, fn, options?)`

Calls `fn(item, { index, signal })` on every item of `input`, at most `concurrency` at once, and resolves with the results in input order. `input` is any iterable or async iterable, and is read one item at a time as slots free up, so an endless generator works. Items are passed to `fn` as they are, and a promise item is not awaited first.

| Option | Default | Description |
| --- | --- | --- |
| `concurrency` | `Infinity` | The most calls of `fn` that run at once. |
| `signal` | | Rejects with `signal.reason`, aborts the signal passed to `fn` and stops reading `input`. |
| `stopOnError` | `true` | With `true`, the first error rejects at once, aborts the signal passed to the calls still running and closes `input`. With `false`, every item is mapped and the errors reject as one `AggregateError`, in input order. |

### `Queue.once(fn, { cache })`

Returns a function that calls `fn` once and gives every caller the same promise. After a rejection the next call calls `fn` again. With `cache: false`, only callers that arrive while `fn` is running share its result, which suits a token refresh.

Invalid arguments, such as `concurrency: 0` or a `NaN` priority, throw a `RangeError` at once.

## Rate limits

`interval` and `intervalCap` count task starts in a sliding window: no more than `intervalCap` tasks start in any `interval` ms, so there is no burst of twice the cap at a window boundary. This is p-queue's and p-throttle's `strict` mode. Time comes from `performance.now()`, so a change to the system clock has no effect. A queue with only a rate limit replaces p-throttle:

```ts
const queue = Queue.create({ interval: 1000, intervalCap: 5 });
const throttled = (id: string) => queue.add(() => fetchUser(id));
```

## With `@portable/timers`

Retries, timeouts and delays come from `@portable/timers`. To retry inside one slot, wrap the work in `Timers.retry` inside the task:

```ts
import * as Queue from '@portable/queue';
import * as Timers from '@portable/timers';

const queue = Queue.create({ concurrency: 4 });

const response = await queue.add(({ signal }) =>
  Timers.retry(({ signal }) => fetch(url, { signal }), { attempts: 3, timeout: 10_000, signal }),
);
```

The task holds its slot during the waits between attempts. To give the slot back while waiting, put the queue inside the retry so each attempt queues again:

```ts
const response = await Timers.retry(
  ({ signal }) => queue.add(({ signal }) => fetch(url, { signal }), { signal }),
  { attempts: 3 },
);
```

A timeout for a single task is `queue.add(task, { signal: AbortSignal.timeout(5000) })`, which also counts the time the task waits. To time only the run, combine the signals inside the task: `AbortSignal.any([signal, AbortSignal.timeout(5000)])`.

## Types

| Type | Description |
| --- | --- |
| `Queue.Queue` | The object `create` returns. |
| `Queue.Task` | `(context) => value \| Promise<value>`, a function the queue runs. |
| `Queue.Context` | `{ signal }`, what a task receives. The signal aborts when the task's or the queue's `signal` aborts. |

## Why use this over p-limit, p-queue and p-map

They run in browsers too, but they are three packages with three APIs, and they have the problems listed below. `@portable/queue` has one task shape and one cancellation model across all of them, and no dependencies.

- **Per-task overhead is lower.** Running 1,000 tasks with `concurrency: 10` in Node 24 costs about 0.5 µs per task with `limit` or `create`, 1 µs with p-limit and 2 µs with p-queue. With priorities and a shared `signal`, it is about 0.6 µs against p-queue's 3.6 µs, because tasks that share a signal add one listener to it. `map` costs about 0.1 µs per item against 1 µs for p-map and p-limit's `map`. `Promise.all` with no limit costs 0.07 µs.
- **An aborted running task keeps its slot.** p-queue frees the slot when a running task's signal aborts, while the task may still be running, so more than `concurrency` tasks can run at once.
- **`clear()` rejects the removed tasks** with an `AbortError`. p-limit's `clearQueue()` leaves their promises pending forever unless `rejectOnClear` is set.
- **`map` stops in-flight work.** After the first error, or when `signal` aborts, the `signal` passed to each running call aborts. p-map gives the mapper no signal, so after the first error the other calls run to the end unless the caller wires up its own `AbortController`.
- **The rate limit is a sliding window** measured with `performance.now()`. p-queue's default fixed windows let twice `intervalCap` tasks start around a boundary, and its use of `Date.now()` stalls the queue if the clock goes back.
- **Tasks run in the async context of their `add` call**, as in p-limit and p-queue, so `AsyncLocalStorage` values carry over in Node.
- p-limit's `limit(fn, a, b)` passes the extra arguments to `fn`. The function from `Queue.limit` takes only a task, so write `limit(() => fn(a, b))`.
- p-queue's `autoStart: false` has no equivalent. Call `pause()` after `create` and `resume()` to start.
- p-queue's `timeout` option has no equivalent. Pass `signal: AbortSignal.timeout(ms)` to `add`, or use `Timers.retry` with `timeout`.
- p-queue's `addAll`, `on('error')`, `onEmpty()`, `onSizeLessThan()` and `setPriority()` have no equivalent. `test/PARITY.md` lists what to use instead.
- p-map's `pMapSkip`, `pMapIterable`, `pMapSettled` and `pMapKeyed` have no equivalent. Filter the results of `map` in place of `pMapSkip`.
- `map` passes `{ index, signal }` as the second argument to `fn`, where p-map passes a bare index.
- `map` doesn't await promise items. p-map awaits each item before calling the mapper.
- `map` doesn't call `return()` on an iterator whose `next()` threw, as `for...of` doesn't. p-map does.
- Invalid arguments throw at once. p-queue and p-map reject the returned promise.
- p-throttle's strict mode spaces saturated calls `interval / limit` apart. The queue starts a call as soon as the window has room.

<!-- bench:start -->
| | @portable/queue | p-limit | p-queue | p-map | `Promise.all`, no limit |
| --- | ---: | ---: | ---: | ---: | ---: |
| Run 1,000 tasks, 10 at a time, with `Queue.create` | 2,200 | – | 478 | – | 14,500 |
| Run 1,000 tasks, 10 at a time, with `Queue.limit` | 2,150 | 1,250 | – | – | 14,500 |
| Run 1,000 tasks with priorities and a signal | 1,590 | – | 277 | – | – |
| Map 1,000 items, 10 at a time | 10,100 | 1,190 | – | 1,360 | – |

Operations per second from `pnpm bench`, higher is better, in Node 24.22.0, on Intel(R) Xeon(R) Processor @ 2.10GHz (4 cores). A dash means the library has no equivalent.

| | @portable/queue | p-limit | p-queue | p-map | `Promise.all`, no limit |
| --- | --- | --- | --- | --- | --- |
| Minified and gzipped | 2.1 kB | 1.0 kB | 3.5 kB | 2.1 kB | built in |
| Runtime dependencies | 0 | 1 | 0 | 0 | – |
| Node built-ins used | none | none | none | none | none |
| TypeScript types | included | included | included | included | – |
| Version compared | – | 7.3.3 | 10.0.0 | 7.1.1 | – |

Sizes cover the imports in the usage example, or the equivalent imports of each library, bundled for the browser by `scripts/bundle-size.ts`. Runtime dependencies count every package installed with the published package. A library that uses Node built-ins needs polyfills in a browser and the `nodejs_compat` flag in Cloudflare Workers.
<!-- bench:end -->
