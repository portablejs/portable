import { AsyncLocalStorage } from 'node:async_hooks'
import pLimit from 'p-limit'
import pMap from 'p-map'
import PQueue from 'p-queue'
import pThrottle from 'p-throttle'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vite-plus/test'
import * as Queue from '@portable/queue'
import { seededRandom } from './utils.js'

type Plan = { id: number; ms: number; priority: number; fails: boolean }[]

function makePlan(seed: number, length: number, { priorities = false, failures = 0 } = {}): Plan {
  const random = seededRandom(seed)
  return Array.from({ length }, (_, id) => ({
    id,
    ms: Math.floor(random() * 50),
    priority: priorities ? Math.floor(random() * 4) - 1 : 0,
    fails: random() < failures,
  }))
}

/** Runs a plan through `schedule` under fake timers and records what a caller can observe. */
async function observe(
  schedule: (task: (item: Plan[number]) => Promise<number>) => Promise<unknown>,
) {
  const t0 = performance.now()
  const started: [number, number][] = []
  const finished: number[] = []
  let running = 0
  let max = 0
  const task = async (item: Plan[number]) => {
    started.push([item.id, performance.now() - t0])
    max = Math.max(max, ++running)
    await new Promise((resolve) => setTimeout(resolve, item.ms))
    running--
    finished.push(item.id)
    if (item.fails) throw new Error(`task ${item.id}`)
    return item.id * 10
  }
  const settled: Promise<{ value?: unknown; error?: string | string[] }> = schedule(task).then(
    (value) => ({ value }),
    (error: unknown) => ({
      error:
        error instanceof AggregateError
          ? (error.errors as Error[]).map((e) => e.message)
          : (error as Error).message,
    }),
  )
  await vi.runAllTimersAsync()
  return { ...(await settled), started, finished, max }
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date', 'performance'] })
})

afterEach(() => {
  vi.useRealTimers()
})

describe('limit matches p-limit', () => {
  for (const concurrency of [1, 2, 3, 7])
    for (const seed of [1, 2, 3])
      test(`concurrency ${concurrency}, plan ${seed}`, async () => {
        const plan = makePlan(seed, 30)
        const ours = await observe((task) => {
          const limit = Queue.limit(concurrency)
          return Promise.all(plan.map((item) => limit(() => task(item))))
        })
        const theirs = await observe((task) => {
          const limit = pLimit(concurrency)
          return Promise.all(plan.map((item) => limit(() => task(item))))
        })
        expect(ours).toEqual(theirs)
        expect(ours.max).toBe(Math.min(concurrency, plan.length))
      })

  test('changing the concurrency while tasks run', async () => {
    const plan = makePlan(9, 20)
    const run = async (
      limit: { concurrency: number },
      add: (fn: () => Promise<number>) => Promise<number>,
      task: (item: Plan[number]) => Promise<number>,
    ) => {
      const all = Promise.all(plan.map((item) => add(() => task(item))))
      await new Promise((resolve) => setTimeout(resolve, 30))
      limit.concurrency = 5
      await new Promise((resolve) => setTimeout(resolve, 30))
      limit.concurrency = 1
      return all
    }
    const ours = await observe((task) => {
      const queue = Queue.create({ concurrency: 2 })
      return run(queue, queue.add, task)
    })
    const theirs = await observe((task) => {
      const limit = pLimit(2)
      return run(limit, limit, task)
    })
    expect(ours).toEqual(theirs)
  })

  test('a task runs in the async context of its call', async () => {
    const store = new AsyncLocalStorage<number>()
    const contexts = async (
      limit: (fn: () => Promise<number | undefined>) => Promise<number | undefined>,
    ) => {
      const all = Promise.all(
        Array.from({ length: 20 }, (_, id) =>
          store.run(id, () =>
            limit(async () => {
              await new Promise((resolve) => setTimeout(resolve, id % 3))
              return store.getStore()
            }),
          ),
        ),
      )
      await vi.runAllTimersAsync()
      return all
    }
    const ours = await contexts(Queue.limit(2))
    expect(ours).toEqual(await contexts(pLimit(2)))
    expect(ours).toEqual(Array.from({ length: 20 }, (_, id) => id))
  })
})

describe('create matches p-queue', () => {
  for (const concurrency of [1, 2, 4])
    for (const seed of [1, 2, 3])
      test(`priorities, concurrency ${concurrency}, plan ${seed}`, async () => {
        const plan = makePlan(seed, 30, { priorities: true })
        const schedule =
          (queue: {
            add: (fn: () => Promise<number>, options: { priority: number }) => Promise<number>
          }) =>
          (task: (item: Plan[number]) => Promise<number>) =>
            Promise.all(
              plan.map((item) => queue.add(() => task(item), { priority: item.priority })),
            )
        const ours = await observe(schedule(Queue.create({ concurrency })))
        const theirs = await observe(schedule(new PQueue({ concurrency })))
        expect(ours).toEqual(theirs)
      })

  test('tasks added while others run, with pause and resume', async () => {
    const plan = makePlan(4, 24, { priorities: true })
    const schedule = async (
      queue: {
        add: (fn: () => Promise<number>, options: { priority: number }) => Promise<number>
        pause: () => void
      },
      resume: () => void,
      task: (item: Plan[number]) => Promise<number>,
    ) => {
      const results: Promise<number>[] = []
      for (const [i, item] of plan.entries()) {
        results.push(queue.add(() => task(item), { priority: item.priority }))
        if (i === 10) queue.pause()
        if (i === 15) resume()
        await new Promise((resolve) => setTimeout(resolve, 3))
      }
      return Promise.all(results)
    }
    const ours = await observe((task) => {
      const queue = Queue.create({ concurrency: 3 })
      return schedule(queue, () => queue.resume(), task)
    })
    const theirs = await observe((task) => {
      const queue = new PQueue({ concurrency: 3 })
      return schedule(queue, () => queue.start(), task)
    })
    expect(ours).toEqual(theirs)
  })

  for (const [interval, intervalCap, concurrency] of [
    [100, 3, Infinity],
    [50, 2, 2],
    [30, 5, 1],
  ] as const)
    test(`sliding-window rate limit, ${intervalCap} per ${interval} ms, concurrency ${concurrency}`, async () => {
      const plan = makePlan(interval, 25)
      const schedule =
        (queue: { add: (fn: () => Promise<number>) => Promise<number> }) =>
        async (task: (item: Plan[number]) => Promise<number>) => {
          const results: Promise<number>[] = []
          for (const item of plan) {
            results.push(queue.add(() => task(item)))
            if (item.id % 4 === 0) await new Promise((resolve) => setTimeout(resolve, item.ms))
          }
          return Promise.all(results)
        }
      const ours = await observe(schedule(Queue.create({ concurrency, interval, intervalCap })))
      const theirs = await observe(
        schedule(new PQueue({ concurrency, interval, intervalCap, strict: true })),
      )
      expect(ours).toEqual(theirs)
    })
})

// p-throttle's strict mode spaces saturated calls `interval / limit` apart, so it can start a call
// later than the window requires. The test checks that every call starts no later than with
// p-throttle and that no window holds more than `limit` starts.
describe('rate limit keeps p-throttle strict mode guarantee', () => {
  for (const [limit, interval] of [
    [1, 20],
    [3, 100],
    [10, 1000],
  ] as const)
    test(`${limit} per ${interval} ms`, async () => {
      const plan = makePlan(limit, 40)
      const schedule =
        (call: (fn: () => Promise<number>) => Promise<number>) =>
        async (task: (item: Plan[number]) => Promise<number>) => {
          const results: Promise<number>[] = []
          for (const item of plan) {
            results.push(call(() => task(item)))
            if (item.ms < 10) await new Promise((resolve) => setTimeout(resolve, item.ms * 3))
          }
          return Promise.all(results)
        }
      const queue = Queue.create({ interval, intervalCap: limit })
      const ours = await observe(schedule((fn) => queue.add(fn)))
      const throttle = pThrottle({ limit, interval, strict: true })
      const throttled = throttle((fn: () => Promise<number>) => fn())
      const theirs = await observe(schedule(throttled))
      expect(ours.value).toEqual(theirs.value)
      const ourTimes = ours.started.map(([, time]) => time)
      const theirTimes = new Map(theirs.started)
      for (const [id, time] of ours.started) expect(time).toBeLessThanOrEqual(theirTimes.get(id)!)
      for (let i = 0; i + limit < ourTimes.length; i++)
        expect(ourTimes[i + limit]! - ourTimes[i]!).toBeGreaterThanOrEqual(interval)
    })
})

describe('map matches p-map', () => {
  for (const concurrency of [1, 3, Infinity])
    for (const seed of [1, 2, 3])
      test(`concurrency ${concurrency}, plan ${seed}`, async () => {
        const plan = makePlan(seed, 25)
        const ours = await observe((task) => Queue.map(plan, task, { concurrency }))
        const theirs = await observe((task) => pMap(plan, task, { concurrency }))
        expect(ours).toEqual(theirs)
      })

  for (const concurrency of [1, 4])
    for (const seed of [4, 5, 6])
      test(`errors with stopOnError false, concurrency ${concurrency}, plan ${seed}`, async () => {
        const plan = makePlan(seed, 25, { failures: 0.3 })
        const options = { concurrency, stopOnError: false }
        const ours = await observe((task) => Queue.map(plan, task, options))
        const theirs = await observe((task) => pMap(plan, task, options))
        expect(ours).toEqual(theirs)
      })

  for (const concurrency of [1, 2, 5])
    for (const seed of [7, 8, 9])
      test(`first error, concurrency ${concurrency}, plan ${seed}`, async () => {
        const plan = makePlan(seed, 25, { failures: 0.15 })
        const ours = await observe((task) => Queue.map(plan, task, { concurrency }))
        const theirs = await observe((task) => pMap(plan, task, { concurrency }))
        expect(ours).toEqual(theirs)
      })

  for (const concurrency of [1, 3])
    test(`async iterable input, concurrency ${concurrency}`, async () => {
      const plan = makePlan(concurrency + 10, 20)
      async function* source() {
        for (const item of plan) {
          await new Promise((resolve) => setTimeout(resolve, item.ms % 7))
          yield item
        }
      }
      const ours = await observe((task) => Queue.map(source(), task, { concurrency }))
      const theirs = await observe((task) => pMap(source(), task, { concurrency }))
      expect(ours).toEqual(theirs)
    })
})
