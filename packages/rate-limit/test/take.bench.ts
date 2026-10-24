import { RateLimiter } from 'limiter'
import { RateLimiterMemory } from 'rate-limiter-flexible'
import { expect, test } from 'vite-plus/test'
import * as RateLimit from '@portable/rate-limit'

const keys = Array.from({ length: 1000 }, (_, i) => `192.0.2.${i}`)
const rounds = 10

test('take on 1000 keys within 25% of rate-limiter-flexible', async ({ bench }) => {
  const ours = RateLimit.create({ limit: 1_000_000, period: 1000 })
  const flexible = new RateLimiterMemory({ points: 1_000_000, duration: 1 })
  const result = await bench.compare(
    bench('@portable/rate-limit', async () => {
      for (let r = 0; r < rounds; r++) {
        for (const key of keys) {
          await ours.take(key)
        }
      }
    }),
    bench('rate-limiter-flexible', async () => {
      for (let r = 0; r < rounds; r++) {
        for (const key of keys) {
          await flexible.consume(key)
        }
      }
    }),
  )
  expect(result.get('rate-limiter-flexible')).not.toBeFasterThan(
    result.get('@portable/rate-limit'),
    { delta: 0.25 },
  )
})

test('take denied on one key within 25% of rate-limiter-flexible', async ({ bench }) => {
  const ours = RateLimit.create({ limit: 1, period: 60_000 })
  const flexible = new RateLimiterMemory({ points: 1, duration: 60 })
  await ours.take('key')
  await flexible.consume('key')
  const result = await bench.compare(
    bench('@portable/rate-limit', async () => {
      for (let i = 0; i < 1000; i++) {
        await ours.take('key')
      }
    }),
    bench('rate-limiter-flexible', async () => {
      for (let i = 0; i < 1000; i++) {
        await flexible.consume('key').catch(() => {})
      }
    }),
  )
  expect(result.get('rate-limiter-flexible')).not.toBeFasterThan(
    result.get('@portable/rate-limit'),
    { delta: 0.25 },
  )
})

test('take on one key, compared with limiter', async ({ bench }) => {
  const ours = RateLimit.create({ limit: 1_000_000, period: 1000 })
  const limiter = new RateLimiter({ tokensPerInterval: 1_000_000, interval: 1000 })
  const result = await bench.compare(
    bench('@portable/rate-limit', async () => {
      for (let i = 0; i < 1000; i++) {
        await ours.take('key')
      }
    }),
    bench('limiter', () => {
      for (let i = 0; i < 1000; i++) {
        limiter.tryRemoveTokens(1)
      }
    }),
  )
  expect(result.get('@portable/rate-limit')).toBeDefined()
})

test('headers', async ({ bench }) => {
  const allowed = await RateLimit.create({ limit: 100, period: 60_000 }).take('a')
  const limiter = RateLimit.create({ limit: 1, period: 60_000 })
  await limiter.take('a')
  const denied = await limiter.take('a')
  const result = await bench('@portable/rate-limit', () => {
    for (let i = 0; i < 1000; i++) {
      RateLimit.headers(allowed)
      RateLimit.headers(denied)
    }
  }).run()
  expect(result).toBeDefined()
})
