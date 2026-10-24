import { fc, fuzz } from '@portable/fuzz'
import * as Queue from '@portable/queue'
import { expect, test } from 'vite-plus/test'

/** A task that resolves to `value` after `ticks` microtask turns, recording how many run at once. */
function tasks(delays: readonly number[]) {
  let running = 0
  let most = 0
  const order: number[] = []
  const make = (i: number) => async () => {
    running++
    most = Math.max(most, running)
    for (let tick = 0; tick < delays[i]!; tick++) {
      await Promise.resolve()
    }
    running--
    order.push(i)
    return i
  }
  return { make, most: () => most, order }
}

const delays = fc.array(fc.nat(6), { maxLength: 20 })
const concurrency = fc.integer({ min: 1, max: 5 })

test('runs at most concurrency tasks at once, and resolves each with its own result', async () => {
  await fuzz(
    fc.asyncProperty(delays, concurrency, async (delays, concurrency) => {
      const queue = Queue.create({ concurrency })
      const { make, most } = tasks(delays)
      const results = await Promise.all(delays.map((_, i) => queue.add(make(i))))
      expect(results).toEqual(delays.map((_, i) => i))
      expect(most()).toBeLessThanOrEqual(concurrency)
      await queue.idle()
    }),
  )
})

test('map keeps the input order and respects concurrency', async () => {
  await fuzz(
    fc.asyncProperty(delays, concurrency, async (delays, concurrency) => {
      const { make, most } = tasks(delays)
      const results = await Queue.map(
        delays.map((_, i) => i),
        (i) => make(i)(),
        { concurrency },
      )
      expect(results).toEqual(delays.map((_, i) => i))
      expect(most()).toBeLessThanOrEqual(concurrency)
    }),
  )
})

test('limit runs at most n tasks at once', async () => {
  await fuzz(
    fc.asyncProperty(delays, concurrency, async (delays, n) => {
      const limited = Queue.limit(n)
      const { make, most } = tasks(delays)
      await Promise.all(delays.map((_, i) => limited(make(i))))
      expect(most()).toBeLessThanOrEqual(n)
    }),
  )
})

test('starts queued tasks by priority, first added first among equal priorities', async () => {
  await fuzz(
    fc.asyncProperty(
      fc.array(fc.integer({ min: -3, max: 3 }), { maxLength: 15 }),
      async (priorities) => {
        const queue = Queue.create({ concurrency: 1 })
        queue.pause()
        const started: number[] = []
        const done = priorities.map((priority, i) =>
          queue.add(async () => started.push(i), { priority }),
        )
        queue.resume()
        await Promise.all(done)
        const expected = priorities
          .map((priority, i) => ({ priority, i }))
          .sort((a, b) => b.priority - a.priority || a.i - b.i)
          .map(({ i }) => i)
        expect(started).toEqual(expected)
      },
    ),
  )
})
