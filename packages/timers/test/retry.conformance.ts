import * as Timers from '@portable/timers'
import { afterEach, describe, expect, test, vi } from 'vite-plus/test'
import { isTimeoutError, retryDelays, settle, useFakeTimers } from './utils.js'

const fixture = Symbol('fixture')
const fixtureError = new Error('fixture')

useFakeTimers()

afterEach(() => {
  vi.restoreAllMocks()
})

describe('attempts', () => {
  test('retries until fn succeeds and resolves with its value', async () => {
    const seen: number[] = []
    const result = await settle(
      Timers.retry(async ({ attempt }) => {
        seen.push(attempt)
        if (attempt < 3) {
          throw fixtureError
        }
        return fixture
      }),
    )
    expect(result).toEqual({ value: fixture })
    expect(seen).toEqual([1, 2, 3])
  })

  test('makes 3 attempts by default and rejects with the last error unchanged', async () => {
    const errors = [new Error('1'), new Error('2'), new Error('3')]
    let calls = 0
    const result = await settle(
      Timers.retry(() => {
        throw errors[calls++]
      }),
    )
    expect(result).toEqual({ error: errors[2], rejected: true })
    expect(calls).toBe(3)
  })

  test('makes one attempt with attempts: 1', async () => {
    let calls = 0
    const result = await settle(
      Timers.retry(
        () => {
          calls++
          throw fixtureError
        },
        { attempts: 1 },
      ),
    )
    expect(result).toEqual({ error: fixtureError, rejected: true })
    expect(calls).toBe(1)
  })

  test('retries forever with attempts: Infinity', async () => {
    let calls = 0
    const result = await settle(
      Timers.retry(
        () => {
          calls++
          throw new Error(calls === 15 ? 'stop' : 'again')
        },
        {
          attempts: Infinity,
          delay: 0,
          retryIf: (error) => (error as Error).message !== 'stop',
        },
      ),
    )
    expect(result).toMatchObject({ error: { message: 'stop' } })
    expect(calls).toBe(15)
  })

  test('returns a value from a sync fn', async () => {
    expect(await Timers.retry(() => 5)).toBe(5)
  })

  test('retries a sync fn that throws', async () => {
    let calls = 0
    const result = await settle(
      Timers.retry(
        () => {
          calls++
          throw new Error(`Test ${calls}`)
        },
        { attempts: 3, delay: 0 },
      ),
    )
    expect(result).toMatchObject({ error: { message: 'Test 3' } })
  })

  test('resolves with null without retrying', async () => {
    let calls = 0
    expect(
      await Timers.retry(() => {
        calls++
        return null
      }),
    ).toBe(null)
    expect(calls).toBe(1)
  })

  test('resolves with a Response from fetch-like code', async () => {
    const response = await settle(
      Timers.retry(async ({ attempt }) => {
        if (attempt < 2) {
          throw new TypeError('Failed to fetch')
        }
        return new Response('ok', { status: 200 })
      }),
    )
    expect(response).toMatchObject({ value: { status: 200 } })
  })

  test('rethrows a non-Error value unchanged', async () => {
    const result = await settle(
      Timers.retry(() => Promise.reject('string rejection'), { attempts: 2, delay: 0 }),
    )
    expect(result).toEqual({ error: 'string rejection', rejected: true })
  })

  test('retries a TypeError', async () => {
    let calls = 0
    const result = await settle(
      Timers.retry(() => {
        calls++
        throw new TypeError('not a network error')
      }),
    )
    expect(result).toMatchObject({ error: { name: 'TypeError' } })
    expect(calls).toBe(3)
  })

  test.each([0, -1, 1.5, Number.NaN])(
    'rejects attempts: %s with a RangeError',
    async (attempts) => {
      let called = false
      await expect(
        Timers.retry(
          () => {
            called = true
          },
          { attempts },
        ),
      ).rejects.toBeInstanceOf(RangeError)
      expect(called).toBe(false)
    },
  )
})

describe('retryIf', () => {
  test('stops retrying when it returns false and throws that error', async () => {
    const stop = new Error('stop')
    let calls = 0
    const result = await settle(
      Timers.retry(
        () => {
          calls++
          throw calls < 3 ? fixtureError : stop
        },
        { attempts: 10, retryIf: (error) => error !== stop },
      ),
    )
    expect(result).toEqual({ error: stop, rejected: true })
    expect(calls).toBe(3)
  })

  test('receives each error and the number of the attempt that threw it', async () => {
    const seen: unknown[][] = []
    await settle(
      Timers.retry(
        ({ attempt }) => {
          throw new Error(`attempt ${attempt}`)
        },
        {
          attempts: 3,
          retryIf: (error, { attempt }) => {
            seen.push([(error as Error).message, attempt])
            return true
          },
        },
      ),
    )
    expect(seen).toEqual([
      ['attempt 1', 1],
      ['attempt 2', 2],
    ])
  })

  test('is not called after the last attempt', async () => {
    let calls = 0
    await settle(
      Timers.retry(
        () => {
          throw fixtureError
        },
        { attempts: 1, retryIf: () => (calls++, true) },
      ),
    )
    expect(calls).toBe(0)
  })

  test('can be async, and the next attempt waits for it', async () => {
    const times: number[] = []
    await settle(
      Timers.retry(
        () => {
          times.push(Date.now())
          throw fixtureError
        },
        {
          attempts: 2,
          delay: 0,
          retryIf: () => Timers.sleep(1000).then(() => true),
        },
      ),
    )
    expect(times[1]! - times[0]!).toBe(1000)
  })

  test('rejects with the error it throws', async () => {
    const thrown = new Error('retryIf failure')
    const result = await settle(
      Timers.retry(
        () => {
          throw fixtureError
        },
        {
          retryIf: () => {
            throw thrown
          },
        },
      ),
    )
    expect(result).toEqual({ error: thrown, rejected: true })
  })

  test('can be undefined', async () => {
    const result = await settle(
      Timers.retry(
        () => {
          throw fixtureError
        },
        { attempts: 2, retryIf: undefined },
      ),
    )
    expect(result).toEqual({ error: fixtureError, rejected: true })
  })

  test('stops further calls to fn once it returns false', async () => {
    let calls = 0
    const result = await settle(
      Timers.retry(
        () => {
          calls++
          const error = new Error('Wont retry')
          Object.assign(error, { bail: calls === 2 })
          throw error
        },
        { attempts: 5, retryIf: (error) => !(error as { bail: boolean }).bail },
      ),
    )
    expect(result).toMatchObject({ error: { message: 'Wont retry' } })
    await vi.advanceTimersByTimeAsync(60_000)
    expect(calls).toBe(2)
  })
})

describe('delay', () => {
  test('defaults to exponential backoff with full jitter, from 200 ms up to 10 s', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5)
    expect(await retryDelays({ attempts: 9 })).toEqual([100, 200, 400, 800, 1600, 3200, 5000, 5000])
  })

  test('grows by factor without jitter', async () => {
    expect(
      await retryDelays({ attempts: 4, delay: { initial: 100, max: Infinity, jitter: false } }),
    ).toEqual([100, 200, 400])
  })

  test('shrinks with a factor below 1', async () => {
    expect(
      await retryDelays({
        attempts: 4,
        delay: { initial: 100, max: Infinity, factor: 0.5, jitter: false },
      }),
    ).toEqual([100, 50, 25])
  })

  test('starts at initial even with a small factor', async () => {
    expect(
      await retryDelays({
        attempts: 3,
        delay: { initial: 100, max: Infinity, factor: 0.1, jitter: false },
      }),
    ).toEqual([100, 10])
  })

  test('is capped by max', async () => {
    expect(
      await retryDelays({
        attempts: 4,
        delay: { initial: 100, max: 150, factor: 3, jitter: false },
      }),
    ).toEqual([100, 150, 150])
  })

  test('is capped by max when max is below initial', async () => {
    expect(
      await retryDelays({ attempts: 2, delay: { initial: 200, max: 50, jitter: false } }),
    ).toEqual([50])
  })

  test('jitter picks a random wait between 0 and the cap', async () => {
    const random = [0, 1, 0.5]
    vi.spyOn(Math, 'random').mockImplementation(() => random.shift()!)
    expect(
      await retryDelays({ attempts: 4, delay: { initial: 100, max: 1000, factor: 1 } }),
    ).toEqual([0, 100, 50])
  })

  test('a number is a fixed delay', async () => {
    expect(await retryDelays({ attempts: 4, delay: 250 })).toEqual([250, 250, 250])
  })

  test('0 retries without waiting for a timer', async () => {
    let calls = 0
    const retrying = Timers.retry(
      () => {
        calls++
        throw fixtureError
      },
      { attempts: 3, delay: 0 },
    )
    await expect(retrying).rejects.toBe(fixtureError)
    expect(calls).toBe(3)
  })

  test('a function receives the attempt and the error, and returns the wait', async () => {
    const seen: unknown[][] = []
    const delays = await retryDelays({
      attempts: 4,
      delay: ({ attempt, error }) => {
        seen.push([attempt, (error as Error).message])
        return attempt * 1000
      },
    })
    expect(delays).toEqual([1000, 2000, 3000])
    expect(seen).toEqual([
      [1, 'fail'],
      [2, 'fail'],
      [3, 'fail'],
    ])
  })

  test('a function can return a Retry-After value read from the error', async () => {
    class HttpError extends Error {
      constructor(readonly response: Response) {
        super(`HTTP ${response.status}`)
      }
    }
    const times: number[] = []
    const result = await settle(
      Timers.retry(
        ({ attempt }) => {
          times.push(Date.now())
          if (attempt === 1) {
            throw new HttpError(
              new Response(null, { status: 429, headers: { 'retry-after': '7' } }),
            )
          }
          return 'ok'
        },
        {
          delay: ({ error }) =>
            Number((error as HttpError).response.headers.get('retry-after')) * 1000,
        },
      ),
    )
    expect(result).toEqual({ value: 'ok' })
    expect(times[1]! - times[0]!).toBe(7000)
  })

  test('a negative wait from a function retries at once', async () => {
    expect(await retryDelays({ attempts: 2, delay: () => -5000 })).toEqual([0])
  })

  test('a NaN wait from a function rejects with a RangeError', async () => {
    const result = await settle(
      Timers.retry(
        () => {
          throw fixtureError
        },
        { delay: () => Number.NaN },
      ),
    )
    expect(result).toMatchObject({ error: expect.any(RangeError) })
  })

  test.each([
    ['a negative number', -1],
    ['a negative initial', { initial: -1, max: 100 }],
    ['a negative max', { initial: 1, max: -1 }],
    ['a NaN max', { initial: 1, max: Number.NaN }],
    ['a factor of 0', { initial: 1, max: 100, factor: 0 }],
    ['a negative factor', { initial: 1, max: 100, factor: -1 }],
  ])('rejects %s with a RangeError', async (_name, delay) => {
    await expect(Timers.retry(() => 1, { delay })).rejects.toBeInstanceOf(RangeError)
  })
})

describe('timeout', () => {
  test('aborts the attempt signal with a TimeoutError and retries', async () => {
    const reasons: unknown[] = []
    const result = await settle(
      Timers.retry(
        ({ attempt, signal }) =>
          new Promise((resolve, reject) => {
            if (attempt === 3) {
              return resolve(fixture)
            }
            signal.addEventListener('abort', () => {
              reasons.push(signal.reason)
              reject(signal.reason)
            })
          }),
        { timeout: 1000 },
      ),
    )
    expect(result).toEqual({ value: fixture })
    expect(reasons.map(isTimeoutError)).toEqual([true, true])
  })

  test('fails an attempt that ignores its signal and rejects with the TimeoutError last', async () => {
    let calls = 0
    const result = await settle(
      Timers.retry(
        () => {
          calls++
          return new Promise(() => {})
        },
        { timeout: 1000, attempts: 2 },
      ),
    )
    expect(calls).toBe(2)
    expect(isTimeoutError((result as { error: unknown }).error)).toBe(true)
  })

  test('applies to each attempt separately', async () => {
    const result = await settle(
      Timers.retry(
        async ({ attempt }) => {
          await Timers.sleep(800)
          if (attempt < 3) {
            throw fixtureError
          }
          return fixture
        },
        { timeout: 1000, delay: 0 },
      ),
    )
    expect(result).toEqual({ value: fixture })
  })

  test('rejects a negative timeout with a RangeError', async () => {
    await expect(Timers.retry(() => 1, { timeout: -1 })).rejects.toBeInstanceOf(RangeError)
  })
})

describe('signal', () => {
  test('passes a signal to fn even without options', async () => {
    let received: unknown
    await Timers.retry(({ signal }) => {
      received = signal
    })
    expect(received).toBeInstanceOf(AbortSignal)
    expect((received as AbortSignal).aborted).toBe(false)
  })

  test('does not call fn when the signal is already aborted', async () => {
    let calls = 0
    const result = await settle(
      Timers.retry(() => calls++, { signal: AbortSignal.abort(fixtureError) }),
    )
    expect(result).toEqual({ error: fixtureError, rejected: true })
    expect(calls).toBe(0)
  })

  test('rejects with signal.reason when aborted inside fn, without waiting', async () => {
    const controller = new AbortController()
    let calls = 0
    const result = await settle(
      Timers.retry(
        () => {
          calls++
          controller.abort(fixtureError)
          throw new Error('input failed')
        },
        { signal: controller.signal, delay: 5000 },
      ),
    )
    expect(result).toEqual({ error: fixtureError, rejected: true })
    expect(calls).toBe(1)
  })

  test('rejects with signal.reason when aborted during the delay, and clears the timer', async () => {
    const controller = new AbortController()
    const retrying = Timers.retry(
      () => {
        throw new Error('retry')
      },
      { signal: controller.signal, delay: 5000 },
    )
    await vi.advanceTimersByTimeAsync(50)
    controller.abort(fixtureError)
    await expect(retrying).rejects.toBe(fixtureError)
    expect(vi.getTimerCount()).toBe(0)
  })

  test('rejects with signal.reason when aborted while an attempt is pending', async () => {
    const controller = new AbortController()
    const retrying = Timers.retry(() => new Promise(() => {}), { signal: controller.signal })
    await vi.advanceTimersByTimeAsync(50)
    controller.abort()
    await expect(retrying).rejects.toMatchObject({ name: 'AbortError' })
  })

  test('aborts the attempt signal when the caller aborts', async () => {
    const controller = new AbortController()
    let attemptSignal: AbortSignal | undefined
    const retrying = Timers.retry(
      ({ signal }) => {
        attemptSignal = signal
        return new Promise(() => {})
      },
      { signal: controller.signal, timeout: 10_000 },
    )
    await vi.advanceTimersByTimeAsync(0)
    controller.abort(fixtureError)
    await expect(retrying).rejects.toBe(fixtureError)
    expect(attemptSignal?.reason).toBe(fixtureError)
  })

  test('preserves the abort reason when fn aborts on attempt 3', async () => {
    const controller = new AbortController()
    let calls = 0
    const result = await settle(
      Timers.retry(
        ({ attempt }) => {
          calls++
          if (attempt === 3) {
            controller.abort(fixtureError)
          }
          throw new Error('fail')
        },
        { attempts: 5, signal: controller.signal },
      ),
    )
    expect(result).toEqual({ error: fixtureError, rejected: true })
    expect(calls).toBe(3)
  })

  test('stops during an async retryIf', async () => {
    const controller = new AbortController()
    let calls = 0
    const retrying = Timers.retry(
      () => {
        calls++
        throw new Error('fail')
      },
      {
        attempts: 5,
        signal: controller.signal,
        retryIf: async () => {
          controller.abort(fixtureError)
          return true
        },
      },
    )
    await expect(retrying).rejects.toBe(fixtureError)
    expect(calls).toBe(1)
  })

  test('limits total time with a caller signal', async () => {
    const controller = new AbortController()
    setTimeout(() => controller.abort(new DOMException('Timed out', 'TimeoutError')), 1000)
    let calls = 0
    const result = await settle(
      Timers.retry(
        async () => {
          calls++
          await Timers.sleep(400)
          throw new Error('test')
        },
        { attempts: 10, delay: 100, signal: controller.signal },
      ),
    )
    expect(isTimeoutError((result as { error: unknown }).error)).toBe(true)
    expect(calls).toBe(2)
  })
})

describe('timers', () => {
  test('leaves no timer after success', async () => {
    const controller = new AbortController()
    await settle(
      Timers.retry(({ attempt }) => (attempt < 2 ? Promise.reject(fixtureError) : 1), {
        timeout: 5000,
        signal: controller.signal,
      }),
    )
    expect(vi.getTimerCount()).toBe(0)
  })

  test('leaves no timer after the attempts run out', async () => {
    await settle(
      Timers.retry(
        () => {
          throw fixtureError
        },
        { timeout: 5000 },
      ),
    )
    expect(vi.getTimerCount()).toBe(0)
  })

  test('leaves no timer after an abort during an attempt with a timeout', async () => {
    const controller = new AbortController()
    const retrying = Timers.retry(() => new Promise(() => {}), {
      timeout: 5000,
      signal: controller.signal,
    })
    await vi.advanceTimersByTimeAsync(10)
    controller.abort()
    await expect(retrying).rejects.toMatchObject({ name: 'AbortError' })
    expect(vi.getTimerCount()).toBe(0)
  })
})

describe('onRetry', () => {
  test('receives each error, the attempt that threw it and the wait, only before a retry', async () => {
    const seen: unknown[][] = []
    const result = await settle(
      Timers.retry(
        ({ attempt }) => {
          throw new Error(`attempt ${attempt}`)
        },
        {
          attempts: 3,
          delay: ({ attempt }) => attempt * 2,
          onRetry: (error, { attempt, delay }) => {
            seen.push([(error as Error).message, attempt, delay])
          },
        },
      ),
    )
    expect(result).toMatchObject({ rejected: true })
    expect(seen).toEqual([
      ['attempt 1', 1, 2],
      ['attempt 2', 2, 4],
    ])
  })

  test('is not called when retryIf stops the retries', async () => {
    let called = false
    await settle(
      Timers.retry(
        () => {
          throw fixtureError
        },
        { retryIf: () => false, onRetry: () => void (called = true) },
      ),
    )
    expect(called).toBe(false)
  })

  test('rejects with the error it throws, and the next attempt waits for its promise', async () => {
    const stop = new Error('stop')
    let calls = 0
    let waited = false
    const result = await settle(
      Timers.retry(
        () => {
          calls++
          throw fixtureError
        },
        {
          attempts: 5,
          delay: 0,
          onRetry: async (_, { attempt }) => {
            await new Promise((resolve) => setTimeout(resolve, 1))
            waited = true
            if (attempt === 2) {
              throw stop
            }
          },
        },
      ),
    )
    expect(result).toEqual({ error: stop, rejected: true })
    expect(calls).toBe(2)
    expect(waited).toBe(true)
  })
})
