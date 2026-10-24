import { fc, fuzz, outcomeAsync } from '@portable/fuzz'
import * as Timers from '@portable/timers'
import { expect, test } from 'vite-plus/test'

const backoff = fc.record({
  initial: fc.integer({ min: 0, max: 10_000 }),
  max: fc.integer({ min: 0, max: 100_000 }),
  factor: fc.double({ min: 0.5, max: 4, noNaN: true }),
})

test('backoff without jitter grows by factor up to max', () => {
  fuzz(
    fc.property(backoff, fc.integer({ min: 1, max: 60 }), (options, attempt) => {
      const next = Timers.backoff({ ...options, jitter: false })
      expect(next({ attempt })).toBe(
        Math.min(options.max, options.initial * options.factor ** (attempt - 1)),
      )
    }),
  )
})

test('backoff with jitter waits between 0 and the cap', () => {
  fuzz(
    fc.property(backoff, fc.integer({ min: 1, max: 60 }), (options, attempt) => {
      const cap = Timers.backoff({ ...options, jitter: false })({ attempt })
      const wait = Timers.backoff(options)({ attempt })
      expect(wait).toBeGreaterThanOrEqual(0)
      expect(wait).toBeLessThanOrEqual(cap)
    }),
  )
})

test('retry makes at most attempts calls and returns the first success', async () => {
  await fuzz(
    fc.asyncProperty(fc.integer({ min: 1, max: 6 }), fc.nat(8), async (attempts, failures) => {
      let calls = 0
      const result = await outcomeAsync([Error], () =>
        Timers.retry(
          async ({ attempt }) => {
            calls++
            expect(attempt).toBe(calls)
            if (attempt <= failures) throw new Error(`failure ${attempt}`)
            return attempt
          },
          { attempts, delay: 0 },
        ),
      )
      expect(calls).toBe(Math.min(attempts, failures + 1))
      expect(result).toEqual(failures < attempts ? { value: failures + 1 } : { error: Error })
    }),
  )
})
