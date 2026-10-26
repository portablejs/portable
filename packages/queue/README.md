# @portable/queue

Limits how many async tasks run at once, in memory. A queue runs tasks by priority, cancels them with `AbortSignal`, and can cap how many tasks start per interval. You can also pause and resume it. `map` runs a function over an iterable or async iterable with a concurrency limit, and `once` shares one call between concurrent callers. Runs in browsers, Cloudflare Workers, Node 24+, Bun, and Deno.

Replaces [p-limit](https://www.npmjs.com/package/p-limit), [p-queue](https://www.npmjs.com/package/p-queue), [p-map](https://www.npmjs.com/package/p-map), and [p-throttle](https://www.npmjs.com/package/p-throttle). It is not a persistent job queue: tasks are kept in memory and are lost when the process exits.

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
| `[Symbol.asyncDispose]()` | Rejects waiting and running tasks and every later `add` with an `AbortError` `DOMException`, and aborts the `signal` of running tasks, as aborting the queue's `signal` does. It then resolves once the running tasks have settled. It exists only where the runtime has `Symbol.asyncDispose`, and TypeScript sees it only when your `lib` includes `esnext.disposable`. |

The `signal` passed to a task aborts when the task's own `signal` or the queue's `signal` aborts, or when the queue is disposed. If the task is still waiting, it is removed. If it is running, `add` rejects with the abort reason at once, but the task keeps its slot until it settles, so no more than `concurrency` tasks ever run. Pass the signal on to `fetch` or whatever the task awaits so it stops early.

When `clear()` or an abort removes a task that never started, the queue marks the promise from `add` as handled, so ignoring it doesn't cause an unhandled rejection. A task that fails still rejects its promise as usual, so handle it or `await` it.

If you declare a queue with `await using`, it is disposed when the scope ends, so no tasks are left waiting or running if the code in the scope throws:

```ts
async function crawl(urls: string[]) {
  await using queue = Queue.create({ concurrency: 4 });
  return await Promise.all(urls.map((url) => queue.add(({ signal }) => fetch(url, { signal }))));
}
```

In a runtime without `Symbol.asyncDispose`, such as Safari 26, create the queue with a `signal` and abort it to tear the queue down, then `await queue.idle()` to wait for running tasks to settle.

A task added from inside a running task waits for a free slot like any other. If the outer task awaits it with `concurrency: 1`, both wait forever, so give nested work its own queue.

### `Queue.limit(concurrency)`

Returns `create({ concurrency }).add`. Use it when you only need to run tasks.

### `Queue.map(input, fn, options?)`

Calls `fn(item, { index, signal })` on every item of `input`, at most `concurrency` at once, and resolves with the results in input order. `input` is any iterable or async iterable, and is read one item at a time as slots free up, so an endless generator works. Items are passed to `fn` as they are, and a promise item is not awaited first.

| Option | Default | Description |
| --- | --- | --- |
| `concurrency` | `Infinity` | The most calls of `fn` that run at once. |
| `signal` | | Rejects with `signal.reason`, aborts the signal passed to `fn` and stops reading `input`. |
| `stopOnError` | `true` | With `true`, the first error rejects at once, aborts the signal passed to the calls still running and closes `input`. With `false`, every item is mapped and the errors reject as one `AggregateError`, in input order. |

### `Queue.once(fn, { cache })`

Returns a function that calls `fn` once and gives every caller the same promise. After a rejection the next call calls `fn` again. With `cache: false`, only calls made while `fn` is running share its result, which suits a token refresh.

Invalid arguments, such as `concurrency: 0` or a `NaN` priority, throw a `RangeError` at once.

## Rate limits

`interval` and `intervalCap` count task starts in a sliding window: no more than `intervalCap` tasks start in any `interval` ms, so there is no burst of twice the cap at a window boundary. This is p-queue's and p-throttle's `strict` mode. Time comes from `performance.now()`, so a change to the system clock has no effect. A queue with only a rate limit replaces p-throttle:

```ts
const queue = Queue.create({ interval: 1000, intervalCap: 5 });
const throttled = (id: string) => queue.add(() => fetchUser(id));
```

## With @portable/timers

Retries, timeouts, and delays come from @portable/timers. To retry inside one slot, wrap the work in `Timers.retry` inside the task:

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

To time out a single task, call `queue.add(task, { signal: AbortSignal.timeout(5000) })`. That timeout also counts the time the task waits. To time only the run, combine the signals inside the task: `AbortSignal.any([signal, AbortSignal.timeout(5000)])`.

## Types

| Type | Description |
| --- | --- |
| `Queue.Queue` | The object `create` returns. |
| `Queue.Task` | `(context) => value \| Promise<value>`, a function the queue runs. |
| `Queue.Context` | `{ signal }`, what a task receives. The signal aborts when the task's or the queue's `signal` aborts, or when the queue is disposed. |

## Why use this over p-limit, p-queue, p-map, and p-throttle

They run in browsers too, but they are four packages with four APIs, and they have the problems listed below. @portable/queue has one task shape and one cancellation model across all of them, and no dependencies outside `@portable/*`.

- **Per-task overhead is lower.** Running 1,000 tasks with `concurrency: 10` in Node 24 costs about 0.5 µs per task with `limit` or `create`, 0.8 µs with p-limit and 2 µs with p-queue. With priorities and a shared `signal`, it is about 0.6 µs against p-queue's 3.6 µs, because the queue adds one listener to a shared signal, not one per task. `map` costs about 0.1 µs per item against 0.7 µs for p-map and 0.8 µs for p-limit's `map`. `Promise.all` with no limit costs 0.07 µs.
- **An aborted running task keeps its slot.** p-queue frees the slot when a running task's signal aborts, while the task may still be running, so more than `concurrency` tasks can run at once.
- **`clear()` rejects the removed tasks** with an `AbortError`. p-limit's `clearQueue()` leaves their promises pending forever unless `rejectOnClear` is set.
- **`map` stops in-flight work.** After the first error, or when `signal` aborts, the `signal` passed to each running call aborts. p-map gives the mapper no signal, so after the first error the other calls run to the end unless you create your own `AbortController` and pass its signal to them.
- **The rate limit is a sliding window** measured with `performance.now()`. p-queue's default fixed windows let twice `intervalCap` tasks start around a boundary, and its use of `Date.now()` stalls the queue if the clock goes back.
- **Tasks run in the async context of their `add` call**, as in p-limit and p-queue, so in Node a task reads the same `AsyncLocalStorage` values as the code that called `add`.
- p-limit's `limit(fn, a, b)` passes the extra arguments to `fn`. The function from `Queue.limit` takes only a task, so write `limit(() => fn(a, b))`.
- p-queue's `autoStart: false` has no equivalent. Call `pause()` after `create` and `resume()` to start.
- p-queue's `timeout` option has no equivalent. Pass `signal: AbortSignal.timeout(ms)` to `add`, or use `Timers.retry` with `timeout`.
- p-queue's `addAll`, `on('error')`, `onEmpty()`, `onSizeLessThan()`, and `setPriority()` have no equivalent. `test/PARITY.md` lists what to use instead.
- p-map's `pMapSkip`, `pMapIterable`, `pMapSettled`, and `pMapKeyed` have no equivalent. Filter the results of `map` in place of `pMapSkip`.
- `map` passes `{ index, signal }` as the second argument to `fn`, where p-map passes a bare index.
- `map` doesn't await promise items. p-map awaits each item before calling the mapper.
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
