import * as Timers from '@portable/timers'
import { afterEach, beforeEach, vi } from 'vite-plus/test'

export function useFakeTimers(): void {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })
}

export async function settle<T>(
  promise: Promise<T>,
): Promise<{ value: T } | { error: unknown; rejected: true }> {
  const settled = promise.then(
    (value) => ({ value }),
    (error: unknown) => ({ error, rejected: true as const }),
  )
  await vi.runAllTimersAsync()
  return settled
}

export async function retryDelays(options: Timers.retry.Options): Promise<number[]> {
  const times: number[] = []
  await settle(
    Timers.retry(() => {
      times.push(Date.now())
      throw new Error('fail')
    }, options),
  )
  return gaps(times)
}

export function gaps(times: readonly number[]): number[] {
  return times.slice(1).map((time, i) => time - times[i]!)
}

export function isTimeoutError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'TimeoutError'
}

/** A signal that aborts with a `TimeoutError` after `ms`, as `AbortSignal.timeout` does, on fake timers. */
export function timeoutSignal(ms: number): AbortSignal {
  const controller = new AbortController()
  setTimeout(
    () => controller.abort(new DOMException('The operation timed out.', 'TimeoutError')),
    ms,
  )
  return controller.signal
}
