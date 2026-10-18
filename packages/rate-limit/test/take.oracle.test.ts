import { TokenBucket } from 'limiter'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vite-plus/test'
import * as RateLimit from '@portable/rate-limit'

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date', 'performance'] })
  vi.setSystemTime(Date.UTC(2026, 0, 1))
})
afterEach(() => {
  vi.useRealTimers()
})

function random(seed: number) {
  let state = seed
  return (n: number) => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0
    return state % n
  }
}

// limiter's TokenBucket starts empty and refills by multiplying elapsed time by the rate, so the
// configurations use rates that are exact in binary and fill the bucket before comparing.
const configs = [
  { limit: 1, period: 64, burst: 8 },
  { limit: 4, period: 256, burst: 4 },
  { limit: 16, period: 1024, burst: 1 },
  { limit: 2, period: 32, burst: 20 },
]

describe("decides like limiter's TokenBucket with the same rate and size", () => {
  for (const { limit, period, burst } of configs) {
    for (const seed of [1, 2, 3]) {
      test(`${limit} per ${period} ms, burst ${burst}, seed ${seed}`, async () => {
        const bucket = new TokenBucket({
          bucketSize: burst,
          tokensPerInterval: limit,
          interval: period,
        })
        bucket.content = burst
        const limiter = RateLimit.create({ limit, period, burst })
        const next = random(seed)
        const interval = period / limit
        for (let i = 0; i < 2000; i++) {
          vi.advanceTimersByTime(next(3 * interval))
          const cost = 1 + next(Math.min(3, burst))
          const ours = await limiter.take('key', { cost })
          expect(ours.allowed).toBe(bucket.tryRemoveTokens(cost))
          expect(ours.remaining).toBe(Math.floor(bucket.content))
        }
      })
    }
  }
})
