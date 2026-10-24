import * as Timers from '@portable/timers'
import { describe, expect, test, vi } from 'vite-plus/test'
import { useFakeTimers } from './utils.js'

useFakeTimers()

const tick = (ms: number) => vi.advanceTimersByTimeAsync(ms)

function recorder() {
  const start = Date.now()
  const times: number[] = []
  const args: unknown[] = []
  const fn = (value?: unknown) => {
    times.push(Date.now() - start)
    args.push(value)
    return value
  }
  return { fn, times, args }
}

describe('lodash throttle', () => {
  test('throttles a function', async () => {
    const { fn, times } = recorder()
    const throttled = Timers.throttle(fn, 32)
    void throttled()
    void throttled()
    void throttled()
    expect(times).toEqual([0])
    await tick(64)
    expect(times).toEqual([0, 32])
  })

  test('calls in the first window resolve with the leading result, later ones with the trailing', async () => {
    const throttled = Timers.throttle((value: string) => value, 32)
    const first = [throttled('a'), throttled('b')]
    await tick(64)
    const second = [throttled('c'), throttled('d')]
    await tick(64)
    expect(await Promise.all(first)).toEqual(['a', 'b'])
    expect(await Promise.all(second)).toEqual(['c', 'd'])
  })

  test('does not make a trailing call when called once', async () => {
    const { fn, times } = recorder()
    void Timers.throttle(fn, 32)()
    expect(times).toEqual([0])
    await tick(64)
    expect(times).toEqual([0])
  })

  for (const leading of [true, false]) {
    test(`calls fn more than once when called repeatedly, leading: ${leading}`, async () => {
      const { fn, times } = recorder()
      const throttled = Timers.throttle(fn, 32, { leading })
      for (let i = 0; i < 320; i++) {
        void throttled()
        await tick(1)
      }
      expect(times).toEqual(
        leading
          ? [0, 32, 64, 96, 128, 160, 192, 224, 256, 288, 320]
          : [32, 64, 96, 128, 160, 192, 224, 256, 288, 320],
      )
    })
  }

  test('makes a second call as soon as possible with leading: false', async () => {
    const { fn, times } = recorder()
    const throttled = Timers.throttle(fn, 128, { leading: false })
    void throttled()
    await tick(192)
    expect(times).toEqual([128])
    void throttled()
    await tick(62)
    expect(times).toEqual([128])
    await tick(130)
    expect(times).toEqual([128, 320])
  })

  test('applies the default options', async () => {
    const { fn, times } = recorder()
    const throttled = Timers.throttle(fn, 32, {})
    void throttled()
    void throttled()
    expect(times).toEqual([0])
    await tick(128)
    expect(times).toEqual([0, 32])
  })

  test('leading: false waits for the trailing call', async () => {
    const withLeading = Timers.throttle((value: string) => value, 32, { leading: true })
    expect(await withLeading('a')).toBe('a')
    const { fn, times } = recorder()
    const withoutLeading = Timers.throttle(fn, 32, { leading: false })
    const call = withoutLeading('a')
    expect(times).toEqual([])
    await tick(32)
    expect(await call).toBe('a')
  })

  test('trailing: false drops calls inside the window and resolves them with the leading result', async () => {
    const withTrailing = recorder()
    const withoutTrailing = recorder()
    const a = Timers.throttle(withTrailing.fn, 64, { trailing: true })
    const b = Timers.throttle(withoutTrailing.fn, 64, { trailing: false })
    const results = Promise.all([a('a'), a('b'), b('a'), b('b')])
    await tick(256)
    expect(await results).toEqual(['a', 'b', 'a', 'a'])
    expect(withTrailing.times).toEqual([0, 64])
    expect(withoutTrailing.times).toEqual([0])
  })

  test('trailing: false lets the next window lead again', async () => {
    const { fn, times } = recorder()
    const throttled = Timers.throttle(fn, 64, { trailing: false })
    void throttled()
    void throttled()
    await tick(96)
    void throttled()
    void throttled()
    await tick(96)
    expect(times).toEqual([0, 96])
  })

  test('works when the system clock reads 0', async () => {
    vi.setSystemTime(0)
    const { fn, times } = recorder()
    const throttled = Timers.throttle(fn, 32)
    const results = Promise.all([throttled('a'), throttled('b'), throttled('c')])
    expect(times).toEqual([0])
    await tick(64)
    expect(await results).toEqual(['a', 'c', 'c'])
    expect(times).toEqual([0, 32])
  })

  test('uses a default of ms 0 as "once per timer turn"', async () => {
    const { fn, times } = recorder()
    const throttled = Timers.throttle(fn, 0)
    void throttled()
    await tick(32)
    void throttled()
    expect(times).toEqual([0, 32])
  })
})

describe('throttle-debounce throttle', () => {
  async function burst(call: () => unknown) {
    for (let i = 0; i < 50; i++) {
      call()
      await tick(20)
    }
  }

  test('runs at the start, every ms during a burst, and once after it', async () => {
    const { fn, times } = recorder()
    const throttled = Timers.throttle(fn, 100)
    await burst(() => void throttled())
    await tick(200)
    expect(times[0]).toBe(0)
    expect(times.length).toBeLessThan(50)
    expect(times).toEqual([0, 100, 200, 300, 400, 500, 600, 700, 800, 900, 1000])
  })

  test('trailing: false runs at the start and every ms, but not after the burst', async () => {
    const { fn, times } = recorder()
    const throttled = Timers.throttle(fn, 100, { trailing: false })
    await burst(() => void throttled())
    await tick(200)
    expect(times).toEqual([0, 100, 200, 300, 400, 500, 600, 700, 800, 900])
  })

  test('leading: false skips the start and runs once after the burst', async () => {
    const { fn, times } = recorder()
    const throttled = Timers.throttle(fn, 100, { leading: false })
    await burst(() => void throttled())
    await tick(200)
    expect(times[0]).toBeGreaterThan(0)
    expect(times.at(-1)).toBe(1000)
  })

  test('a single call with leading: false runs later', async () => {
    const { fn, times } = recorder()
    void Timers.throttle(fn, 100, { leading: false })()
    expect(times).toEqual([])
    await tick(200)
    expect(times).toEqual([100])
  })

  test('an aborted signal stops all future calls', async () => {
    const { fn, times } = recorder()
    const controller = new AbortController()
    const throttled = Timers.throttle(fn, 100, { signal: controller.signal })
    controller.abort()
    await expect(throttled()).rejects.toMatchObject({ name: 'AbortError' })
    await tick(200)
    expect(times).toEqual([])
  })
})
