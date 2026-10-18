import {
  call,
  checkDelay,
  checkMs,
  type Context,
  type Delay,
  delayFor,
  neverAborted,
  withTimeout,
} from './Delay.js'
import { abortable, sleep } from './sleep.js'

export declare namespace poll {
  type Options = {
    /** Wait after each check that returns `undefined`. @default 1000 */
    delay?: Delay | undefined
    /**
     * Time limit for the whole poll, in ms. When it passes, the poll rejects with a `TimeoutError`
     * `DOMException`, and the running check's `signal` aborts. @default Infinity
     */
    timeout?: number | undefined
    /** Stops polling and rejects with `signal.reason`, also while a check is running. */
    signal?: AbortSignal | undefined
  }
}

/**
 * Calls `fn` until it returns a value other than `undefined`, waiting `delay` between calls, and
 * resolves with that value. An error thrown by `fn` rejects the poll without another call.
 *
 * @example
 * ```ts
 * import * as Timers from '@portable/timers'
 *
 * const order = await Timers.poll(
 *   async ({ signal }) => {
 *     const order = await (await fetch(`/orders/${id}`, { signal })).json()
 *     return order.status === 'paid' ? order : undefined
 *   },
 *   { delay: 2000, timeout: 120_000 },
 * )
 * ```
 */
export async function poll<T>(
  fn: (context: Context) => T | undefined | PromiseLike<T | undefined>,
  options: poll.Options = {},
): Promise<T> {
  const { delay = 1000, timeout = Infinity, signal } = options
  checkDelay(delay)
  checkMs('timeout', timeout)
  signal?.throwIfAborted()

  const deadline = timeout === Infinity ? undefined : withTimeout(signal, timeout)
  const active = deadline?.signal ?? signal
  try {
    for (let attempt = 1; ; attempt++) {
      const result = call(fn, { attempt, signal: active ?? neverAborted })
      const value = await (active ? abortable(result, active) : result)
      if (value !== undefined) return value
      await sleep(delayFor(delay, attempt), { signal: active })
    }
  } finally {
    deadline?.clear()
  }
}
