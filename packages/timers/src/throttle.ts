import { type Debounced, debounce } from './debounce.js'

export declare namespace throttle {
  type Options = {
    /** Invoke on the first call of a burst. @default true */
    leading?: boolean | undefined
    /** Invoke once more at the end of each `ms` window that had calls, with the last call's arguments. @default true */
    trailing?: boolean | undefined
    /** Cancels the waiting invocation, as `cancel()` does but rejecting with `signal.reason`, and disables the function. */
    signal?: AbortSignal | undefined
  }
}

/**
 * Wraps `fn` so that it runs at most once every `ms` milliseconds, however often it is called. Each
 * call resolves with the result of the invocation it was folded into.
 *
 * @example
 * ```ts
 * import * as Timers from '@portable/timers'
 *
 * const report = Timers.throttle(() => fetch('/position', { method: 'POST', body: String(scrollY) }), 1000)
 * addEventListener('scroll', () => report())
 * ```
 */
export function throttle<Args extends unknown[], Result, This = unknown>(
  fn: (this: This, ...args: Args) => Result,
  ms: number,
  options: throttle.Options = {},
): Debounced<Args, Result, This> {
  const { leading = true, trailing = true, signal } = options
  return debounce(fn, ms, { leading, trailing, maxWait: ms, signal })
}
