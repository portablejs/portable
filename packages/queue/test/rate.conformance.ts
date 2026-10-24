import { afterEach, beforeEach, describe, expect, test, vi } from 'vite-plus/test'
import * as Queue from '@portable/queue'
import { delay } from './utils.js'

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] })
})

afterEach(() => {
  vi.useRealTimers()
})

function expectSlidingWindow(starts: readonly number[], cap: number, interval: number) {
  for (let i = 0; i + cap < starts.length; i++)
    expect(starts[i + cap]! - starts[i]!).toBeGreaterThanOrEqual(interval)
}

function recorder() {
  const t0 = performance.now()
  const starts: number[] = []
  return {
    starts,
    task: () => () => void starts.push(performance.now() - t0),
  }
}

async function settle<value>(promise: Promise<value>): Promise<value> {
  await vi.runAllTimersAsync()
  return promise
}

describe('rate limit', () => {
  test('starts at most intervalCap tasks in any interval', async () => {
    const queue = Queue.create({ interval: 50, intervalCap: 2 })
    const { starts, task } = recorder()
    await settle(Promise.all(Array.from({ length: 7 }, () => queue.add(task()))))
    expect(starts).toEqual([0, 0, 50, 50, 100, 100, 150])
  })

  test('runs the first intervalCap tasks at once', async () => {
    const queue = Queue.create({ interval: 1000, intervalCap: 3 })
    const { starts, task } = recorder()
    const tasks = Array.from({ length: 4 }, () => queue.add(task()))
    await vi.advanceTimersByTimeAsync(0)
    expect(starts).toHaveLength(3)
    expect(queue.size).toBe(1)
    queue.clear()
    await Promise.all(tasks.slice(0, 3))
    await expect(tasks[3]).rejects.toMatchObject({ name: 'AbortError' })
  })

  test('has no burst at a window boundary', async () => {
    const queue = Queue.create({ interval: 60, intervalCap: 2 })
    const { starts, task } = recorder()
    await queue.add(task())
    await vi.advanceTimersByTimeAsync(40)
    await settle(Promise.all(Array.from({ length: 4 }, () => queue.add(task()))))
    expect(starts).toEqual([0, 40, 60, 100, 120])
  })

  test('frees a start as soon as the oldest one leaves the window', async () => {
    const queue = Queue.create({ interval: 100, intervalCap: 3 })
    const { starts, task } = recorder()
    await queue.add(task())
    await vi.advanceTimersByTimeAsync(30)
    await queue.add(task())
    await vi.advanceTimersByTimeAsync(30)
    await settle(Promise.all(Array.from({ length: 3 }, () => queue.add(task()))))
    expect(starts).toEqual([0, 30, 60, 100, 130])
  })

  test('works together with a concurrency limit', async () => {
    const queue = Queue.create({ concurrency: 1, interval: 30, intervalCap: 3 })
    let running = 0
    let max = 0
    const { starts, task } = recorder()
    await settle(
      Promise.all(
        Array.from({ length: 6 }, () =>
          queue.add(async () => {
            task()()
            max = Math.max(max, ++running)
            await delay(5)
            running--
          }),
        ),
      ),
    )
    expect(max).toBe(1)
    expect(starts).toEqual([0, 5, 10, 30, 35, 40])
  })

  test('starts the higher priority task first when a slot frees', async () => {
    const queue = Queue.create({ interval: 30, intervalCap: 1 })
    const order: string[] = []
    const tasks = [
      queue.add(() => void order.push('first')),
      queue.add(() => void order.push('low'), { priority: 0 }),
      queue.add(() => void order.push('high'), { priority: 5 }),
    ]
    await settle(Promise.all(tasks))
    expect(order).toEqual(['first', 'high', 'low'])
  })

  test('remembers the starts of the current window after the queue is idle', async () => {
    const queue = Queue.create({ interval: 80, intervalCap: 2 })
    const { starts, task } = recorder()
    await queue.add(task())
    await queue.add(task())
    await queue.idle()
    await vi.advanceTimersByTimeAsync(20)
    await settle(queue.add(task()))
    expect(starts).toEqual([0, 0, 80])
  })

  test('starts a task at once after a long idle period', async () => {
    const queue = Queue.create({ interval: 20, intervalCap: 1 })
    const { starts, task } = recorder()
    await queue.add(task())
    await vi.advanceTimersByTimeAsync(40)
    await queue.add(task())
    expect(starts).toEqual([0, 40])
  })

  test('a waiting task that is aborted does not use a start', async () => {
    const queue = Queue.create({ interval: 40, intervalCap: 1 })
    const controller = new AbortController()
    const { starts, task } = recorder()
    const first = queue.add(task())
    const aborted = queue.add(task(), { signal: controller.signal })
    const third = queue.add(task())
    controller.abort()
    await expect(aborted).rejects.toMatchObject({ name: 'AbortError' })
    await settle(Promise.all([first, third]))
    expect(starts).toEqual([0, 40])
  })

  test('pausing while rate-limited, then resuming, still limits', async () => {
    const queue = Queue.create({ interval: 40, intervalCap: 1 })
    const { starts, task } = recorder()
    const tasks = Array.from({ length: 3 }, () => queue.add(task()))
    await vi.advanceTimersByTimeAsync(0)
    queue.pause()
    await vi.advanceTimersByTimeAsync(60)
    expect(starts).toEqual([0])
    queue.resume()
    await settle(Promise.all(tasks))
    expect(starts).toEqual([0, 60, 100])
  })

  test('clearing a rate-limited queue lets the next task wait only for the window', async () => {
    const queue = Queue.create({ interval: 50, intervalCap: 1 })
    const { starts, task } = recorder()
    void queue.add(task())
    void queue.add(task())
    queue.clear()
    await vi.advanceTimersByTimeAsync(10)
    await settle(queue.add(task()))
    expect(starts).toEqual([0, 50])
  })

  test('a task that throws still counts as a start', async () => {
    const queue = Queue.create({ interval: 40, intervalCap: 1 })
    const { starts, task } = recorder()
    const failing = queue.add(() => {
      task()()
      throw new Error('x')
    })
    await expect(failing).rejects.toThrow('x')
    await settle(queue.add(task()))
    expect(starts).toEqual([0, 40])
  })

  test('rejects invalid interval and intervalCap values', () => {
    for (const interval of [-1, Number.NaN, Infinity])
      expect(() => Queue.create({ interval })).toThrow(RangeError)
    for (const intervalCap of [0, 1.5, -1, Number.NaN])
      expect(() => Queue.create({ interval: 10, intervalCap })).toThrow(RangeError)
    expect(() => Queue.create({ interval: 0, intervalCap: 5 })).not.toThrow()
    expect(() => Queue.create({ interval: 3e9, intervalCap: Infinity })).not.toThrow()
  })

  test('waits out an interval longer than the timer limit instead of firing early', async () => {
    const queue = Queue.create({ interval: 3e9, intervalCap: 1 })
    const { starts, task } = recorder()
    void queue.add(task())
    const second = queue.add(task())
    await vi.advanceTimersByTimeAsync(2 ** 31)
    expect(starts).toEqual([0])
    await vi.advanceTimersByTimeAsync(3e9)
    await second
    expect(starts).toEqual([0, 3e9])
  })

  test('a task added from inside a running task still counts against the limit', async () => {
    const queue = Queue.create({ interval: 50, intervalCap: 2 })
    const { starts, task } = recorder()
    const inner: Promise<void>[] = []
    await settle(
      Promise.all(
        Array.from({ length: 3 }, () =>
          queue.add(() => {
            task()()
            inner.push(queue.add(task()))
          }),
        ),
      ),
    )
    await settle(Promise.all(inner))
    expect(starts).toEqual([0, 0, 50, 50, 100, 100])
  })

  test('interval 0 turns rate limiting off', async () => {
    const queue = Queue.create({ interval: 0, intervalCap: 1 })
    const { starts, task } = recorder()
    await Promise.all([queue.add(task()), queue.add(task())])
    expect(starts).toEqual([0, 0])
  })

  test('throttles a function like p-throttle', async () => {
    const queue = Queue.create({ interval: 50, intervalCap: 2 })
    const throttled = (n: number) => queue.add(() => [n * 2, performance.now()])
    const results = await settle(Promise.all([1, 2, 3, 4, 5].map(throttled)))
    expect(results).toEqual([
      [2, 0],
      [4, 0],
      [6, 50],
      [8, 50],
      [10, 100],
    ])
  })

  test('keeps the limit when many tasks are added over time', async () => {
    const queue = Queue.create({ interval: 100, intervalCap: 4 })
    const { starts, task } = recorder()
    const tasks: Promise<void>[] = []
    for (let i = 0; i < 40; i++) {
      tasks.push(queue.add(task()))
      await vi.advanceTimersByTimeAsync(7)
    }
    await settle(Promise.all(tasks))
    expect(starts).toHaveLength(40)
    expectSlidingWindow(starts, 4, 100)
  })
})
