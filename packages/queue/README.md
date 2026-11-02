# @portable/queue

Limits how many async tasks run at once, with priorities, cancellation via `AbortSignal`, and an optional rate limit. It also has `map`, which runs a function over an iterable with a concurrency limit, and `once`, which calls a function once and shares the result. Runs in browsers, Cloudflare Workers, Node 24+, Bun, and Deno.

Replaces [p-limit](https://www.npmjs.com/package/p-limit), [p-queue](https://www.npmjs.com/package/p-queue), [p-map](https://www.npmjs.com/package/p-map), and [p-throttle](https://www.npmjs.com/package/p-throttle). Tasks are kept in memory, so they are lost when the process exits.

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
| `interval` | `0` | The sliding window for `intervalCap`, in ms. `0` turns rate limiting off. |
| `intervalCap` | `Infinity` | The most tasks that start in any `interval` ms. Has no effect without `interval`. |
| `signal` | | Aborting rejects every waiting, running, and later task with `signal.reason`. |

| Member | Description |
| --- | --- |
| `add(task, { priority, signal })` | Adds a task and returns a promise for its result. `task` receives `{ signal }`. Higher `priority` starts first (default `0`). Equal priorities start in the order added. |
| `idle()` | Resolves when no task is waiting or running. Never rejects. A paused queue with waiting tasks isn't idle until `resume()` or `clear()`. |
| `pause()`, `resume()` | Stop and restart starting tasks. Running tasks continue. |
| `clear()` | Removes every waiting task and rejects its promise with an `AbortError` `DOMException`. Running tasks continue. |
| `size` | The number of waiting tasks. |
| `pending` | The number of running tasks. |
| `paused` | Whether the queue is paused. |
| `concurrency` | Read or set the limit. Raising it starts waiting tasks at once. |
| `[Symbol.asyncDispose]()` | Like aborting the queue's `signal`, but with an `AbortError` `DOMException`, and resolves once running tasks have settled. Only where the runtime has `Symbol.asyncDispose`, and typed only when your `lib` includes `esnext.disposable`. |

The `signal` passed to a task aborts when the task's `signal` or the queue's `signal` aborts, or when the queue is disposed. A waiting task is removed. For a running task, `add` rejects at once, but the task keeps its slot until it settles, so no more than `concurrency` tasks ever run. Pass the signal on to `fetch` or whatever the task awaits so it stops early.

If `clear()` or an abort removes a task before it starts, ignoring its rejected promise doesn't cause an unhandled rejection. A task that fails rejects as usual, so handle or `await` it.

A queue declared with `await using` is disposed when the scope ends, even if the code throws:

```ts
async function crawl(urls: string[]) {
  await using queue = Queue.create({ concurrency: 4 });
  return await Promise.all(urls.map((url) => queue.add(({ signal }) => fetch(url, { signal }))));
}
```

Without `Symbol.asyncDispose`, e.g. in Safari 26, create the queue with a `signal`, abort it, and then `await queue.idle()`.

A task that adds and awaits another task on the same queue can deadlock, e.g. with `concurrency: 1`. Give nested work its own queue.

### `Queue.limit(concurrency)`

Returns `create({ concurrency }).add`, for when you only need to run tasks.

### `Queue.map(input, fn, options?)`

Calls `fn(item, { index, signal })` on every item of `input`, at most `concurrency` at once, and resolves with the results in input order.

`input` is any iterable or async iterable. It is read one item at a time as slots free up, so an endless generator works. Promise items are passed to `fn` without being awaited.

| Option | Default | Description |
| --- | --- | --- |
| `concurrency` | `Infinity` | The most calls of `fn` that run at once. |
| `signal` | | Aborting rejects with `signal.reason`, aborts the signal passed to `fn`, and stops reading `input`. |
| `stopOnError` | `true` | If `true`, the first error rejects at once, aborts running calls with that error as `signal.reason`, and closes `input`. If `false`, every item is mapped and the errors reject as one `AggregateError`, in input order. |

If `input`'s `next()` throws, rejects, or returns a non-object, `map` rejects at once with that error and aborts the running calls, whatever `stopOnError` is.

### `Queue.once(fn, { cache })`

Returns a function that calls `fn` once and gives every caller the same promise. After a rejection, the next call calls `fn` again.

With `cache: false`, only calls made while `fn` is running share its result, e.g. for a token refresh. There is no reset, so to start over, create a new `once`.

Invalid arguments throw at once: a `TypeError` for the wrong type, such as a non-number `priority`, and a `RangeError` for a value out of range, such as `concurrency: 0` or a `NaN` priority.

## Rate limits

No more than `intervalCap` tasks start in any `interval` ms. The window slides, like p-queue's and p-throttle's `strict` mode, so there is no burst at a window boundary. Time comes from `performance.now()`, so system clock changes have no effect.

A queue with only a rate limit replaces p-throttle:

```ts
const queue = Queue.create({ interval: 1000, intervalCap: 5 });
const throttled = (id: string) => queue.add(() => fetchUser(id));
```

## With @portable/timers

For retries, timeouts, and delays, use [@portable/timers](https://portablejs.com/packages/timers). To retry within one slot, call `Timers.retry` inside the task:

```ts
import * as Queue from '@portable/queue';
import * as Timers from '@portable/timers';

const queue = Queue.create({ concurrency: 4 });

const response = await queue.add(({ signal }) =>
  Timers.retry(({ signal }) => fetch(url, { signal }), { attempts: 3, timeout: 10_000, signal }),
);
```

The task holds its slot between attempts. To free the slot while waiting, put the queue inside the retry, so each attempt queues again:

```ts
const response = await Timers.retry(
  ({ signal }) => queue.add(({ signal }) => fetch(url, { signal }), { signal }),
  { attempts: 3 },
);
```

To time out a task, pass `{ signal: AbortSignal.timeout(5000) }` to `add`. This includes the time spent waiting. To time only the run, use `AbortSignal.any([signal, AbortSignal.timeout(5000)])` inside the task.

## Types

| Type | Description |
| --- | --- |
| `Queue.Queue` | The object `create` returns. |
| `Queue.Task` | `(context) => value \| Promise<value>`, a function the queue runs. |
| `Queue.Context` | `{ signal }`, what a task receives. |

## Why use this over p-limit, p-queue, p-map, and p-throttle

They are four packages with four APIs. This package has one task shape and one way to cancel across all of them, and no dependencies outside `@portable/*`.

- Per-task overhead is lower. Running 1,000 tasks at `concurrency: 10` costs about 0.5 µs per task with `limit` or `create` in Node 24, against 0.8 µs for p-limit and 2 µs for p-queue. `map` costs about 0.1 µs per item, against 0.7 µs for p-map.
- An aborted running task keeps its slot. p-queue frees the slot while the task may still be running, so more than `concurrency` tasks can run.
- `clear()` rejects the removed tasks with an `AbortError`. p-limit's `clearQueue()` leaves them pending forever unless `rejectOnClear` is set.
- `map` aborts running calls after the first error or when `signal` aborts. p-map gives the mapper no signal, so the other calls run to the end.
- The rate limit is a sliding window measured with `performance.now()`. p-queue's default fixed windows let twice `intervalCap` tasks start around a boundary, and its use of `Date.now()` stalls the queue if the clock goes back.
- Tasks run in the async context of their `add` call, as in p-limit and p-queue, so in Node they see the caller's `AsyncLocalStorage` values.

Differences to check when you switch:

- `Queue.limit`'s function takes only a task. Instead of p-limit's `limit(fn, a, b)`, write `limit(() => fn(a, b))`.
- Instead of p-queue's `autoStart: false`, call `pause()` after `create` and `resume()` to start.
- Instead of p-queue's `timeout`, pass `signal: AbortSignal.timeout(ms)` to `add`, or use `Timers.retry` with `timeout`.
- p-queue's `addAll`, `on('error')`, `onEmpty()`, `onSizeLessThan()`, and `setPriority()` have no equivalent. [PARITY.md](https://github.com/portablejs/portable/blob/main/packages/queue/test/PARITY.md) lists what to use instead.
- p-map's `pMapSkip`, `pMapIterable`, `pMapSettled`, and `pMapKeyed` have no equivalent. Filter the results of `map` instead of using `pMapSkip`.
- `map` passes `{ index, signal }` as the second argument to `fn`. p-map passes a bare index.
- `map` doesn't await promise items. p-map does.
- `map` doesn't call `return()` on an iterator whose `next()` threw, as `for...of` doesn't. p-map does.
- Invalid arguments throw at once. p-queue and p-map reject the returned promise.
- p-throttle's strict mode spaces saturated calls `interval / limit` apart. The queue starts a call as soon as the window has room.

<!-- bench:start -->
<table>
<thead><tr><th align="left">Library</th><th align="right">Ops/s</th><th align="left">Relative</th><th></th></tr></thead>
<tbody>
<tr><th colspan="4" align="left">Run 1,000 tasks, 10 at a time, with <code>Queue.create</code></th></tr>
<tr><td><code>Promise.all</code>, no limit</td><td align="right">14,500</td><td>6.6× faster</td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="160" height="12" alt="" /></td></tr>
<tr><td>@portable/queue</td><td align="right">2,200</td><td></td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="24" height="12" alt="" /></td></tr>
<tr><td>p-queue</td><td align="right">478</td><td>4.6× slower</td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="5" height="12" alt="" /></td></tr>
<tr><th colspan="4" align="left">Run 1,000 tasks, 10 at a time, with <code>Queue.limit</code></th></tr>
<tr><td><code>Promise.all</code>, no limit</td><td align="right">14,500</td><td>6.7× faster</td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="160" height="12" alt="" /></td></tr>
<tr><td>@portable/queue</td><td align="right">2,150</td><td></td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="24" height="12" alt="" /></td></tr>
<tr><td>p-limit</td><td align="right">1,250</td><td>1.7× slower</td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="14" height="12" alt="" /></td></tr>
<tr><th colspan="4" align="left">Run 1,000 tasks with priorities and a signal</th></tr>
<tr><td>@portable/queue</td><td align="right">1,590</td><td></td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="160" height="12" alt="" /></td></tr>
<tr><td>p-queue</td><td align="right">277</td><td>5.7× slower</td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="28" height="12" alt="" /></td></tr>
<tr><th colspan="4" align="left">Map 1,000 items, 10 at a time</th></tr>
<tr><td>@portable/queue</td><td align="right">10,100</td><td></td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="160" height="12" alt="" /></td></tr>
<tr><td>p-map</td><td align="right">1,360</td><td>7.4× slower</td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="22" height="12" alt="" /></td></tr>
<tr><td>p-limit</td><td align="right">1,190</td><td>8.5× slower</td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="19" height="12" alt="" /></td></tr>
</tbody>
</table>

Operations per second from `pnpm bench`, higher is better, in Node 24.22.0, on Intel(R) Xeon(R) Processor @ 2.10GHz (4 cores). Each benchmark lists only the libraries that can do the same work, fastest first. The relative speed compares each library with @portable/queue, and the bars are scaled to the fastest library.

| Library | Version | Minified and gzipped | Runtime dependencies | Node built-ins | TypeScript types |
| --- | --- | ---: | ---: | --- | --- |
| @portable/queue | – | 2.3 kB | 1 | none | included |
| p-limit | 7.3.3 | 1.0 kB | 1 | none | included |
| p-queue | 10.0.0 | 3.5 kB | 0 | none | included |
| p-map | 7.1.1 | 2.1 kB | 0 | none | included |
| `Promise.all`, no limit | – | built in | – | none | – |

Sizes cover the imports in the usage example, or the equivalent imports of each library, bundled for the browser by `scripts/bundle-size.ts`. Runtime dependencies count every package installed with the published package. A library that uses Node built-ins needs polyfills in a browser and the `nodejs_compat` flag in Cloudflare Workers.
<!-- bench:end -->
