// The same shape as `Timers.Delay` in @portable/timers. Import it from there once timers is published.

/**
 * How long to wait before reconnecting: a fixed number of milliseconds, exponential backoff, or a
 * function of the failed attempt count (starting at 1) and the error that ended the last attempt.
 */
export type Delay = number | Backoff | ((attempt: number, error?: unknown) => number)

/**
 * Exponential backoff. Attempt `n` waits up to `min(max, initial * factor ** (n - 1))` ms. With
 * `jitter` (the default), the wait is a random value between 0 and that cap.
 */
export type Backoff = {
  /** Cap for the wait after the first failure, in ms. */
  initial: number
  /** Largest wait, in ms. */
  max: number
  /** Growth of the cap per attempt. @default 2 */
  factor?: number | undefined
  /** Wait a random time between 0 and the cap. With `false`, wait exactly the cap. @default true */
  jitter?: boolean | undefined
}

export function checkDelay(delay: Delay): void {
  if (typeof delay === 'function') return
  if (typeof delay === 'number') return checkMs('delay', delay)
  checkMs('delay.initial', delay.initial)
  checkMs('delay.max', delay.max)
  const { factor = 2 } = delay
  if (!(factor > 0) || factor === Infinity)
    throw new RangeError('Expected `delay.factor` to be a positive finite number.')
}

function checkMs(name: string, value: number): void {
  if (!(value >= 0)) throw new RangeError(`Expected \`${name}\` to be a non-negative number.`)
}

export function delayFor(delay: Delay, attempt: number, error?: unknown): number {
  if (typeof delay === 'number') return delay
  if (typeof delay === 'function') return Math.max(0, delay(attempt, error)) || 0
  const { initial, max, factor = 2, jitter = true } = delay
  const cap = Math.min(max, initial * factor ** (attempt - 1))
  return jitter ? Math.random() * cap : cap
}
