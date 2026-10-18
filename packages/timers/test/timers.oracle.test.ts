import * as Timers from '@portable/timers'
import asyncRetry from 'async-retry'
import delay from 'delay'
import pRetry from 'p-retry'
import pWaitFor from 'p-wait-for'
import { afterEach, describe, expect, test, vi } from 'vite-plus/test'
import { gaps, settle, useFakeTimers } from './utils.js'

useFakeTimers()

afterEach(() => {
  vi.restoreAllMocks()
})

function random(seed: number): () => number {
  let state = seed
  return () => {
    state = (state * 1103515245 + 12345) % 2 ** 31
    return state / 2 ** 31
  }
}

type Case = { attempts: number; initial: number; max: number; factor: number }

function cases(count: number): Case[] {
  const next = random(42)
  return Array.from({ length: count }, () => {
    const initial = 1 + Math.floor(next() * 1000)
    return {
      attempts: 1 + Math.floor(next() * 8),
      initial,
      max: next() < 0.3 ? Infinity : Math.floor(initial * (0.5 + next() * 20)),
      factor: [1, 1.5, 2, 3][Math.floor(next() * 4)]!,
    }
  })
}

/** Runs `run` under fake timers and returns its value or error with the gaps between attempts. */
async function observe(run: (attempt: () => number) => Promise<unknown>) {
  const times: number[] = []
  const result = await settle(run(() => times.push(Date.now())))
  return { result, delays: gaps(times) }
}

function failing(attempt: () => number, errors: Error[]) {
  const n = attempt()
  const error = new Error(`attempt ${n}`)
  errors.push(error)
  throw error
}

describe('retry matches p-retry', () => {
  for (const c of cases(40)) {
    test(`backoff without jitter: ${JSON.stringify(c)}`, async () => {
      const ours: Error[] = []
      const theirs: Error[] = []
      const a = await observe((attempt) =>
        Timers.retry(() => failing(attempt, ours), {
          attempts: c.attempts,
          delay: { initial: c.initial, max: c.max, factor: c.factor, jitter: false },
        }),
      )
      const b = await observe((attempt) =>
        pRetry(() => failing(attempt, theirs), {
          retries: c.attempts - 1,
          minTimeout: c.initial,
          maxTimeout: c.max,
          factor: c.factor,
          randomize: false,
        }),
      )
      expect(a.delays.length).toBe(b.delays.length)
      a.delays.forEach((ms, i) => expect(Math.abs(ms - b.delays[i]!)).toBeLessThanOrEqual(1))
      expect((a.result as { error: Error }).error).toBe(ours.at(-1))
      expect((b.result as { error: Error }).error).toBe(theirs.at(-1))
      expect((a.result as { error: Error }).error.message).toBe(
        (b.result as { error: Error }).error.message,
      )
    })
  }

  test('full jitter waits between 0 and the delay p-retry uses without randomize', async () => {
    for (const c of cases(20)) {
      const a = await observe((attempt) =>
        Timers.retry(() => failing(attempt, []), {
          attempts: c.attempts,
          delay: { initial: c.initial, max: c.max, factor: c.factor },
        }),
      )
      const b = await observe((attempt) =>
        pRetry(() => failing(attempt, []), {
          retries: c.attempts - 1,
          minTimeout: c.initial,
          maxTimeout: c.max,
          factor: c.factor,
        }),
      )
      a.delays.forEach((ms, i) => {
        expect(ms).toBeGreaterThanOrEqual(0)
        expect(ms).toBeLessThanOrEqual(b.delays[i]! + 1)
      })
    }
  })

  test('resolves with the same value after the same number of attempts', async () => {
    const run = (attempt: number) => (attempt < 3 ? Promise.reject(new Error('x')) : attempt)
    const a = await settle(Timers.retry(({ attempt }) => run(attempt), { attempts: 5, delay: 10 }))
    const b = await settle(
      pRetry((attempt) => run(attempt), { retries: 4, minTimeout: 10, factor: 1 }),
    )
    expect(a).toEqual(b)
  })
})

describe('retry matches async-retry', () => {
  for (const c of cases(10)) {
    test(`backoff without jitter: ${JSON.stringify(c)}`, async () => {
      const a = await observe((attempt) =>
        Timers.retry(() => failing(attempt, []), {
          attempts: c.attempts,
          delay: { initial: c.initial, max: c.max, factor: c.factor, jitter: false },
        }),
      )
      const b = await observe((attempt) =>
        asyncRetry(() => failing(attempt, []), {
          retries: c.attempts - 1,
          minTimeout: c.initial,
          maxTimeout: c.max,
          factor: c.factor,
          randomize: false,
        }),
      )
      expect(a.delays.length).toBe(b.delays.length)
      a.delays.forEach((ms, i) => expect(Math.abs(ms - b.delays[i]!)).toBeLessThanOrEqual(1))
      expect((a.result as { error: Error }).error.message).toBe(
        (b.result as { error: Error }).error.message,
      )
    })
  }
})

describe('poll matches p-wait-for', () => {
  for (const [interval, ready] of [
    [0, 1],
    [20, 3],
    [250, 5],
    [1000, 2],
  ] as const) {
    test(`checks ${ready} times, ${interval} ms apart`, async () => {
      let ours = 0
      let theirs = 0
      const a = await observe((attempt) =>
        Timers.poll(() => (attempt(), ++ours >= ready ? true : undefined), { delay: interval }),
      )
      const b = await observe((attempt) =>
        pWaitFor(() => (attempt(), ++theirs >= ready), { interval }),
      )
      expect(a.delays).toEqual(b.delays)
      expect(ours).toBe(theirs)
    })
  }

  test('times out with a TimeoutError after about the same number of checks', async () => {
    vi.useRealTimers()
    let ours = 0
    let theirs = 0
    const [a, b] = await Promise.allSettled([
      Timers.poll(() => void ours++, { delay: 30, timeout: 200 }),
      pWaitFor(() => (theirs++, false), { interval: 30, timeout: 200 }),
    ])
    expect(a).toMatchObject({ status: 'rejected', reason: { name: 'TimeoutError' } })
    expect(b).toMatchObject({ status: 'rejected', reason: { name: 'TimeoutError' } })
    expect(Math.abs(ours - theirs)).toBeLessThanOrEqual(2)
  })
})

describe('sleep matches delay', () => {
  for (const ms of [0, 1, 50, 1000, 2 ** 31 + 5]) {
    test(`resolves after ${ms} ms`, async () => {
      const start = Date.now()
      let ours = 0
      let theirs = 0
      const both = Promise.all([
        Timers.sleep(ms).then(() => (ours = Date.now() - start)),
        delay(ms).then(() => (theirs = Date.now() - start)),
      ])
      await vi.runAllTimersAsync()
      await both
      expect(ours).toBe(theirs)
    })
  }

  test('rejects with the same abort reason', async () => {
    const controller = new AbortController()
    const reason = new Error('stop')
    const a = Timers.sleep(1000, { signal: controller.signal })
    const b = delay(1000, { signal: controller.signal })
    controller.abort(reason)
    await expect(a).rejects.toBe(reason)
    await expect(b).rejects.toBe(reason)
  })
})
