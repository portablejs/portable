import { sleep } from './sleep.js'

/**
 * How long to wait before the next attempt: a fixed number of milliseconds, exponential backoff, or a
 * function of the attempt that just finished (and, in `retry`, the error it threw).
 */
export type Delay = number | Backoff | ((attempt: number, error?: unknown) => number)

/**
 * Exponential backoff. Attempt `n` waits up to `min(max, initial * factor ** (n - 1))` ms. With
 * `jitter` (the default), the wait is a random value between 0 and that cap ("full jitter").
 */
export type Backoff = {
  /** Cap for the wait after the first attempt, in ms. */
  initial: number
  /** Largest wait, in ms. */
  max: number
  /** Growth of the cap per attempt. @default 2 */
  factor?: number | undefined
  /** Wait a random time between 0 and the cap. With `false`, wait exactly the cap. @default true */
  jitter?: boolean | undefined
}

export type Context = {
  /** The attempt number, starting at 1. */
  attempt: number
  /** Aborts when the caller's `signal` aborts or the `timeout` passes. Pass it to `fetch`. */
  signal: AbortSignal
}

export const neverAborted: AbortSignal = new AbortController().signal

export function checkDelay(delay: Delay): void {
  if (typeof delay === 'function') return
  if (typeof delay === 'number') return checkMs('delay', delay)
  checkMs('delay.initial', delay.initial)
  checkMs('delay.max', delay.max)
  const { factor = 2 } = delay
  if (!(factor > 0) || factor === Infinity)
    throw new RangeError('Expected `delay.factor` to be a positive finite number.')
}

export function checkMs(name: string, value: number): void {
  if (!(value >= 0)) throw new RangeError(`Expected \`${name}\` to be a non-negative number.`)
}

export function delayFor(delay: Delay, attempt: number, error?: unknown): number {
  if (typeof delay === 'number') return delay
  if (typeof delay === 'function') return delay(attempt, error)
  const { initial, max, factor = 2, jitter = true } = delay
  const cap = Math.min(max, initial * factor ** (attempt - 1))
  return jitter ? Math.random() * cap : cap
}

export function call<T>(
  fn: (context: Context) => T | PromiseLike<T>,
  context: Context,
): Promise<T> {
  return new Promise<T>((resolve) => resolve(fn(context)))
}

export function withTimeout(
  signal: AbortSignal | undefined,
  timeout: number,
): { signal: AbortSignal; clear: () => void } {
  const controller = new AbortController()
  const stop = new AbortController()
  const onAbort = () => controller.abort(signal!.reason)
  signal?.addEventListener('abort', onAbort, { once: true })
  sleep(timeout, { signal: stop.signal }).then(
    () => controller.abort(new DOMException('The operation timed out.', 'TimeoutError')),
    () => {},
  )
  return {
    signal: controller.signal,
    clear() {
      stop.abort()
      signal?.removeEventListener('abort', onAbort)
    },
  }
}
