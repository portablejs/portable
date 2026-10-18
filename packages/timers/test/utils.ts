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

/** Runs `promise` to completion under fake timers and returns how it settled. */
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

/** The fake-clock gaps between attempts of a `retry` whose every attempt throws. */
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
