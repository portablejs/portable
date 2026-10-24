import * as Timers from '@portable/timers'
import { describe, expect, test, vi } from 'vite-plus/test'
import { useFakeTimers } from './utils.js'

useFakeTimers()

type Call = { time: number; args: unknown[]; self: unknown }

function recorder<result = unknown>(result?: (args: unknown[]) => result) {
  const start = Date.now()
  const calls: Call[] = []
  function fn(this: unknown, ...args: unknown[]) {
    calls.push({ time: Date.now() - start, args, self: this })
    return (result ? result(args) : args[0]) as result
  }
  return { fn, calls, times: () => calls.map((call) => call.time) }
}

const tick = (ms: number) => vi.advanceTimersByTimeAsync(ms)

describe('lodash debounce', () => {
  test('debounces a function', async () => {
    const { fn, calls } = recorder()
    const debounced = Timers.debounce(fn, 32)
    const first = [debounced('a'), debounced('b'), debounced('c')]
    expect(calls).toHaveLength(0)
    await tick(128)
    expect(await Promise.all(first)).toEqual(['c', 'c', 'c'])
    expect(calls).toHaveLength(1)
    const second = [debounced('d'), debounced('e'), debounced('f')]
    expect(calls).toHaveLength(1)
    await tick(128)
    expect(await Promise.all(second)).toEqual(['f', 'f', 'f'])
    expect(calls).toHaveLength(2)
  })

  test('a call after the wait resolves with its own invocation', async () => {
    const debounced = Timers.debounce((value: string) => value, 32)
    const a = debounced('a')
    await tick(64)
    const b = debounced('b')
    await tick(64)
    expect([await a, await b]).toEqual(['a', 'b'])
  })

  test('does not call fn synchronously when ms is 0', async () => {
    const { fn, calls } = recorder()
    const debounced = Timers.debounce(fn, 0)
    void debounced()
    void debounced()
    expect(calls).toHaveLength(0)
    await tick(5)
    expect(calls).toHaveLength(1)
  })

  test('applies the default options', async () => {
    const { fn, calls } = recorder()
    const debounced = Timers.debounce(fn, 32, {})
    void debounced()
    expect(calls).toHaveLength(0)
    await tick(64)
    expect(calls).toHaveLength(1)
  })

  test('leading invokes on the first call, and trailing again after more calls', async () => {
    const withLeading = recorder()
    const withBoth = recorder()
    const leading = Timers.debounce(withLeading.fn, 32, { leading: true, trailing: false })
    const both = Timers.debounce(withBoth.fn, 32, { leading: true })
    void leading()
    expect(withLeading.calls).toHaveLength(1)
    void both()
    void both()
    expect(withBoth.calls).toHaveLength(1)
    await tick(64)
    expect(withLeading.calls).toHaveLength(1)
    expect(withBoth.calls).toHaveLength(2)
    void leading()
    expect(withLeading.calls).toHaveLength(2)
  })

  test('calls dropped by leading without trailing resolve with the leading result', async () => {
    const debounced = Timers.debounce((value: string) => value, 32, {
      leading: true,
      trailing: false,
    })
    expect(await Promise.all([debounced('a'), debounced('b')])).toEqual(['a', 'a'])
    await tick(64)
    expect(await Promise.all([debounced('c'), debounced('d')])).toEqual(['c', 'c'])
  })

  test('trailing: false invokes nothing after the wait', async () => {
    const withTrailing = recorder()
    const withoutTrailing = recorder()
    void Timers.debounce(withTrailing.fn, 32, { trailing: true })()
    void Timers.debounce(withoutTrailing.fn, 32, { leading: true, trailing: false })()
    await tick(64)
    expect(withTrailing.calls).toHaveLength(1)
    expect(withoutTrailing.calls).toHaveLength(1)
  })

  test('maxWait invokes during a burst', async () => {
    const { fn, calls } = recorder()
    const debounced = Timers.debounce(fn, 32, { maxWait: 64 })
    void debounced()
    void debounced()
    expect(calls).toHaveLength(0)
    await tick(128)
    expect(calls).toHaveLength(1)
    void debounced()
    void debounced()
    expect(calls).toHaveLength(1)
    await tick(128)
    expect(calls).toHaveLength(2)
  })

  test('maxWait invokes in a tight loop where plain debounce does not', async () => {
    const withMaxWait = recorder()
    const withoutMaxWait = recorder()
    const a = Timers.debounce(withMaxWait.fn, 64, { maxWait: 128 })
    const b = Timers.debounce(withoutMaxWait.fn, 96)
    for (let i = 0; i < 320; i++) {
      void a()
      void b()
      await tick(1)
    }
    expect(withMaxWait.times()).toEqual([128, 256])
    expect(withoutMaxWait.calls).toHaveLength(0)
  })

  test('queues a trailing call for calls after maxWait', async () => {
    const { fn, times } = recorder()
    const debounced = Timers.debounce(fn, 200, { maxWait: 200 })
    void debounced()
    await tick(190)
    void debounced()
    await tick(10)
    void debounced()
    await tick(10)
    void debounced()
    await tick(290)
    expect(times()).toEqual([200, 400])
  })

  test('cancels the maxWait timer when the wait timer invokes', async () => {
    const { fn, times } = recorder()
    const debounced = Timers.debounce(fn, 32, { maxWait: 64 })
    void debounced()
    await tick(128)
    void debounced()
    expect(times()).toEqual([32])
    await tick(64)
    expect(times()).toEqual([32, 160])
  })

  test('invokes the maxWait call with the right arguments and this', async () => {
    const object = {}
    const { fn, calls } = recorder()
    const debounced = Timers.debounce(fn, 32, { leading: true, maxWait: 64 })
    for (let i = 0; i <= 64; i++) {
      void debounced.call(object, 'a')
      await tick(1)
    }
    const count = calls.length
    await tick(64)
    expect(calls.slice(0, 2).map((call) => call.time)).toEqual([0, 64])
    expect(calls[1]).toMatchObject({ self: object, args: ['a'] })
    expect(calls.length).toBe(count + 1)
  })

  test('maxWait below ms is raised to ms', async () => {
    const { fn, times } = recorder()
    const debounced = Timers.debounce(fn, 100, { maxWait: 10 })
    for (let i = 0; i < 25; i++) {
      void debounced()
      await tick(10)
    }
    expect(times()).toEqual([100, 200])
  })
})

describe('lodash debounce and throttle', () => {
  for (const [name, make] of [
    ['debounce', Timers.debounce],
    ['throttle', Timers.throttle],
  ] as const) {
    const isDebounce = name === 'debounce'

    test(`${name} calls fn with the this of the last call`, async () => {
      const { fn, calls } = recorder()
      const object = { funced: make(fn, 32) }
      void object.funced()
      if (!isDebounce) void object.funced()
      await tick(64)
      expect(calls.map((call) => call.self)).toEqual(isDebounce ? [object] : [object, object])
    })

    test(`${name} supports recursive calls`, async () => {
      const queue = ['a', 'b', 'c'].map((chr) => [{}, chr] as const)
      const expected = queue.slice()
      const seen: unknown[][] = []
      const funced = make(function (this: unknown, chr: string) {
        seen.push([this, chr])
        const next = queue.shift()
        if (next) void funced.call(next[0], next[1])
      }, 32) satisfies Timers.Debounced<[string], void>
      const first = queue.shift()!
      void funced.call(first[0], first[1])
      expect(seen).toEqual(expected.slice(0, isDebounce ? 0 : 1))
      await tick(256)
      expect(seen).toEqual(expected.slice(0, seen.length))
      expect(seen.length).toBeGreaterThan(1)
    })

    test(`${name} works when the system clock is set backwards`, async () => {
      const { fn, calls } = recorder()
      const funced = make(fn, 32)
      void funced()
      vi.setSystemTime(new Date(2012, 3, 23, 23, 27, 18))
      await tick(64)
      void funced()
      expect(calls).toHaveLength(isDebounce ? 1 : 2)
    })

    test(`${name} is not invoked early when the system clock jumps forward`, async () => {
      const { fn, calls } = recorder()
      const funced = make(fn, 1000, { leading: true })
      void funced()
      vi.setSystemTime(Date.now() + 3_600_000)
      void funced()
      expect(calls).toHaveLength(1)
      await tick(1000)
      expect(calls).toHaveLength(2)
    })

    test(`${name} cancel drops the waiting invocation`, async () => {
      const { fn, calls } = recorder()
      const funced = make(fn, 32, { leading: false })
      const call = funced()
      funced.cancel()
      await expect(call).rejects.toMatchObject({ name: 'AbortError' })
      await tick(64)
      expect(calls).toHaveLength(0)
    })

    test(`${name} cancel resets the timing`, async () => {
      let count = 0
      const funced = make(() => ++count, 32, { leading: true })
      expect(await funced()).toBe(1)
      funced.cancel()
      expect(await funced()).toBe(2)
      void funced()
      await tick(64)
      expect(count).toBe(3)
    })

    test(`${name} flush runs the waiting invocation now`, async () => {
      let count = 0
      const funced = make(() => ++count, 32, { leading: false })
      const call = funced()
      expect(await funced.flush()).toBe(1)
      expect(await call).toBe(1)
      await tick(64)
      expect(count).toBe(1)
      expect(vi.getTimerCount()).toBe(0)
    })

    test(`${name} cancel and flush do nothing when nothing waits`, async () => {
      let count = 0
      const funced = make(() => ++count, 32)
      funced.cancel()
      expect(await funced.flush()).toBe(undefined)
      await tick(64)
      expect(count).toBe(0)
    })

    test(`${name} pending is true while waiting`, async () => {
      const funced = make(() => 1, 32)
      expect(funced.pending).toBe(false)
      void funced()
      expect(funced.pending).toBe(true)
      await tick(64)
      expect(funced.pending).toBe(false)
    })

    test(`${name} leaves no timer after the wait, cancel or abort`, async () => {
      const controller = new AbortController()
      const funced = make(() => 1, 32, { signal: controller.signal })
      void funced()
      void funced()
      await tick(64)
      expect(vi.getTimerCount()).toBe(0)
      funced().catch(() => {})
      funced.cancel()
      expect(vi.getTimerCount()).toBe(0)
      funced().catch(() => {})
      controller.abort()
      expect(vi.getTimerCount()).toBe(0)
    })

    test(`${name} rejects ms past the 32-bit setTimeout limit with a RangeError`, () => {
      expect(() => make(() => 1, 2 ** 31)).toThrow(RangeError)
      expect(() => make(() => 1, Infinity)).toThrow(RangeError)
      expect(() => make(() => 1, Number.NaN)).toThrow(RangeError)
    })

    test(`${name} rejects leading and trailing both false with a RangeError`, () => {
      expect(() => make(() => 1, 32, { leading: false, trailing: false })).toThrow(RangeError)
    })
  }
})

describe('promises', () => {
  test('every call in a burst resolves with the one invocation', async () => {
    const { fn, calls } = recorder()
    const debounced = Timers.debounce(async (value: number) => fn(value), 100)
    const results = Promise.all([1, 2, 3, 4, 5].map((value) => debounced(value)))
    await tick(100)
    expect(await results).toEqual([5, 5, 5, 5, 5])
    expect(calls).toHaveLength(1)
  })

  test('a slow async fn resolves each burst with its own invocation', async () => {
    let count = 0
    const debounced = Timers.debounce(async (value: number) => {
      count++
      await Timers.sleep(200)
      return value
    }, 100)
    const one = [1, 2, 3].map((value) => debounced(value))
    await tick(101)
    const two = [4, 5, 6].map((value) => debounced(value))
    await tick(400)
    expect(await Promise.all([...one, ...two])).toEqual([3, 3, 3, 6, 6, 6])
    expect(count).toBe(2)
  })

  test('calls made while an invocation runs are folded into the next one', async () => {
    const debounced = Timers.debounce(async (value: string) => {
      await Timers.sleep(100)
      return value
    }, 50)
    const first = debounced('first')
    await tick(60)
    const second = debounced('second')
    const third = debounced('third')
    await tick(300)
    expect(await Promise.all([first, second, third])).toEqual(['first', 'third', 'third'])
  })

  test('leading without trailing resolves the burst with the leading result', async () => {
    const calls: number[] = []
    const debounced = Timers.debounce(
      async (value: number) => {
        calls.push(value)
        await Timers.sleep(50)
        return value
      },
      100,
      { leading: true, trailing: false },
    )
    const results = Promise.all([1, 2, 3, 4].map((value) => debounced(value)))
    await tick(100)
    expect(await results).toEqual([1, 1, 1, 1])
    expect(calls).toEqual([1])
    await tick(200)
    const next = debounced(5)
    await tick(50)
    expect(await next).toBe(5)
  })

  test('a sync throw rejects every call in the burst with that error', async () => {
    const error = new Error('Sync error')
    const debounced = Timers.debounce(() => {
      throw error
    }, 50)
    const settled = Promise.allSettled([debounced(), debounced(), debounced()])
    await tick(50)
    expect(await settled).toEqual(Array(3).fill({ status: 'rejected', reason: error }))
  })

  test('a sync throw on the leading call rejects the calls it dropped too', async () => {
    const error = new Error('Leading error')
    let count = 0
    const debounced = Timers.debounce(
      () => {
        count++
        throw error
      },
      50,
      { leading: true, trailing: false },
    )
    const settled = Promise.allSettled([debounced(), debounced()])
    await tick(50)
    expect(await settled).toEqual(Array(2).fill({ status: 'rejected', reason: error }))
    expect(count).toBe(1)
  })

  test('an async rejection rejects every call with the same error, and later calls work', async () => {
    const error = new TypeError('Custom type error')
    let fail = true
    const debounced = Timers.debounce(async (value: number) => {
      await Timers.sleep(10)
      if (fail) throw error
      return value
    }, 50)
    const settled = Promise.allSettled(Array.from({ length: 10 }, (_, i) => debounced(i)))
    await tick(100)
    expect(await settled).toEqual(Array(10).fill({ status: 'rejected', reason: error }))
    fail = false
    const next = debounced(42)
    await tick(100)
    expect(await next).toBe(42)
  })

  test('passes the latest arguments through unchanged', async () => {
    const debounced = Timers.debounce((...args: unknown[]) => args, 50)
    const object = { foo: 'bar' }
    const fn = () => {}
    const call = debounced(object, [1, 2, 3], fn, undefined, null, 42)
    await tick(50)
    const result = await call
    expect(result[0]).toBe(object)
    expect(result.slice(1)).toEqual([[1, 2, 3], fn, undefined, null, 42])
    const empty = debounced()
    await tick(50)
    expect(await empty).toEqual([])
  })

  test('a call exactly at the end of the wait starts a new invocation', async () => {
    const { fn, calls } = recorder()
    const debounced = Timers.debounce(fn, 50)
    const one = debounced(1)
    await tick(50)
    const two = debounced(2)
    await tick(50)
    expect([await one, await two]).toEqual([1, 2])
    expect(calls.map((call) => call.args[0])).toEqual([1, 2])
  })

  test('two debounced functions do not share state', async () => {
    const a = Timers.debounce((value: string) => `a-${value}`, 30)
    const b = Timers.debounce((value: string) => `b-${value}`, 30, {
      leading: true,
      trailing: false,
    })
    const results = Promise.all([a('1'), b('x'), a('2'), b('y')])
    await tick(30)
    expect(await results).toEqual(['a-2', 'b-x', 'a-2', 'b-x'])
  })

  test('nested debounced functions resolve through each other', async () => {
    const inner = Timers.debounce((value: string) => `inner-${value}`, 30)
    const outer = Timers.debounce(async (value: string) => `outer(${await inner(value)})`, 50)
    const result = outer('test')
    await tick(100)
    expect(await result).toBe('outer(inner-test)')
  })

  test('a cancelled call that nobody awaits is not an unhandled rejection', async () => {
    const debounced = Timers.debounce(() => 1, 50)
    void debounced()
    debounced.cancel()
    await tick(100)
    expect(debounced.pending).toBe(false)
  })
})

describe('signal', () => {
  test('rejects waiting calls with signal.reason and never invokes fn', async () => {
    const controller = new AbortController()
    const { fn, calls } = recorder()
    const debounced = Timers.debounce(fn, 100, { signal: controller.signal })
    const waiting = [debounced(1), debounced(2), debounced(3)]
    controller.abort()
    for (const call of waiting) await expect(call).rejects.toMatchObject({ name: 'AbortError' })
    await tick(200)
    expect(calls).toHaveLength(0)
  })

  test('rejects every later call with signal.reason', async () => {
    for (const reason of ['custom reason', 0, false, null]) {
      const controller = new AbortController()
      const { fn, calls } = recorder()
      const debounced = Timers.debounce(fn, 20, { signal: controller.signal })
      const waiting = debounced(1)
      controller.abort(reason)
      await expect(waiting).rejects.toBe(reason)
      await expect(debounced(2)).rejects.toBe(reason)
      expect(calls).toHaveLength(0)
    }
  })

  test('an already aborted signal disables the function', async () => {
    const { fn, calls } = recorder()
    const debounced = Timers.debounce(fn, 100, { signal: AbortSignal.abort() })
    await expect(debounced(1)).rejects.toMatchObject({ name: 'AbortError' })
    expect(calls).toHaveLength(0)
  })

  test('an abort after the leading call keeps the results it already gave', async () => {
    const controller = new AbortController()
    const debounced = Timers.debounce((value: number) => value, 100, {
      leading: true,
      trailing: false,
      signal: controller.signal,
    })
    const first = debounced(1)
    const second = debounced(2)
    controller.abort()
    expect([await first, await second]).toEqual([1, 1])
    await expect(debounced(3)).rejects.toMatchObject({ name: 'AbortError' })
  })

  test('an abort while an invocation runs does not reject its calls', async () => {
    const controller = new AbortController()
    const debounced = Timers.debounce(
      async (value: number) => {
        await Timers.sleep(100)
        return value
      },
      50,
      { signal: controller.signal },
    )
    const call = debounced(3)
    await tick(60)
    controller.abort()
    await tick(100)
    expect(await call).toBe(3)
  })

  test('aborting one signal leaves another debounced function working', async () => {
    const one = new AbortController()
    const a = Timers.debounce((value: number) => value, 50, { signal: one.signal })
    const b = Timers.debounce((value: number) => value, 50, {
      signal: new AbortController().signal,
    })
    const pa = a(1)
    const pb = b(2)
    one.abort()
    await expect(pa).rejects.toMatchObject({ name: 'AbortError' })
    await tick(50)
    expect(await pb).toBe(2)
  })
})

describe('throttle-debounce debounce', () => {
  async function burst(call: () => unknown) {
    for (let i = 0; i < 50; i++) {
      call()
      await tick(20)
    }
  }

  test('runs once after a burst ends', async () => {
    const { fn, times } = recorder()
    const debounced = Timers.debounce(fn, 100)
    await burst(() => void debounced())
    await tick(200)
    expect(times()).toEqual([1080])
  })

  test('with leading and no trailing, runs once at the start of a burst', async () => {
    const { fn, times } = recorder()
    const debounced = Timers.debounce(fn, 100, { leading: true, trailing: false })
    await burst(() => void debounced())
    await tick(200)
    expect(times()).toEqual([0])
  })

  test('a cancel in the middle of a burst drops only the waiting invocation', async () => {
    const { fn, times } = recorder()
    const debounced = Timers.debounce(fn, 100)
    debounced().catch(() => {})
    await tick(50)
    debounced.cancel()
    await tick(50)
    expect(times()).toEqual([])
    void debounced()
    await tick(200)
    expect(times()).toEqual([200])
  })
})
