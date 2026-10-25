# @portable/timers

Sleep, retry with backoff, poll until a value is ready, and debounce or throttle a function. Every function takes an `AbortSignal` and leaves no timers behind. Runs in browsers, Cloudflare Workers, Deno, Bun and Node 24+.

Replaces [delay](https://www.npmjs.com/package/delay), [p-retry](https://www.npmjs.com/package/p-retry), [async-retry](https://www.npmjs.com/package/async-retry), [p-wait-for](https://www.npmjs.com/package/p-wait-for), [lodash.debounce](https://www.npmjs.com/package/lodash.debounce), [lodash.throttle](https://www.npmjs.com/package/lodash.throttle), [throttle-debounce](https://www.npmjs.com/package/throttle-debounce) and [p-debounce](https://www.npmjs.com/package/p-debounce).

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

Resolves after `ms` milliseconds. It uses `scheduler.wait` where the runtime has it, as Cloudflare Workers does, and `setTimeout` otherwise.

```ts
await Timers.sleep(500);
await Timers.sleep(60_000, { signal }); // rejects with signal.reason when aborted
await Timers.sleep(Infinity, { signal }); // waits until aborted
```

| Option | Description |
| --- | --- |
| `signal` | When it aborts, the promise rejects with `signal.reason` and the timer is cleared. |

A negative `ms` counts as 0, and `NaN` rejects with a `RangeError`. Delays longer than `setTimeout`'s limit of 2³¹ − 1 ms (about 24.8 days) are waited out in steps. A plain `setTimeout` fires at once for those.

## `retry(fn, options)`

Calls `fn` until it returns without throwing and resolves with its value. When the last attempt fails, it rejects with that attempt's error, unchanged. `fn` receives `{ attempt, signal }`: the attempt number, starting at 1, and a signal to pass to `fetch` or anything else that takes one.

| Option | Default | Description |
| --- | --- | --- |
| `attempts` | `3` | Total number of calls, including the first. `Infinity` retries until success or abort. |
| `delay` | `{ initial: 200, max: 10_000 }` | Wait before each retry. See [Delays](#delays). |
| `retryIf` | retry every error | `(error, { attempt }) => boolean \| Promise<boolean>`. Called before each retry, not after the last attempt. Return `false` to stop and reject with `error`. |
| `onRetry` | | `(error, { attempt, delay }) => void \| Promise<void>`. Called before each wait, once `retryIf` allows the retry, with the error, the attempt number and the wait in ms. Use it for logging. If it returns a promise, the next attempt waits for it, and if it throws, `retry` rejects with that error. |
| `timeout` | `Infinity` | Time limit for each attempt, in ms. When it passes, the attempt's `signal` aborts with a `TimeoutError` `DOMException` and the attempt fails with it, so it is retried like any other error. |
| `signal` | | Stops retrying. The call rejects with `signal.reason`, also while an attempt or a delay is running. |

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

A `delay` function receives the error, so it can return the server's `Retry-After` value. The header holds either seconds or an HTTP date.

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

Calls `fn` until it returns a value other than `undefined`, and resolves with that value. `null`, `false` and `0` are values, so they end the poll. `fn` receives `{ attempt, signal }` as in `retry`. If `fn` throws, the poll rejects with that error and doesn't call `fn` again. To retry failed checks, call `retry` inside `fn`.

| Option | Default | Description |
| --- | --- | --- |
| `delay` | `1000` | Wait after each check that returns `undefined`. See [Delays](#delays). |
| `signal` | | Stops polling. Aborting rejects the call with `signal.reason`, even while a check is running, and aborts the `signal` passed to that check. |

A poll of a slow endpoint needs a deadline for the whole wait, so pass `signal: AbortSignal.timeout(ms)`, which rejects with a `TimeoutError` `DOMException`. `retry` has a `timeout` option because it limits each attempt separately, which a signal for the whole call can't do. To limit a whole `retry`, pass `signal: AbortSignal.timeout(ms)` there too.

## `debounce(fn, ms, options)` and `throttle(fn, ms, options)`

`debounce` wraps `fn` so that a burst of calls invokes it once, `ms` after the last call, with the last call's arguments and `this`. `throttle` invokes `fn` at most once every `ms`: on the first call, then once at the end of each window that had more calls. The timing is lodash's, and the oracle tests compare every invocation's time and arguments with lodash 4.18.

Each call returns a promise of the result of the invocation it was merged into, so every call in a burst resolves with the same value, and an error thrown by `fn` rejects all of them. A call that `trailing: false` drops resolves at once with the result of its window's leading invocation.

```ts
const save = Timers.debounce(async (text: string) => {
  const response = await fetch('/draft', { method: 'PUT', body: text });
  return response.ok;
}, 500);

editor.addEventListener('input', () => save(editor.value));
window.addEventListener('beforeunload', () => save.flush());

const ok = await save(editor.value); // true once the save that includes this text finishes
```

| Option | `debounce` default | `throttle` default | Description |
| --- | --- | --- | --- |
| `leading` | `false` | `true` | Invoke on the first call of a burst. |
| `trailing` | `true` | `true` | Invoke `ms` after the last call (`debounce`) or at the end of the window (`throttle`), with the last call's arguments. |
| `maxWait` | | | `debounce` only. Longest time a call waits, however often calls arrive. `throttle` is `debounce` with `maxWait: ms`. |
| `signal` | | | When it aborts, waiting calls reject with `signal.reason`, and later calls reject at once without invoking `fn`. |

`leading: false` with `trailing: false` never invokes `fn`, so it throws a `RangeError`. `ms` and `maxWait` above 2³¹ − 1 also throw a `RangeError`, because `setTimeout` would fire at once.

The returned function also has:

| Member | Description |
| --- | --- |
| `cancel()` | Drops the waiting invocation. Calls waiting for it reject with an `AbortError` `DOMException`. The rejection counts as handled, so a call nobody awaits doesn't raise an unhandled rejection. Later calls work as usual. |
| `flush()` | Runs the waiting invocation now and returns a promise of its result. Resolves with `undefined` when nothing waits. For `throttle`, and for `debounce` with `maxWait`, the window counts from the flushed invocation, as in lodash: a call before the window ends runs when it ends, and `pending` stays `true` until then. |
| `pending` | `true` while the function waits out `ms` after a call. |
| `[Symbol.dispose]()` | Calls `cancel()`, so `using save = Timers.debounce(...)` drops the waiting invocation when the scope ends. It exists only where the runtime has `Symbol.dispose`, and TypeScript sees it only when your `lib` includes `esnext.disposable`. |

## Delays

`retry` and `poll` take the same `delay` option, of type `Timers.Delay`:

| Value | Wait before the next attempt |
| --- | --- |
| `2000` | A fixed 2000 ms. |
| `{ initial, max, factor?, jitter? }` | Exponential backoff. After attempt `n` the cap is `min(max, initial * factor ** (n - 1))`, with `factor` defaulting to 2. With `jitter` (the default) the wait is a random time between 0 and the cap, which spreads out clients that failed at the same moment ([full jitter](https://aws.amazon.com/blogs/architecture/exponential-backoff-and-jitter/)). With `jitter: false` it is the cap. |
| `({ attempt, error }) => ms` | Whatever the function returns. `attempt` is the number of the attempt that just finished. `error` is what it threw in `retry`, and `undefined` in `poll`. |

`Timers.backoff(delay)` checks a `Delay` and returns a function that computes the wait after each attempt. `retry` and `poll` use this function, so other code can call it to wait the same way. It throws a `RangeError` for a negative wait, `initial` or `max`, or a `factor` that isn't a positive finite number. `@portable/websockets` and `@portable/sse` reconnect with it.

```ts
const next = Timers.backoff({ initial: 1000, max: 30_000, jitter: false });
next({ attempt: 1 }); // 1000
next({ attempt: 3 }); // 4000
```

`retry` with a wait of 0 starts the next attempt without a timer. `poll` always sets a timer before the next check, even for a wait of 0, so a check that returns `undefined` immediately can't keep other timers from running, and a timeout signal can still fire.

## Types

| Type | Description |
| --- | --- |
| `Timers.Delay` | The `delay` option. See [Delays](#delays). |
| `Timers.Backoff` | `{ initial, max, factor?, jitter? }`, exponential backoff. |
| `Timers.Attempt` | `{ attempt, error? }`, what a `delay` function receives. |
| `Timers.Context` | `{ attempt, signal }`, what `retry` and `poll` pass to `fn`. |
| `Timers.Debounced` | The function `debounce` and `throttle` return, with `cancel`, `flush` and `pending`. |
| `Timers.retry.Retry` | `{ attempt, delay }`, what `onRetry` receives. |
| `Timers.Instant` | `Date \| { readonly epochMilliseconds: number }`, the type of options such as `now` and `expiresAt` in other `@portable/*` packages. A `Temporal.Instant` or `Temporal.ZonedDateTime` fits it. |

## Why use this over p-retry, async-retry, p-wait-for and delay

These libraries cover one job each, with four sets of option names. `retry` and `poll` share one `delay` option and one `{ attempt, signal }` context, and the package has no dependencies outside `@portable/*`.

- Ten attempts with no delay run about twice as fast as with p-retry on Node. With a `signal`, the two run at the same speed.
- An abort settles the call at once, also while an attempt is running. p-retry waits for the running attempt to settle first.
- `timeout` gives each attempt a deadline through its `signal`. None of the four libraries limits a single attempt.
- `retry` and `poll` remove every timer and abort listener they create when the call settles.
- Errors pass through unchanged. p-retry wraps a thrown string in a `TypeError` and never retries a `TypeError` unless its message matches a list of known network errors. That list misses errors such as Chrome's failed dynamic `import()` (p-retry #85).
- When `retryIf` returns `false`, `fn` is never called again. async-retry's `bail()` rejects the promise, but if `fn` then throws, attempts continue in the background (async-retry #69).
- Waits longer than about 24.8 days work. p-retry and p-wait-for pass them to `setTimeout`, which fires after 1 ms instead.

<!-- bench:start -->
| | @portable/timers | p-retry | async-retry | p-wait-for | delay | lodash.debounce | lodash.throttle | throttle-debounce | p-debounce | `setTimeout` or `try`/`catch` by hand |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Retry 10 attempts | 98,400 | 52,700 | 98.0 | – | – | – | – | – | – | 123,000 |
| Retry 10 attempts with a signal | 53,200 | 53,700 | – | – | – | – | – | – | – | – |
| Poll until the 10th check succeeds | 98.7 | – | – | 98.1 | – | – | – | – | – | – |
| Sleep for 1 ms | 1,200 | – | – | – | 951 | – | – | – | – | 1,400 |
| Debounce a burst of 1,000 calls | 13,700 | – | – | – | – | 15,400 | – | 4,260 | 2,800 | – |
| Throttle a burst of 1,000 calls | 13,000 | – | – | – | – | – | 15,300 | 3,530 | – | – |

Operations per second from `pnpm bench`, higher is better, in Node 24.22.0, on Intel(R) Xeon(R) Processor @ 2.10GHz (4 cores). A dash means the library has no equivalent.

| | @portable/timers | p-retry | async-retry | p-wait-for | delay | lodash.debounce | lodash.throttle | throttle-debounce | p-debounce | `setTimeout` or `try`/`catch` by hand |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Minified and gzipped | 1.7 kB | 1.8 kB | 1.7 kB | 0.9 kB | 0.9 kB | 1.1 kB | 1.2 kB | 0.5 kB | 0.7 kB | built in |
| Runtime dependencies | 0 | 1 | 1 | 0 | 2 | 0 | 0 | 0 | 0 | – |
| Node built-ins used | none | none | none | none | none | none | none | none | none | none |
| TypeScript types | included | included | `@types/async-retry` | included | included | `@types/lodash.debounce` | `@types/lodash.throttle` | `@types/throttle-debounce` | included | – |
| Version compared | – | 8.0.1 | 1.3.3 | 7.0.0 | 7.0.0 | 4.0.8 | 4.1.1 | 5.0.2 | 6.0.0 | – |

Sizes cover the imports in the usage example, or the equivalent imports of each library, bundled for the browser by `scripts/bundle-size.ts`. Runtime dependencies count every package installed with the published package. A library that uses Node built-ins needs polyfills in a browser and the `nodejs_compat` flag in Cloudflare Workers.
<!-- bench:end -->

- p-retry's and async-retry's `retries` count the retries after the first call, and `attempts` counts every call, so `retries: 5` becomes `attempts: 6`.
- Throwing p-retry's `AbortError` doesn't stop `retry`. Return `false` from `retryIf` for that error instead.
- p-retry's `onFailedAttempt` runs after every failure. `onRetry` runs before each retry, so it isn't called after the last failure. Catch the rejection to log that one.
- With `signal: AbortSignal.timeout(ms)` in place of p-retry's `maxRetryTime`, the call rejects with a `TimeoutError` instead of the last error.
- p-retry waits the full backoff unless `randomize` is set, and async-retry's `randomize` defaults to `true` and waits 1 to 2 times the backoff. `retry` jitters by default and waits 0 to 1 times the backoff. Pass `jitter: false` in `delay` to wait the full backoff.
- p-wait-for keeps checking while the condition returns `false`. `poll` stops at the first value other than `undefined`, so a check that returns `false` ends the poll. Return `undefined` to keep polling.
- p-wait-for's `before: false` has no equivalent. Call `await Timers.sleep(interval)` before `poll` instead.
- p-wait-for checks every 20 ms by default. `poll` waits 1000 ms, because it is mostly used against servers.
- delay's `clearDelay(promise)` has no equivalent. Abort the `signal` instead, and the promise rejects rather than resolving early.

## Why use this over lodash.debounce, lodash.throttle, throttle-debounce and p-debounce

`debounce` and `throttle` follow lodash's timing: the oracle tests compare the time and arguments of every invocation with lodash 4.18 on random call, `flush` and `cancel` schedules. They differ in what a call returns and in how they end.

- Each call returns a promise of the invocation it was merged into. lodash returns the result of the previous invocation, and throttle-debounce returns nothing.
- `signal` cancels the waiting invocation and disables the function, so it can be tied to a component's or request's lifetime.
- Time is read from `performance.now()`. lodash reads `Date.now()`, so `throttle` invokes again at once when the system clock jumps forward.
- lodash.debounce 4.0.8, the standalone package, leaves a timer behind in a tight loop when `maxWait` is below `ms`, and invokes at other times than lodash 4.18. The oracle tests show the difference.
- A burst of 1,000 calls through `debounce` or `throttle` runs about 10% slower than lodash on Node, and 3 to 5 times faster than throttle-debounce and p-debounce. The benchmark table above has the numbers.
- `cancel()` and `flush()` work as in lodash, except that calls dropped by `cancel` reject with an `AbortError` and `flush` returns a promise.
- p-debounce's `pDebounce.promise(fn)` has no equivalent, because it limits concurrency rather than time.
- throttle-debounce takes the delay first, as in `throttle(delay, fn)`. `Timers.throttle` and `Timers.debounce` take the function first: `Timers.throttle(fn, delay)`.
- Setting both `leading` and `trailing` to `false` throws a `RangeError`, because the function would never run.
- throttle-debounce's `cancel()` disables the function permanently. `cancel()` here drops only the waiting invocation, as throttle-debounce's `cancel({ upcomingOnly: true })` does. Abort the `signal` to disable the function.
