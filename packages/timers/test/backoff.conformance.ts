import * as Timers from '@portable/timers'
import { describe, expect, test } from 'vite-plus/test'

describe('backoff', () => {
  test('returns a fixed wait for a number', () => {
    const next = Timers.backoff(250)
    expect([next({ attempt: 1 }), next({ attempt: 5 })]).toEqual([250, 250])
  })

  test('grows by factor up to max without jitter', () => {
    const next = Timers.backoff({ initial: 100, max: 1000, factor: 3, jitter: false })
    expect([1, 2, 3, 4].map((attempt) => next({ attempt }))).toEqual([100, 300, 900, 1000])
  })

  test('waits between 0 and the cap with jitter', () => {
    const next = Timers.backoff({ initial: 100, max: 1000 })
    for (let attempt = 1; attempt <= 10; attempt++) {
      const ms = next({ attempt })
      expect(ms).toBeGreaterThanOrEqual(0)
      expect(ms).toBeLessThanOrEqual(Math.min(1000, 100 * 2 ** (attempt - 1)))
    }
  })

  test('passes the attempt and error to a function', () => {
    const error = new Error('fail')
    const next = Timers.backoff(({ attempt, error: cause }) =>
      cause === error ? attempt * 10 : -1,
    )
    expect(next({ attempt: 3, error })).toBe(30)
  })

  test.each([
    ['a negative number', -1],
    ['a negative initial', { initial: -1, max: 10 }],
    ['a NaN max', { initial: 1, max: Number.NaN }],
    ['a zero factor', { initial: 1, max: 10, factor: 0 }],
    ['an infinite factor', { initial: 1, max: 10, factor: Infinity }],
  ])('throws a RangeError for %s', (_name, delay) => {
    expect(() => Timers.backoff(delay)).toThrow(RangeError)
  })
})
