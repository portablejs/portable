# @portable/timers

Sleep, retry with backoff, poll until a value is ready, and debounce or throttle a function. Every function takes an `AbortSignal` and leaves no timers behind. Runs in browsers, Cloudflare Workers, Node 24+, Bun, and Deno.

Replaces [delay](https://www.npmjs.com/package/delay), [p-retry](https://www.npmjs.com/package/p-retry), [async-retry](https://www.npmjs.com/package/async-retry), [p-wait-for](https://www.npmjs.com/package/p-wait-for), [lodash.debounce](https://www.npmjs.com/package/lodash.debounce), [lodash.throttle](https://www.npmjs.com/package/lodash.throttle), [throttle-debounce](https://www.npmjs.com/package/throttle-debounce), [p-debounce](https://www.npmjs.com/package/p-debounce), and [perfect-debounce](https://www.npmjs.com/package/perfect-debounce).

```sh
npm install @portable/timers
```

```ts
import * as Timers from '@portable/timers';

await Timers.sleep(1000);

const response = await Timers.retry(({ signal }) => fetch(url, { signal }), {
  attempts: 5,
  timeout: 10_000,
});

const order = await Timers.poll(
  async () => {
    const order = await getOrder(id);
    return order.status === 'paid' ? order : undefined;
  },
  { delay: 2000, signal: AbortSignal.timeout(120_000) },
);

const save = Timers.debounce((text: string) => fetch('/draft', { method: 'PUT', body: text }), 500);
const saved = await save(editor.value);
```

## `sleep(ms, options)`

Resolves after `ms` milliseconds, using `scheduler.wait` where the runtime has it (e.g. Cloudflare Workers) and `setTimeout` otherwise.

```ts
await Timers.sleep(500);
await Timers.sleep(60_000, { signal }); // rejects with signal.reason when aborted
await Timers.sleep(Infinity, { signal }); // waits until aborted
```

| Option | Description |
| --- | --- |
| `signal` | When it aborts, the promise rejects with `signal.reason` and the timer is cleared. |

A negative `ms` counts as 0, and `NaN` rejects with a `RangeError`. Delays over `setTimeout`'s limit of 2³¹ − 1 ms (about 24.8 days) work.

## `retry(fn, options)`

Calls `fn` until it returns without throwing, and resolves with its value. If every attempt fails, it rejects with the last error, unchanged.

`fn` receives `{ attempt, signal }`: the attempt number, starting at 1, and a signal to pass to `fetch` or similar.

| Option | Default | Description |
| --- | --- | --- |
| `attempts` | `3` | Total number of calls, including the first. `Infinity` retries until success or abort. |
| `delay` | `{ initial: 200, max: 10_000 }` | Wait before each retry. See [Delays](#delays). |
| `retryIf` | retry every error | `(error, { attempt }) => boolean \| Promise<boolean>`. Called before each retry, not after the last attempt. Return `false` to stop and reject with `error`. |
| `onRetry` | | `(error, { attempt, delay }) => void \| Promise<void>`. Called before each wait, after `retryIf` allows the retry. Useful for logging. `retry` awaits a returned promise, and rejects if it throws. |
| `timeout` | `Infinity` | Time limit for each attempt, in ms. The attempt's `signal` aborts with a `TimeoutError` `DOMException`, and the attempt is retried like any other failure. |
| `signal` | | Stops retrying and rejects with `signal.reason`, also during an attempt or a delay. |

`retry` rejects with a `RangeError` if `attempts` isn't a positive integer or `Infinity`, or if `timeout` is negative or `NaN`.

```ts
class HttpError extends Error {
  constructor(readonly response: Response) {
    super(`HTTP ${response.status}`);
  }
}

const response = await Timers.retry(
  async ({ signal }) => {
    const response = await fetch(url, { signal });
    if (!response.ok) {
      throw new HttpError(response);
    }
    return response;
  },
  {
    attempts: 5,
    timeout: 10_000,
    signal: AbortSignal.timeout(60_000), // a limit on the whole call
    retryIf: (error) => !(error instanceof HttpError) || error.response.status >= 500 || error.response.status === 429,
  },
);
```

### Wait as long as the server asks

A `delay` function receives the error, so it can return the server's `Retry-After` value, which is either seconds or an HTTP date.

```ts
function retryAfter(response: Response): number | undefined {
  const value = response.headers.get('retry-after');
  if (value === null) {
    return undefined;
  }
  const seconds = Number(value);
  const ms = Number.isNaN(seconds) ? Date.parse(value) - Date.now() : seconds * 1000;
  return Number.isNaN(ms) ? undefined : ms;
}

const response = await Timers.retry(
  async ({ signal }) => {
    const response = await fetch(url, { signal });
    if (response.status === 429 || response.status === 503) {
      throw new HttpError(response);
    }
    return response;
  },
  {
    attempts: 5,
    delay: ({ attempt, error }) => {
      const wait = error instanceof HttpError ? retryAfter(error.response) : undefined;
      return wait ?? Math.random() * Math.min(10_000, 200 * 2 ** (attempt - 1));
    },
  },
);
```

A date in the past gives a negative wait, which retries at once.

## `poll(fn, options)`

Calls `fn` until it returns a value other than `undefined`, and resolves with that value. `null`, `false`, and `0` end the poll.

`fn` receives `{ attempt, signal }`, as in `retry`. If `fn` throws, the poll rejects with that error. To retry failed checks, call `retry` inside `fn`.

| Option | Default | Description |
| --- | --- | --- |
| `delay` | `1000` | Wait after each check that returns `undefined`. See [Delays](#delays). |
| `signal` | | Stops polling and rejects with `signal.reason`, also during a check, and aborts the `signal` passed to that check. |

`poll` can run indefinitely, so pass a deadline with `signal: AbortSignal.timeout(ms)`. It rejects with a `TimeoutError` `DOMException`.

## `debounce(fn, ms, options)` and `throttle(fn, ms, options)`

`debounce` wraps `fn` so that a burst of calls invokes it once, `ms` after the last call, with the last call's arguments and `this`. `throttle` invokes `fn` at most once every `ms`: on the first call, then at the end of each window that had more calls. Both match lodash's timing.

Each call returns a promise of the invocation it was merged into, so every call in a burst resolves with the same value or rejects with the same error. With `trailing: false`, a dropped call resolves with its window's leading invocation.

If you don't await or catch the promise, an error from `fn` becomes an unhandled rejection.

```ts
const save = Timers.debounce(async (text: string) => {
  const response = await fetch('/draft', { method: 'PUT', body: text });
  return response.ok;
}, 500);

editor.addEventListener('input', () => save(editor.value).catch(console.error));
window.addEventListener('beforeunload', () => save.flush());

const ok = await save(editor.value); // true once the save that includes this text finishes
```

| Option | `debounce` default | `throttle` default | Description |
| --- | --- | --- | --- |
| `leading` | `false` | `true` | Invoke on the first call of a burst. |
| `trailing` | `true` | `true` | Invoke `ms` after the last call (`debounce`) or at the end of the window (`throttle`), with the last call's arguments. |
| `maxWait` | | | `debounce` only. Longest time a call waits, however often calls arrive. `throttle` is `debounce` with `maxWait: ms`. |
| `signal` | | | When it aborts, waiting calls reject with `signal.reason`, and later calls reject at once without invoking `fn`. |

Both throw a `RangeError` if `leading` and `trailing` are both `false`, or if `ms` or `maxWait` is `NaN` or above 2³¹ − 1. A negative `ms` counts as 0, and a `maxWait` below `ms` counts as `ms`.

The returned function also has:

| Member | Description |
| --- | --- |
| `cancel()` | Drops the waiting invocation. Calls waiting for it reject with an `AbortError` `DOMException`, which doesn't raise an unhandled rejection. Later calls work as usual. |
| `flush()` | Runs the waiting invocation now and returns a promise of its result, or `undefined` if nothing waits. For `throttle`, and `debounce` with `maxWait`, the window restarts at the flush, as in lodash, so a call before it ends runs when it ends. |
| `pending` | `true` while the function waits out `ms` after a call. |
| `[Symbol.dispose]()` | Calls `cancel()`, so `using save = Timers.debounce(...)` drops the waiting invocation when the scope ends. Exists only where the runtime has `Symbol.dispose`. TypeScript sees it only when your `lib` includes `esnext.disposable`. |

## Delays

`retry` and `poll` take the same `delay` option, of type `Timers.Delay`:

| Value | Wait before the next attempt |
| --- | --- |
| `2000` | A fixed 2000 ms. |
| `{ initial, max, factor?, jitter? }` | Exponential backoff. After attempt `n` the cap is `min(max, initial * factor ** (n - 1))`, and `factor` defaults to 2. By default the wait is random between 0 and the cap ([full jitter](https://aws.amazon.com/blogs/architecture/exponential-backoff-and-jitter/)). With `jitter: false` it is the cap. |
| `({ attempt, error }) => ms` | The returned wait. 0 or less starts the next attempt at once, and `NaN` rejects with a `RangeError`. `attempt` is the attempt that just finished. `error` is what it threw in `retry`, and `undefined` in `poll`. |

`Timers.backoff(delay)` returns the function that `retry` and `poll` use to compute each wait, so you can wait the same way. It throws a `RangeError` for a negative wait, `initial`, or `max`, or a `factor` that isn't a positive finite number. [@portable/websockets](https://portablejs.com/packages/websockets) and [@portable/sse](https://portablejs.com/packages/sse) reconnect with it.

```ts
const next = Timers.backoff({ initial: 1000, max: 30_000, jitter: false });
next({ attempt: 1 }); // 1000
next({ attempt: 3 }); // 4000
```

`poll` always sets a timer before the next check, even for a wait of 0, so other timers and a timeout signal can still run. `retry` with a wait of 0 starts the next attempt without a timer.

## Types

| Type | Description |
| --- | --- |
| `Timers.Delay` | The `delay` option. See [Delays](#delays). |
| `Timers.Backoff` | `{ initial, max, factor?, jitter? }`, exponential backoff. |
| `Timers.Attempt` | `{ attempt, error? }`, what a `delay` function receives. |
| `Timers.Context` | `{ attempt, signal }`. `retry` and `poll` pass it to `fn`. |
| `Timers.Debounced` | The function `debounce` and `throttle` return, with `cancel`, `flush`, and `pending`. |
| `Timers.retry.Retry` | `{ attempt, delay }`, what `onRetry` receives. |
| `Timers.Instant` | `Date \| { readonly epochMilliseconds: number }`, the type of options such as `now` and `expiresAt` in other `@portable/*` packages. You can pass a `Temporal.Instant` or `Temporal.ZonedDateTime`. |

## Why use this over p-retry, async-retry, p-wait-for, and delay

`retry` and `poll` share one `delay` option and one `{ attempt, signal }` context.

- Ten attempts with no delay run about twice as fast as p-retry on Node, and at the same speed with a `signal`.
- An abort settles the call at once. p-retry waits for the running attempt to settle first.
- `timeout` limits each attempt. None of the four libraries can.
- Errors pass through unchanged. p-retry wraps a thrown string in a `TypeError`, and retries a `TypeError` only if its message is on a list of known network errors, which misses e.g. Chrome's failed dynamic `import()` (p-retry #85).
- When `retryIf` returns `false`, `fn` is never called again. After async-retry's `bail()`, attempts can continue in the background (async-retry #69).
- Waits longer than about 24.8 days work. p-retry and p-wait-for pass them to `setTimeout`, which fires after 1 ms instead.

<!-- bench:start -->
<table>
<thead><tr><th align="left">Library</th><th align="right">Ops/s</th><th align="left">Relative</th><th></th></tr></thead>
<tbody>
<tr><th colspan="4" align="left">Retry 10 attempts</th></tr>
<tr><td>@portable/timers</td><td align="right">112,000</td><td></td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="160" height="12" alt="" /></td></tr>
<tr><td>p-retry</td><td align="right">58,600</td><td>1.9× slower</td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="84" height="12" alt="" /></td></tr>
<tr><td>async-retry</td><td align="right">98.1</td><td>1,100× slower</td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="2" height="12" alt="" /></td></tr>
<tr><th colspan="4" align="left">Retry 10 attempts with a signal</th></tr>
<tr><td>@portable/timers</td><td align="right">57,800</td><td></td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="160" height="12" alt="" /></td></tr>
<tr><td>p-retry</td><td align="right">54,600</td><td>1.1× slower</td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="151" height="12" alt="" /></td></tr>
<tr><th colspan="4" align="left">Poll until the 10th check succeeds</th></tr>
<tr><td>@portable/timers</td><td align="right">99.2</td><td></td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="160" height="12" alt="" /></td></tr>
<tr><td>p-wait-for</td><td align="right">98.6</td><td>same</td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="159" height="12" alt="" /></td></tr>
<tr><th colspan="4" align="left">Sleep for 1 ms</th></tr>
<tr><td>@portable/timers</td><td align="right">1,080</td><td></td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="160" height="12" alt="" /></td></tr>
<tr><td>delay</td><td align="right">1,070</td><td>same</td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="159" height="12" alt="" /></td></tr>
<tr><th colspan="4" align="left">Debounce a burst of 1,000 calls</th></tr>
<tr><td>lodash.debounce</td><td align="right">16,100</td><td>1.1× faster</td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="160" height="12" alt="" /></td></tr>
<tr><td>@portable/timers</td><td align="right">14,400</td><td></td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="143" height="12" alt="" /></td></tr>
<tr><td>perfect-debounce</td><td align="right">4,610</td><td>3.1× slower</td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="46" height="12" alt="" /></td></tr>
<tr><td>throttle-debounce</td><td align="right">4,600</td><td>3.1× slower</td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="46" height="12" alt="" /></td></tr>
<tr><td>p-debounce</td><td align="right">3,170</td><td>4.5× slower</td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="32" height="12" alt="" /></td></tr>
<tr><th colspan="4" align="left">Throttle a burst of 1,000 calls</th></tr>
<tr><td>lodash.throttle</td><td align="right">15,600</td><td>1.2× faster</td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="160" height="12" alt="" /></td></tr>
<tr><td>@portable/timers</td><td align="right">13,100</td><td></td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="134" height="12" alt="" /></td></tr>
<tr><td>throttle-debounce</td><td align="right">4,100</td><td>3.2× slower</td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="42" height="12" alt="" /></td></tr>
</tbody>
</table>

Operations per second from `pnpm bench`, higher is better, in Node 24.22.2, on Intel(R) Xeon(R) Processor @ 2.10GHz (4 cores). Each benchmark lists only the libraries that can do the same work, fastest first. The relative speed compares each library with @portable/timers, and the bars are scaled to the fastest library.

| Library | Version | Minified and gzipped | Runtime dependencies | Node built-ins | TypeScript types |
| --- | --- | ---: | ---: | --- | --- |
| @portable/timers | – | 1.8 kB | 1 | none | included |
| p-retry | 8.0.1 | 1.8 kB | 1 | none | included |
| async-retry | 1.3.3 | 1.7 kB | 1 | none | @types/async-retry |
| p-wait-for | 7.0.0 | 0.9 kB | 0 | none | included |
| delay | 7.0.0 | 0.9 kB | 2 | none | included |
| lodash.debounce | 4.0.8 | 1.1 kB | 0 | none | @types/lodash.debounce |
| lodash.throttle | 4.1.1 | 1.2 kB | 0 | none | @types/lodash.throttle |
| throttle-debounce | 5.0.2 | 0.5 kB | 0 | none | @types/throttle-debounce |
| p-debounce | 6.0.0 | 0.7 kB | 0 | none | included |
| perfect-debounce | 2.1.0 | 0.4 kB | 0 | none | included |

Sizes cover the imports in the usage example, or the equivalent imports of each library, bundled for the browser by `scripts/bundle-size.ts`. Runtime dependencies count every package installed with the published package. A library that uses Node built-ins needs polyfills in a browser and the `nodejs_compat` flag in Cloudflare Workers.
<!-- bench:end -->

- p-retry's and async-retry's `retries` count only retries, so `retries: 5` becomes `attempts: 6`.
- Throwing p-retry's `AbortError` doesn't stop `retry`. Return `false` from `retryIf` instead.
- p-retry's `onFailedAttempt` runs after every failure. `onRetry` isn't called after the last failure, so catch the rejection to log that one.
- With `signal: AbortSignal.timeout(ms)` in place of p-retry's `maxRetryTime`, the call rejects with a `TimeoutError` instead of the last error.
- `retry` waits a random 0 to 1 times the backoff by default. p-retry waits the full backoff unless `randomize` is set, and async-retry waits 1 to 2 times it. Pass `jitter: false` in `delay` to wait the full backoff.
- p-wait-for keeps checking while the condition returns `false`, but `poll` stops at any value other than `undefined`. Return `undefined` to keep polling.
- p-wait-for's `before: false` has no equivalent. Call `await Timers.sleep(interval)` before `poll` instead.
- `poll` waits 1000 ms between checks by default, and p-wait-for waits 20 ms.
- delay's `clearDelay(promise)` has no equivalent. Abort the `signal` instead, and the promise rejects rather than resolving early.

## Why use this over lodash.debounce, lodash.throttle, throttle-debounce, p-debounce, and perfect-debounce

`debounce` and `throttle` match lodash 4.18's timing (the oracle tests compare every invocation's time and arguments). They differ in what a call returns and how they stop.

- Each call returns a promise of its invocation's result. lodash returns the previous invocation's result, and throttle-debounce returns nothing.
- `signal` cancels the waiting invocation and disables the function.
- Time comes from `performance.now()`. lodash reads `Date.now()`, so its `throttle` invokes again at once when the system clock jumps forward.
- lodash.debounce 4.0.8, the standalone package, leaves a timer running in a tight loop when `maxWait` is below `ms`, and its timing differs from lodash 4.18.
- A burst of 1,000 calls runs 10 to 15% slower than lodash on Node, and 3 to 5 times faster than throttle-debounce, p-debounce, and perfect-debounce.
- `cancel()` and `flush()` work as in lodash, except that cancelled calls reject with an `AbortError` and `flush` returns a promise.
- p-debounce's `pDebounce.promise(fn)` has no equivalent, because it limits concurrency rather than time.
- `debounce` starts each invocation on time, even while the previous one runs. perfect-debounce waits for a running invocation, then runs once more with the latest arguments. For one invocation at a time, pass `fn` through `Queue.limit(1)` from [@portable/queue](https://portablejs.com/packages/queue).
- throttle-debounce takes the delay first: `throttle(delay, fn)`. Portable takes the function first: `Timers.throttle(fn, delay)`.
- Setting both `leading` and `trailing` to `false` throws a `RangeError`.
- throttle-debounce's `cancel()` disables the function permanently. `cancel()` here drops only the waiting invocation, like `cancel({ upcomingOnly: true })`. Abort the `signal` to disable the function.
