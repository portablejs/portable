import * as Timers from '@portable/timers'
import { afterEach, describe, expect, test, vi } from 'vite-plus/test'
import { settle, useFakeTimers } from './utils.js'

describe('sleep', () => {
  useFakeTimers()

  test('resolves after the given time', async () => {
    let done = false
    const sleeping = Timers.sleep(50).then(() => (done = true))
    await vi.advanceTimersByTimeAsync(49)
    expect(done).toBe(false)
    await vi.advanceTimersByTimeAsync(1)
    expect(done).toBe(true)
    await sleeping
  })

  test('waits for the next timer turn with 0 ms', async () => {
    let done = false
    const sleeping = Timers.sleep(0).then(() => (done = true))
    await Promise.resolve()
    expect(done).toBe(false)
    await vi.advanceTimersByTimeAsync(0)
    expect(done).toBe(true)
    await sleeping
  })

  test('treats a negative time as 0', async () => {
    expect(await settle(Timers.sleep(-100))).toEqual({ value: undefined })
  })

  test('rejects a NaN time with a RangeError', async () => {
    await expect(Timers.sleep(Number.NaN)).rejects.toBeInstanceOf(RangeError)
  })

  test('rejects with signal.reason when aborted, and clears its timer', async () => {
    const controller = new AbortController()
    const sleeping = Timers.sleep(1000, { signal: controller.signal })
    await vi.advanceTimersByTimeAsync(1)
    controller.abort()
    await expect(sleeping).rejects.toMatchObject({ name: 'AbortError' })
    expect(vi.getTimerCount()).toBe(0)
  })

  test('rejects with a custom abort reason', async () => {
    const controller = new AbortController()
    const reason = new Error('stop')
    const sleeping = Timers.sleep(1000, { signal: controller.signal })
    controller.abort(reason)
    await expect(sleeping).rejects.toBe(reason)
  })

  test('rejects at once when the signal is already aborted', async () => {
    const reason = new Error('stop')
    await expect(Timers.sleep(1000, { signal: AbortSignal.abort(reason) })).rejects.toBe(reason)
    expect(vi.getTimerCount()).toBe(0)
  })

  test('leaves no timer or listener effect after it resolves', async () => {
    const controller = new AbortController()
    const sleeping = Timers.sleep(10, { signal: controller.signal })
    await vi.advanceTimersByTimeAsync(10)
    await sleeping
    controller.abort()
    expect(vi.getTimerCount()).toBe(0)
  })

  test('does not fire early for delays past the 32-bit setTimeout limit', async () => {
    let done = false
    const ms = 2 ** 31 + 1000
    const sleeping = Timers.sleep(ms).then(() => (done = true))
    await vi.advanceTimersByTimeAsync(1000)
    expect(done).toBe(false)
    await vi.advanceTimersByTimeAsync(ms - 1001)
    expect(done).toBe(false)
    await vi.advanceTimersByTimeAsync(1)
    expect(done).toBe(true)
    await sleeping
  })

  test('sleeps forever with Infinity until aborted', async () => {
    const controller = new AbortController()
    let settled = false
    const sleeping = Timers.sleep(Infinity, { signal: controller.signal }).finally(
      () => (settled = true),
    )
    await vi.advanceTimersByTimeAsync(2 ** 32)
    expect(settled).toBe(false)
    controller.abort()
    await expect(sleeping).rejects.toMatchObject({ name: 'AbortError' })
    expect(vi.getTimerCount()).toBe(0)
  })
})

describe('sleep with scheduler.wait', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  test('uses scheduler.wait when the runtime has it', async () => {
    const calls: unknown[][] = []
    vi.stubGlobal('scheduler', {
      wait: (...args: unknown[]) => {
        calls.push(args)
        return Promise.resolve()
      },
    })
    const signal = new AbortController().signal
    await Timers.sleep(25, { signal })
    expect(calls).toEqual([[25, { signal }]])
  })

  test('rejects with signal.reason even if scheduler.wait ignores the signal', async () => {
    vi.stubGlobal('scheduler', { wait: () => new Promise<void>(() => {}) })
    const controller = new AbortController()
    const reason = new Error('stop')
    const sleeping = Timers.sleep(25, { signal: controller.signal })
    controller.abort(reason)
    await expect(sleeping).rejects.toBe(reason)
  })
})
