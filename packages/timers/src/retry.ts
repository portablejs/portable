import {
  backoff,
  call,
  checkMs,
  type Context,
  type Delay,
  neverAborted,
  withTimeout,
} from './Delay.js'
import { abortable, sleep } from './sleep.js'

export declare namespace retry {
  type Options = {
    /** Total number of attempts, including the first. `Infinity` retries until success or abort. @default 3 */
    attempts?: number | undefined
    /** Wait before each retry. @default { initial: 200, max: 10_000 } */
    delay?: Delay | undefined
    /**
     * Called before each retry with the error and the number of the attempt that threw it. Return
     * `false` to stop and throw that error. It isn't called after the last attempt.
     * @default () => true
     */
    retryIf?: ((error: unknown, attempt: number) => boolean | PromiseLike<boolean>) | undefined
    /**
     * Called after `retryIf` decides to retry and before the wait, with the error, the number of the
     * attempt that threw it, and the wait in ms. Use it to log retries. The next attempt waits for
     * a returned promise, and an error it throws stops the retries and rejects with that error.
     */
    onRetry?: ((error: unknown, retry: retry.Retry) => void | PromiseLike<void>) | undefined
    /**
     * Time limit for each attempt, in ms. When it passes, the attempt's `signal` aborts with a
     * `TimeoutError` `DOMException`, and the attempt fails with it. @default Infinity
     */
    timeout?: number | undefined
    /** Stops retrying and rejects with `signal.reason`, also while an attempt is running. */
    signal?: AbortSignal | undefined
  }

  /** What `onRetry` receives about the retry it is called for. */
  type Retry = {
    /** The number of the attempt that failed, starting at 1. */
    attempt: number
    /** The wait before the next attempt, in ms. */
    delay: number
  }
}

const defaultDelay: Delay = { initial: 200, max: 10_000 }

/**
 * Calls `fn` until it returns without throwing, waiting between attempts. When every attempt fails,
 * rejects with the last error unchanged.
 *
 * @example
 * ```ts
 * import * as Timers from '@portable/timers'
 *
 * const response = await Timers.retry(
 *   async ({ signal }) => {
 *     const response = await fetch('https://example.com/api', { signal })
 *     if (!response.ok) throw new Error(`HTTP ${response.status}`)
 *     return response
 *   },
 *   { attempts: 5, timeout: 10_000, onRetry: (error, { attempt, delay }) => console.warn(attempt, delay, error) },
 * )
 * ```
 */
export async function retry<T>(
  fn: (context: Context) => T | PromiseLike<T>,
  options: retry.Options = {},
): Promise<T> {
  const {
    attempts = 3,
    delay = defaultDelay,
    retryIf,
    onRetry,
    timeout = Infinity,
    signal,
  } = options
  if (!(attempts >= 1) || (attempts !== Infinity && !Number.isInteger(attempts)))
    throw new RangeError('Expected `attempts` to be a positive integer or Infinity.')
  const next = backoff(delay)
  checkMs('timeout', timeout)
  signal?.throwIfAborted()

  for (let attempt = 1; ; attempt++) {
    try {
      return await run(fn, { attempt, signal: signal ?? neverAborted }, timeout)
    } catch (error) {
      signal?.throwIfAborted()
      if (attempt >= attempts) throw error
      if (retryIf && !(await retryIf(error, attempt))) throw error
      signal?.throwIfAborted()
      const ms = next(attempt, error)
      if (onRetry) {
        await onRetry(error, { attempt, delay: Math.max(ms, 0) })
        signal?.throwIfAborted()
      }
      if (!(ms <= 0)) await sleep(ms, { signal })
    }
  }
}

function run<T>(
  fn: (context: Context) => T | PromiseLike<T>,
  context: Context,
  timeout: number,
): Promise<T> {
  if (timeout === Infinity) {
    const result = call(fn, context)
    return context.signal === neverAborted ? result : abortable(result, context.signal)
  }
  const deadline = withTimeout(context.signal, timeout)
  return abortable(call(fn, { ...context, signal: deadline.signal }), deadline.signal).finally(
    deadline.clear,
  )
}
