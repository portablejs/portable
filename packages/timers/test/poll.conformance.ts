import * as Timers from '@portable/timers'
import { describe, expect, test, vi } from 'vite-plus/test'
import { gaps, isTimeoutError, settle, timeoutSignal, useFakeTimers } from './utils.js'

useFakeTimers()

const aborted = new Error('Aborted')

function after<value>(ms: number, value: value): Promise<value> {
  return Timers.sleep(ms).then(() => value)
}

describe('results', () => {
  test('resolves with the first value that is not undefined', async () => {
    let checks = 0
    const result = await settle(Timers.poll(() => (++checks >= 3 ? 'done' : undefined)))
    expect(result).toEqual({ value: 'done' })
    expect(checks).toBe(3)
  })

  test('waits for an async check', async () => {
    let done = false
    const polling = Timers.poll(() => after(200, true)).then((value) => {
      done = value
    })
    await vi.advanceTimersByTimeAsync(199)
    expect(done).toBe(false)
    await vi.advanceTimersByTimeAsync(1)
    await polling
    expect(done).toBe(true)
  })

  test('resolves on the first check without waiting', async () => {
    let checks = 0
    expect(await Timers.poll(() => (checks++, 'immediate'))).toBe('immediate')
    expect(checks).toBe(1)
  })

  test.each([0, '', false, null, 42, 'truthy string', []])(
    'resolves with %j, which is not undefined',
    async (value) => {
      expect(await Timers.poll(() => value)).toEqual(value)
    },
  )

  test('keeps polling an async check that resolves undefined', async () => {
    let checks = 0
    const result = await settle(
      Timers.poll(async () => {
        await Timers.sleep(10)
        return ++checks >= 5 ? checks : undefined
      }),
    )
    expect(result).toEqual({ value: 5 })
  })

  test('passes the check number', async () => {
    const seen = new Array<number>()
    await settle(
      Timers.poll(({ attempt }) => {
        seen.push(attempt)
        return attempt === 3 ? true : undefined
      }),
    )
    expect(seen).toEqual([1, 2, 3])
  })

  test('rejects with the error a check throws, without another check', async () => {
    let checks = 0
    const result = await settle(
      Timers.poll(() => {
        checks++
        throw aborted
      }),
    )
    expect(result).toEqual({ error: aborted, rejected: true })
    expect(checks).toBe(1)
  })

  test('rejects with the error an async check rejects with', async () => {
    const error = new Error('Condition failed')
    expect(await settle(Timers.poll(() => Promise.reject(error)))).toEqual({
      error,
      rejected: true,
    })
  })

  test('rejects with undefined when a check throws undefined and a signal is set', async () => {
    const result = await settle(
      Timers.poll(
        () => {
          throw undefined
        },
        { signal: timeoutSignal(1000) },
      ),
    )
    expect(result).toEqual({ error: undefined, rejected: true })
  })

  test('runs several polls on one check function', async () => {
    let counter = 0
    const check = () => (++counter >= 10 ? true : undefined)
    const result = await settle(
      Promise.all([Timers.poll(check), Timers.poll(check), Timers.poll(check)]),
    )
    expect(result).toEqual({ value: [true, true, true] })
    expect(counter).toBeGreaterThanOrEqual(10)
  })
})

describe('delay', () => {
  test('waits 1000 ms between checks by default', async () => {
    const times = new Array<number>()
    await settle(Timers.poll(() => (times.push(Date.now()) === 3 ? true : undefined)))
    expect(gaps(times)).toEqual([1000, 1000])
  })

  test('waits the given number of ms between checks', async () => {
    const times = new Array<number>()
    await settle(
      Timers.poll(() => (times.push(Date.now()) === 3 ? true : undefined), { delay: 50 }),
    )
    expect(gaps(times)).toEqual([50, 50])
  })

  test('takes the same backoff as retry', async () => {
    const times = new Array<number>()
    await settle(
      Timers.poll(() => (times.push(Date.now()) === 5 ? true : undefined), {
        delay: { initial: 100, max: 500, jitter: false },
      }),
    )
    expect(gaps(times)).toEqual([100, 200, 400, 500])
  })

  test('takes a function of the check number', async () => {
    const times = new Array<number>()
    await settle(
      Timers.poll(() => (times.push(Date.now()) === 4 ? true : undefined), {
        delay: (attempt) => attempt * 10,
      }),
    )
    expect(gaps(times)).toEqual([10, 20, 30])
  })

  test('with 0, still lets timers run between checks so a timeout signal can fire', async () => {
    let checks = 0
    let error: unknown
    Timers.poll(
      () => {
        checks++
        return undefined
      },
      { delay: 0, signal: timeoutSignal(100) },
    ).catch((e: unknown) => (error = e))
    await vi.advanceTimersByTimeAsync(100)
    expect(isTimeoutError(error)).toBe(true)
    expect(checks).toBeGreaterThan(1)
  })

  test.each([
    ['a negative number', -1],
    ['a NaN number', Number.NaN],
    ['a negative initial', { initial: -1, max: 1 }],
  ])('rejects %s with a RangeError', async (_name, delay) => {
    await expect(Timers.poll(() => true, { delay })).rejects.toBeInstanceOf(RangeError)
  })
})

describe('a timeout signal', () => {
  test('rejects with its TimeoutError when the time passes', async () => {
    const polling = Timers.poll(() => undefined, { delay: 20, signal: timeoutSignal(100) })
    let error: unknown
    polling.catch((e: unknown) => (error = e))
    await vi.advanceTimersByTimeAsync(99)
    expect(error).toBeUndefined()
    await vi.advanceTimersByTimeAsync(1)
    expect(isTimeoutError(error)).toBe(true)
  })

  test('stops checking after the timeout', async () => {
    let checks = 0
    await settle(
      Timers.poll(() => (checks++, undefined), { delay: 10, signal: timeoutSignal(100) }),
    )
    const atTimeout = checks
    await vi.advanceTimersByTimeAsync(50)
    expect(checks).toBe(atTimeout)
  })

  test('rejects while a check is pending, and aborts its signal', async () => {
    let checkSignal: AbortSignal | undefined
    const polling = Timers.poll(
      ({ signal }) => {
        checkSignal = signal
        return after(200, true)
      },
      { signal: timeoutSignal(10) },
    )
    let error: unknown
    polling.catch((e: unknown) => (error = e))
    await vi.advanceTimersByTimeAsync(10)
    expect(isTimeoutError(error)).toBe(true)
    expect(isTimeoutError(checkSignal?.reason)).toBe(true)
  })

  test('resolves with a value found before the timeout', async () => {
    expect(await settle(Timers.poll(() => 'value', { signal: timeoutSignal(1000) }))).toEqual({
      value: 'value',
    })
  })
})

describe('signal', () => {
  test('rejects with signal.reason when aborted between checks', async () => {
    const controller = new AbortController()
    setTimeout(() => controller.abort(aborted), 100)
    let checks = 0
    const polling = Timers.poll(() => (checks++, undefined), {
      delay: 10,
      signal: controller.signal,
    })
    let error: unknown
    polling.catch((e: unknown) => (error = e))
    await vi.advanceTimersByTimeAsync(99)
    expect(error).toBeUndefined()
    await vi.advanceTimersByTimeAsync(1)
    expect(error).toBe(aborted)
    const atAbort = checks
    await vi.advanceTimersByTimeAsync(50)
    expect(checks).toBe(atAbort)
  })

  test('does not check when the signal is already aborted', async () => {
    let checks = 0
    expect(
      await settle(Timers.poll(() => (checks++, true), { signal: AbortSignal.abort(aborted) })),
    ).toEqual({ error: aborted, rejected: true })
    expect(checks).toBe(0)
  })

  test('rejects with signal.reason while a check is pending, without calling it again', async () => {
    const controller = new AbortController()
    let checks = 0
    const polling = Timers.poll(
      () => {
        checks++
        return after(50, undefined)
      },
      { delay: 0, signal: controller.signal },
    )
    controller.abort(aborted)
    await expect(polling).rejects.toBe(aborted)
    await vi.advanceTimersByTimeAsync(150)
    expect(checks).toBe(1)
  })

  test('ignores a check that rejects after the abort', async () => {
    const controller = new AbortController()
    const polling = Timers.poll(
      () => after(50, null).then(() => Promise.reject(new Error('late failure'))),
      { signal: controller.signal },
    )
    controller.abort(aborted)
    await expect(polling).rejects.toBe(aborted)
    await vi.advanceTimersByTimeAsync(150)
  })

  test('resolves when a check returns a value while a signal is passed', async () => {
    const controller = new AbortController()
    expect(
      await settle(Timers.poll(() => 'value', { delay: 10, signal: controller.signal })),
    ).toEqual({ value: 'value' })
  })
})

describe('timers', () => {
  test('leaves no timer after success with a signal', async () => {
    const controller = new AbortController()
    let checks = 0
    await settle(
      Timers.poll(() => (++checks >= 3 ? true : undefined), {
        delay: 10,
        signal: controller.signal,
      }),
    )
    expect(vi.getTimerCount()).toBe(0)
  })

  test('leaves no timer after a check throws', async () => {
    await settle(
      Timers.poll(
        () => {
          throw aborted
        },
        { signal: new AbortController().signal },
      ),
    )
    expect(vi.getTimerCount()).toBe(0)
  })

  test('leaves no timer after an abort', async () => {
    const controller = new AbortController()
    const polling = Timers.poll(() => undefined, { signal: controller.signal })
    await vi.advanceTimersByTimeAsync(10)
    controller.abort()
    await expect(polling).rejects.toMatchObject({ name: 'AbortError' })
    expect(vi.getTimerCount()).toBe(0)
  })
})
