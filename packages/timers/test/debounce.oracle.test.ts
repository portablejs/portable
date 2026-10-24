import * as Timers from '@portable/timers'
import lodashDebounce from 'lodash/debounce.js'
import lodashThrottle from 'lodash/throttle.js'
import legacyDebounce from 'lodash.debounce'
import legacyThrottle from 'lodash.throttle'
import pDebounce from 'p-debounce'
import { describe, expect, test, vi } from 'vite-plus/test'
import { useFakeTimers } from './utils.js'

useFakeTimers()

function random(seed: number): () => number {
  let state = seed
  return () => {
    state = (state * 1103515245 + 12345) % 2 ** 31
    return state / 2 ** 31
  }
}

type Op = { gap: number; kind: 'call' | 'flush' | 'cancel'; arg: number }

function schedule(seed: number, wait: number, withControls: boolean): Op[] {
  const next = random(seed)
  return Array.from({ length: 60 }, (_, arg) => {
    const roll = next()
    const kind = !withControls || roll < 0.9 ? 'call' : roll < 0.95 ? 'flush' : 'cancel'
    return { gap: Math.floor(next() * wait * 2.5), kind, arg }
  })
}

type Wrapped = {
  (arg: number): unknown
  cancel(): void
  flush(): unknown
}

async function run(make: (fn: (arg: number) => number) => Wrapped, ops: readonly Op[]) {
  const start = Date.now()
  const invocations: [number, number][] = []
  const wrapped = make((arg) => {
    invocations.push([Date.now() - start, arg])
    return arg
  })
  for (const op of ops) {
    await vi.advanceTimersByTimeAsync(op.gap)
    if (op.kind === 'call') {
      Promise.resolve(wrapped(op.arg)).catch(() => {})
    } else if (op.kind === 'flush') {
      Promise.resolve(wrapped.flush()).catch(() => {})
    } else {
      wrapped.cancel()
    }
  }
  await vi.advanceTimersByTimeAsync(10_000)
  return invocations
}

function ours(wrapped: Timers.Debounced<[number], number>): Wrapped {
  return wrapped
}

const settings = [
  {},
  { leading: true },
  { leading: true, trailing: false },
  { maxWait: 50 },
  { leading: true, maxWait: 50 },
  { leading: true, trailing: false, maxWait: 50 },
  { maxWait: 10 },
]

describe('debounce matches lodash 4.18 debounce', () => {
  for (const wait of [0, 10, 32, 100]) {
    for (const options of settings) {
      for (const withControls of [false, true]) {
        test(`ms ${wait}, ${JSON.stringify(options)}${withControls ? ', with flush and cancel' : ''}`, async () => {
          for (const seed of [1, 2, 3]) {
            const ops = schedule(seed * 7 + wait, Math.max(wait, 4), withControls)
            const a = await run((fn) => ours(Timers.debounce(fn, wait, options)), ops)
            const b = await run((fn) => lodashDebounce(fn, wait, options), ops)
            expect(a).toEqual(b)
          }
        })
      }
    }
  }
})

describe('throttle matches lodash 4.18 throttle', () => {
  for (const wait of [0, 10, 32, 100]) {
    for (const options of [{}, { leading: false }, { trailing: false }]) {
      for (const withControls of [false, true]) {
        test(`ms ${wait}, ${JSON.stringify(options)}${withControls ? ', with flush and cancel' : ''}`, async () => {
          for (const seed of [1, 2, 3]) {
            const ops = schedule(seed * 13 + wait, Math.max(wait, 4), withControls)
            const a = await run((fn) => ours(Timers.throttle(fn, wait, options)), ops)
            const b = await run((fn) => lodashThrottle(fn, wait, options), ops)
            expect(a).toEqual(b)
          }
        })
      }
    }
  }
})

describe('lodash.debounce and lodash.throttle 4.x', () => {
  test('match where maxWait is at least ms', async () => {
    for (const seed of [1, 2, 3]) {
      const ops = schedule(seed, 32, true)
      expect(
        await run((fn) => ours(Timers.debounce(fn, 32, { leading: true, maxWait: 50 })), ops),
      ).toEqual(
        await run(
          (fn) => legacyDebounce(fn, 32, { leading: true, maxWait: 50 }) as unknown as Wrapped,
          ops,
        ),
      )
      expect(await run((fn) => ours(Timers.throttle(fn, 32)), ops)).toEqual(
        await run((fn) => legacyThrottle(fn, 32) as unknown as Wrapped, ops),
      )
    }
  })

  test('lodash.debounce 4.0.8 invokes at other times when maxWait is below ms, and lodash 4.18 does not', async () => {
    let differences = 0
    for (const seed of [1, 2, 3]) {
      const ops = schedule(seed * 7 + 100, 100, false)
      const fixed = await run((fn) => lodashDebounce(fn, 100, { maxWait: 10 }), ops)
      const legacy = await run((fn) => legacyDebounce(fn, 100, { maxWait: 10 }), ops)
      expect(await run((fn) => ours(Timers.debounce(fn, 100, { maxWait: 10 })), ops)).toEqual(fixed)
      if (JSON.stringify(legacy) !== JSON.stringify(fixed)) {
        differences++
      }
    }
    expect(differences).toBeGreaterThan(0)
  })
})

describe('debounce matches p-debounce', () => {
  for (const before of [false, true]) {
    test(`resolves every call with the same value, before: ${before}`, async () => {
      for (const seed of [1, 2, 3]) {
        const ops = schedule(seed, 50, false)
        const results = async (wrapped: (arg: number) => Promise<number>) => {
          const values: Promise<number>[] = []
          for (const op of ops) {
            await vi.advanceTimersByTimeAsync(op.gap)
            values.push(wrapped(op.arg))
          }
          await vi.advanceTimersByTimeAsync(10_000)
          return Promise.all(values)
        }
        const options = before ? { leading: true, trailing: false } : {}
        expect(await results(Timers.debounce((arg: number) => arg, 50, options))).toEqual(
          await results(pDebounce(async (arg: number) => arg, 50, { before })),
        )
      }
    })
  }
})
