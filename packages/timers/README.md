# @portable/timers

Sleep, retry with backoff, and poll until a value is ready. Every function takes an `AbortSignal` and leaves no timers behind. Runs in browsers, Cloudflare Workers, Deno, Bun and Node 24+.

Replaces [delay](https://www.npmjs.com/package/delay), [p-retry](https://www.npmjs.com/package/p-retry), [async-retry](https://www.npmjs.com/package/async-retry) and [p-wait-for](https://www.npmjs.com/package/p-wait-for).

```sh
npm install @portable/timers
```

```ts
import * as Timers from '@portable/timers'

await Timers.sleep(1000)

const response = await Timers.retry(({ signal }) => fetch(url, { signal }), {
  attempts: 5,
  timeout: 10_000,
})

const order = await Timers.poll(
  async () => {
    const order = await getOrder(id)
    return order.status === 'paid' ? order : undefined
  },
  { delay: 2000, timeout: 120_000 },
)
```

## `sleep(ms, options)`

Resolves after `ms` milliseconds. It uses `scheduler.wait` where the runtime has it, as Cloudflare Workers does, and `setTimeout` otherwise.

```ts
await Timers.sleep(500)
await Timers.sleep(60_000, { signal }) // rejects with signal.reason when aborted
await Timers.sleep(Infinity, { signal }) // waits until aborted
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
| `retryIf` | retry every error | `(error, attempt) => boolean \| Promise<boolean>`. Called before each retry, not after the last attempt. Return `false` to stop and reject with `error`. |
| `timeout` | `Infinity` | Time limit for each attempt, in ms. When it passes, the attempt's `signal` aborts with a `TimeoutError` `DOMException` and the attempt fails with it, so it is retried like any other error. |
| `signal` | | Stops retrying. The call rejects with `signal.reason`, also while an attempt or a delay is running. |

```ts
class HttpError extends Error {
  constructor(readonly response: Response) {
    super(`HTTP ${response.status}`)
  }
}

const response = await Timers.retry(
  async ({ signal }) => {
    const response = await fetch(url, { signal })
    if (!response.ok) throw new HttpError(response)
    return response
  },
  {
    attempts: 5,
    timeout: 10_000,
    signal: AbortSignal.timeout(60_000), // a limit on the whole call
    retryIf: (error) => !(error instanceof HttpError) || error.response.status >= 500 || error.response.status === 429,
  },
)
```

### Wait as long as the server asks

A `delay` function receives the error, so it can return the server's `Retry-After` value. The header holds either seconds or an HTTP date.

```ts
function retryAfter(response: Response): number | undefined {
  const value = response.headers.get('retry-after')
  if (value === null) return undefined
  const seconds = Number(value)
  const ms = Number.isNaN(seconds) ? Date.parse(value) - Date.now() : seconds * 1000
  return Number.isNaN(ms) ? undefined : ms
}

const response = await Timers.retry(
  async ({ signal }) => {
    const response = await fetch(url, { signal })
    if (response.status === 429 || response.status === 503) throw new HttpError(response)
    return response
  },
  {
    attempts: 5,
    delay: (attempt, error) => {
      const wait = error instanceof HttpError ? retryAfter(error.response) : undefined
      return wait ?? Math.random() * Math.min(10_000, 200 * 2 ** (attempt - 1))
    },
  },
)
```

A date in the past gives a negative wait, which retries at once.

## `poll(fn, options)`

Calls `fn` until it returns a value other than `undefined`, and resolves with that value. `null`, `false` and `0` are values, so they end the poll. `fn` receives `{ attempt, signal }` as in `retry`. If `fn` throws, the poll rejects with that error and doesn't call `fn` again. To retry failed checks, call `retry` inside `fn`.

| Option | Default | Description |
| --- | --- | --- |
| `delay` | `1000` | Wait after each check that returns `undefined`. See [Delays](#delays). |
| `timeout` | `Infinity` | Time limit for the whole poll, in ms. When it passes, the poll rejects with a `TimeoutError` `DOMException`, and the running check's `signal` aborts. |
| `signal` | | Stops polling. The call rejects with `signal.reason`, also while a check is running. |

`timeout` limits each attempt in `retry`, and the whole call in `poll`. A poll that checks a slow endpoint wants a deadline for the whole wait, and a retry wants to give up on one hung request and try again. To limit a whole `retry`, pass `signal: AbortSignal.timeout(ms)`.

## Delays

`retry` and `poll` take the same `delay` option, of type `Timers.Delay`:

| Value | Wait before the next attempt |
| --- | --- |
| `2000` | A fixed 2000 ms. |
| `{ initial, max, factor?, jitter? }` | Exponential backoff. After attempt `n` the cap is `min(max, initial * factor ** (n - 1))`, with `factor` defaulting to 2. With `jitter` (the default) the wait is a random time between 0 and the cap, which spreads out clients that failed at the same moment ([full jitter](https://aws.amazon.com/blogs/architecture/exponential-backoff-and-jitter/)). With `jitter: false` it is the cap. |
| `(attempt, error) => ms` | Whatever the function returns. `attempt` is the number of the attempt that just finished. `error` is what it threw in `retry`, and `undefined` in `poll`. |

`retry` with a wait of 0 starts the next attempt without a timer. `poll` always waits for a timer turn, even with 0, so a check that returns `undefined` at once can't block timers, and the `timeout` can still fire.

## Why use this over p-retry, async-retry, p-wait-for and delay

These libraries cover one job each, with four sets of option names. `retry` and `poll` share one `delay` option and one `{ attempt, signal }` context, and the package has no dependencies.

- Ten attempts with no delay take 10 µs on Node, against 17 µs with p-retry. With a `signal` they take 17 µs, against 19 µs.
- An abort settles the call at once, also while an attempt is running. p-retry waits for the running attempt to settle first.
- `timeout` gives each attempt a deadline through its `signal`. None of the four libraries limits a single attempt.
- Every timer and abort listener is removed when a call settles. p-wait-for's `timeout` uses `AbortSignal.timeout`, whose timer keeps running after the poll succeeds.
- Errors pass through unchanged. p-retry wraps a thrown string in a `TypeError` and never retries a `TypeError` unless its message matches a list of known network errors. That list misses errors such as Chrome's failed dynamic `import()` (p-retry #85).
- When `retryIf` returns `false`, `fn` is never called again. async-retry's `bail()` rejects the promise, but if `fn` then throws, attempts continue in the background (async-retry #69).
- Waits longer than about 24.8 days work. p-retry and p-wait-for pass them to `setTimeout`, which fires after 1 ms instead.

## Migrating

| Upstream | @portable/timers |
| --- | --- |
| `delay(ms)` | `Timers.sleep(ms)` |
| `delay(ms, { value })` | `Timers.sleep(ms).then(() => value)` |
| `delay(ms, { signal })` | `Timers.sleep(ms, { signal })` |
| `rangeDelay(min, max)` | `Timers.sleep(min + Math.random() * (max - min))` |
| `clearDelay(promise)` | Abort the `signal`. The promise rejects instead of resolving early. |
| `pRetry(fn, { retries: 5 })` | `Timers.retry(fn, { attempts: 6 })`. `retries` counts retries after the first call, and `attempts` counts every call. |
| `pRetry(fn, { minTimeout, maxTimeout, factor, randomize: false })` | `Timers.retry(fn, { delay: { initial: minTimeout, max: maxTimeout, factor, jitter: false } })` |
| `throw new AbortError(error)` | Return `false` from `retryIf` for that error. |
| `shouldRetry: ({ error }) => ...` | `retryIf: (error) => ...` |
| `onFailedAttempt: ({ error, attemptNumber }) => log(...)` | Log in `retryIf`, which runs before each retry, or catch inside `fn`. |
| `maxRetryTime: ms` | `signal: AbortSignal.timeout(ms)`. The call rejects with a `TimeoutError` instead of the last error. |
| `makeRetriable(fn, options)` | `(...args) => Timers.retry(() => fn(...args), options)` |
| `asyncRetry(async (bail, attempt) => ..., { retries })` | `Timers.retry(async ({ attempt }) => ..., { attempts: retries + 1 })`. async-retry's `randomize` defaults to `true` and waits 1 to 2 times the backoff; the default here waits 0 to 1 times. |
| `bail(error)` | Throw `error` and return `false` from `retryIf` for it. |
| `onRetry: (error, attempt) => ...` | `retryIf: (error, attempt) => (..., true)` |
| `pWaitFor(condition, { interval })` | `Timers.poll(async () => (await condition()) || undefined, { delay: interval })`. A check that returns `false` ends the poll, so turn `false` into `undefined`. |
| `pWaitFor(() => pWaitFor.resolveWith(value))` | `Timers.poll(() => value)` |
| `pWaitFor(condition, { before: false })` | `await Timers.sleep(interval)` first. |
| `pWaitFor(condition, { timeout: { milliseconds, fallback } })` | `Timers.poll(fn, { timeout: milliseconds }).catch((error) => ...)` |

p-wait-for checks every 20 ms by default. `poll` waits 1000 ms, because it is mostly used against servers.
