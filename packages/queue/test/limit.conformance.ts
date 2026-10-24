import { describe, expect, test } from 'vite-plus/test'
import * as Queue from '@portable/queue'
import { concurrencyProbe, delay, flush } from './utils.js'

describe('p-limit', () => {
  test('runs one task at a time with concurrency 1', async () => {
    const limit = Queue.limit(1)
    const probe = concurrencyProbe()
    const results = await Promise.all(
      [
        [10, 30],
        [20, 20],
        [30, 10],
      ].map(([value, ms]) => limit(() => probe.run(ms!, value))),
    )
    expect(results).toEqual([10, 20, 30])
    expect(probe.max).toBe(1)
  })

  test('never runs more tasks than the concurrency', async () => {
    const limit = Queue.limit(5)
    const probe = concurrencyProbe()
    await Promise.all(Array.from({ length: 50 }, (_, i) => limit(() => probe.run(1 + (i % 7)))))
    expect(probe.max).toBe(5)
  })

  test('accepts a task that returns a value instead of a promise', async () => {
    expect(await Queue.limit(1)(() => null)).toBe(null)
  })

  test('a task that throws synchronously rejects, and the next task still runs', async () => {
    const limit = Queue.limit(1)
    const error = new Error('sync')
    const first = limit(() => {
      throw error
    })
    const second = limit(() => 'ran')
    await expect(first).rejects.toBe(error)
    expect(await second).toBe('ran')
  })

  test('rejects with the error of the failing task', async () => {
    const limit = Queue.limit(1)
    const error = new Error('🦄')
    const tasks = [
      limit(() => delay(10)),
      limit(async () => {
        await delay(20)
        throw error
      }),
      limit(() => delay(5)),
    ]
    await expect(Promise.all(tasks)).rejects.toBe(error)
  })

  test('starts each task after `add` returns', async () => {
    const queue = Queue.create({ concurrency: 3 })
    let value = 1
    const one = queue.add(() => 1)
    const two = queue.add(() => value)
    expect(queue.pending).toBe(2)
    value = 2
    expect(await Promise.all([one, two])).toEqual([1, 2])
  })

  test('counts running and waiting tasks', async () => {
    const queue = Queue.create({ concurrency: 5 })
    expect([queue.pending, queue.size]).toEqual([0, 0])

    const first = queue.add(() => delay(20))
    expect([queue.pending, queue.size]).toEqual([1, 0])
    await first
    expect([queue.pending, queue.size]).toEqual([0, 0])

    const running = Array.from({ length: 5 }, () => queue.add(() => delay(20)))
    const waiting = Array.from({ length: 3 }, () => queue.add(() => delay(20)))
    expect([queue.pending, queue.size]).toEqual([5, 3])
    await Promise.all(running)
    expect([queue.pending, queue.size]).toEqual([3, 0])
    await Promise.all(waiting)
    expect([queue.pending, queue.size]).toEqual([0, 0])
  })

  test('clear removes the waiting tasks and rejects them with an AbortError', async () => {
    const queue = Queue.create({ concurrency: 1 })
    const running = queue.add(() => delay(20).then(() => 'done'))
    const waiting = [queue.add(() => 'a'), queue.add(() => 'b')]
    expect(queue.size).toBe(2)
    queue.clear()
    expect(queue.size).toBe(0)
    expect(await running).toBe('done')
    for (const promise of waiting) {
      await expect(promise).rejects.toMatchObject({ name: 'AbortError' })
    }
  })

  test('throws on an invalid concurrency', () => {
    for (const concurrency of [0, -1, 1.2, Number.NaN, -Infinity]) {
      expect(() => Queue.limit(concurrency)).toThrow(RangeError)
    }
    expect(() => Queue.create({ concurrency: 0 })).toThrow(RangeError)
    expect(() => Queue.create({ concurrency: undefined })).not.toThrow()
    expect(() => Queue.limit(Infinity)).not.toThrow()
  })

  test('lowering the concurrency lets running tasks finish and starts fewer', async () => {
    const queue = Queue.create({ concurrency: 4 })
    const log: number[] = []
    let running = 0
    const tasks = Array.from({ length: 10 }, () =>
      queue.add(async () => {
        log.push(++running)
        await delay(20)
        running--
      }),
    )
    await flush()
    expect(running).toBe(4)
    queue.concurrency = 2
    await Promise.all(tasks)
    expect(log).toEqual([1, 2, 3, 4, 2, 2, 2, 2, 2, 2])
  })

  test('raising the concurrency starts waiting tasks at once', async () => {
    const queue = Queue.create({ concurrency: 2 })
    const log: number[] = []
    let running = 0
    const tasks = Array.from({ length: 10 }, () =>
      queue.add(async () => {
        log.push(++running)
        await delay(20)
        running--
      }),
    )
    await flush()
    expect(running).toBe(2)
    queue.concurrency = 4
    await Promise.all(tasks)
    expect(log).toEqual([1, 2, 3, 4, 4, 4, 4, 4, 4, 4])
  })

  test('setting an invalid concurrency throws and keeps the previous one', () => {
    const queue = Queue.create({ concurrency: 3 })
    expect(() => (queue.concurrency = 0)).toThrow(RangeError)
    expect(queue.concurrency).toBe(3)
  })

  test('the function from limit works without its queue object', async () => {
    const { add } = Queue.create({ concurrency: 1 })
    expect(await add(() => 'detached')).toBe('detached')
  })
})
