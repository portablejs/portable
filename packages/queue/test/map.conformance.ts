import { describe, expect, test } from 'vite-plus/test'
import * as Queue from '@portable/queue'
import { concurrencyProbe, countingSignal, deferred, delay, flush } from './utils.js'

const timed: readonly [number, number][] = [
  [10, 30],
  [20, 20],
  [30, 10],
]
const slowly = async ([value, ms]: readonly [number, number]) => {
  await delay(ms)
  return value
}

async function* fromArray<T>(items: readonly T[]) {
  for (const item of items) {
    await delay(0)
    yield item
  }
}

function trackedGenerator(count: number, throwAt = -1) {
  const state = { pulled: 0, closed: false }
  function* generate() {
    try {
      for (let i = 0; i < count; i++) {
        if (i === throwAt) throw new Error(`source failed at ${i}`)
        state.pulled++
        yield i
      }
    } finally {
      state.closed = true
    }
  }
  return { state, iterable: generate() }
}

describe('map', () => {
  test('resolves with the results in input order', async () => {
    expect(await Queue.map(timed, slowly)).toEqual([10, 20, 30])
  })

  test('runs one call at a time with concurrency 1', async () => {
    const probe = concurrencyProbe()
    const results = await Queue.map(timed, ([value, ms]) => probe.run(ms, value), {
      concurrency: 1,
    })
    expect(results).toEqual([10, 20, 30])
    expect(probe.max).toBe(1)
  })

  test('never runs more calls than the concurrency', async () => {
    const probe = concurrencyProbe()
    await Queue.map(Array.from({ length: 40 }), (_, { index }) => probe.run(1 + (index % 9)), {
      concurrency: 4,
    })
    expect(probe.max).toBe(4)
  })

  test('runs every call at once by default', async () => {
    const probe = concurrencyProbe()
    await Queue.map(Array.from({ length: 30 }), () => probe.run(5))
    expect(probe.max).toBe(30)
  })

  test('keeps input order when calls finish in reverse order', async () => {
    const input = [10, 10, 10, 10, 10]
    const results = await Queue.map(
      input,
      async (value, { index }) => {
        await delay((input.length - index) * 5)
        return value + index
      },
      { concurrency: 3 },
    )
    expect(results).toEqual([10, 11, 12, 13, 14])
  })

  test('passes each item its index', async () => {
    function* letters() {
      yield 'a'
      yield 'b'
      yield 'c'
    }
    expect(await Queue.map(letters(), (item, { index }) => `${index}:${item}`)).toEqual([
      '0:a',
      '1:b',
      '2:c',
    ])
  })

  test('resolves with an empty array for empty input', async () => {
    const fail = () => {
      throw new Error('fn should not be called')
    }
    expect(await Queue.map([], fail)).toEqual([])
    expect(await Queue.map(new Set(), fail)).toEqual([])
    expect(await Queue.map(fromArray([]), fail)).toEqual([])
  })

  test('maps any iterable: a Set, a Map, a string and an array iterator', async () => {
    const double = (n: number) => n * 2
    expect(await Queue.map(new Set([1, 2, 3]), double, { concurrency: 2 })).toEqual([2, 4, 6])
    expect(await Queue.map([1, 2, 3].values(), double)).toEqual([2, 4, 6])
    expect(await Queue.map(new Map([['a', 1]]), ([key, value]) => `${key}${value}`)).toEqual(['a1'])
    expect(await Queue.map('ab', (c) => c.toUpperCase())).toEqual(['A', 'B'])
    expect(await Queue.map('', (c) => c)).toEqual([])
    expect(await Queue.map(Object.freeze([1]), double)).toEqual([2])
  })

  test('maps a sparse array into a dense array, and ignores a generator return value', async () => {
    const sparse: number[] = []
    sparse[0] = 1
    sparse[2] = 3
    expect(await Queue.map(sparse, (n) => n)).toEqual([1, undefined, 3])
    function* withReturn() {
      yield 1
      return 2
    }
    expect(await Queue.map(withReturn(), (n) => n)).toEqual([1])
  })

  test('continues a generator that was already partly read', async () => {
    function* numbers() {
      yield 1
      yield 2
      yield 3
    }
    const iterator = numbers()
    iterator.next()
    expect(await Queue.map(iterator, (n) => n)).toEqual([2, 3])
  })

  test('maps 100,000 items with a sync fn without overflowing the stack', async () => {
    const items = Array.from({ length: 100_000 }, (_, i) => i)
    const results = await Queue.map(items, (n) => n + 1, { concurrency: 3 })
    expect(results).toHaveLength(100_000)
    expect(results[99_999]).toBe(100_000)
  })

  test('does not call next() again after the input is done', async () => {
    let calls = 0
    const input = {
      [Symbol.iterator]: () => ({
        next: () =>
          ++calls > 2 ? { done: true as const, value: undefined } : { done: false, value: calls },
      }),
    }
    await Queue.map(input, (n) => n, { concurrency: 2, stopOnError: false })
    expect(calls).toBe(3)
    let asyncCalls = 0
    const asyncInput: AsyncIterable<number> = {
      [Symbol.asyncIterator]: () => ({
        next: async () => {
          await delay(1)
          return ++asyncCalls > 2
            ? { done: true, value: undefined }
            : { done: false, value: asyncCalls }
        },
      }),
    }
    await Queue.map(asyncInput, (n) => n, { concurrency: Infinity })
    expect(asyncCalls).toBe(3)
  })

  test('rejects when next() returns something that is not an object', async () => {
    const input = { [Symbol.iterator]: () => ({ next: () => 5 }) } as unknown as Iterable<number>
    await expect(Queue.map(input, (n) => n)).rejects.toThrow(TypeError)
    const asyncInput = {
      [Symbol.asyncIterator]: () => ({ next: async () => null }),
    } as unknown as AsyncIterable<number>
    await expect(Queue.map(asyncInput, (n) => n)).rejects.toThrow(TypeError)
  })

  test('keeps undefined results', async () => {
    expect(await Queue.map([1, 2], () => undefined)).toEqual([undefined, undefined])
  })

  test('passes items to fn as they are, without awaiting them', async () => {
    const promise = Promise.resolve(1)
    const seen = await Queue.map([promise], (item) => item instanceof Promise)
    expect(seen).toEqual([true])
  })

  test('maps an async iterable', async () => {
    expect(await Queue.map(fromArray([1, 2, 3]), (n) => n * 10, { concurrency: 2 })).toEqual([
      10, 20, 30,
    ])
  })

  test('reads an async iterable one item at a time, as slots free up', async () => {
    let pulled = 0
    async function* source() {
      for (let i = 0; i < 6; i++) {
        pulled++
        yield i
      }
    }
    const gates = Array.from({ length: 6 }, () => deferred())
    const result = Queue.map(source(), (i) => gates[i]!.promise, { concurrency: 2 })
    await flush()
    expect(pulled).toBe(2)
    gates[0]!.resolve()
    await flush()
    expect(pulled).toBe(3)
    for (const gate of gates) gate.resolve()
    expect(await result).toHaveLength(6)
  })

  test('prefers the async iterator when the input has both', async () => {
    const input = {
      *[Symbol.iterator]() {
        yield 'sync'
      },
      async *[Symbol.asyncIterator]() {
        yield 'async'
      },
    }
    expect(await Queue.map(input, (item) => item)).toEqual(['async'])
  })

  test('throws on an invalid concurrency or fn', () => {
    for (const concurrency of [0, -1, 1.5, Number.NaN])
      expect(() => Queue.map([], (x) => x, { concurrency })).toThrow(RangeError)
    expect(() => Queue.map([], undefined as unknown as () => 1)).toThrow(TypeError)
  })

  test('rejects on input that is not iterable', async () => {
    await expect(Queue.map(5 as unknown as number[], (x) => x)).rejects.toThrow(TypeError)
    await expect(Queue.map(null as unknown as number[], (x) => x)).rejects.toThrow(TypeError)
  })
})

describe('map errors', () => {
  test('rejects at once with the first error when stopOnError is true', async () => {
    const started: number[] = []
    const finished: number[] = []
    const error = new Error('bar')
    const result = Queue.map(
      [0, 1, 2, 3],
      async (n) => {
        started.push(n)
        if (n === 1) {
          await delay(10)
          throw error
        }
        await delay(200)
        finished.push(n)
        return n
      },
      { concurrency: 2 },
    )
    await expect(result).rejects.toBe(error)
    expect(finished).toEqual([])
    expect(started).toEqual([0, 1])
  })

  test('a synchronous throw rejects the promise instead of throwing', async () => {
    const error = new Error('sync')
    const result = Queue.map([1], () => {
      throw error
    })
    await expect(result).rejects.toBe(error)
  })

  test('aborts the signal of calls still running after the first error', async () => {
    const error = new Error('first')
    const signals: AbortSignal[] = []
    const result = Queue.map(
      [0, 1, 2],
      async (n, { signal }) => {
        signals.push(signal)
        if (n === 0) throw error
        await delay(20)
      },
      { concurrency: Infinity },
    )
    await expect(result).rejects.toBe(error)
    expect(signals.map((s) => s.aborted)).toEqual([true, true, true])
    expect(signals[1]!.reason).toBe(error)
  })

  test('stops reading the input and closes it after the first error', async () => {
    const { state, iterable } = trackedGenerator(100)
    await expect(
      Queue.map(
        iterable,
        async (n) => {
          await delay(1)
          if (n === 2) throw new Error('mapper')
        },
        { concurrency: 1 },
      ),
    ).rejects.toThrow('mapper')
    expect(state.pulled).toBe(3)
    expect(state.closed).toBe(true)
  })

  test('collects every error in input order into an AggregateError when stopOnError is false', async () => {
    const mapped: number[] = []
    const error = await Queue.map(
      [0, 1, 2, 3, 4],
      async (n) => {
        await delay((5 - n) * 3)
        mapped.push(n)
        if (n % 2 === 1) throw new Error(`fail ${n}`)
        return n
      },
      { concurrency: 2, stopOnError: false },
    ).catch((error: unknown) => error)
    expect(error).toBeInstanceOf(AggregateError)
    expect((error as AggregateError).errors.map((e: Error) => e.message)).toEqual([
      'fail 1',
      'fail 3',
    ])
    expect(mapped.sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4])
  })

  test('keeps errors that are undefined or null when stopOnError is false', async () => {
    const error = await Queue.map([undefined, null, 1], (n) => (n === 1 ? 1 : Promise.reject(n)), {
      stopOnError: false,
    }).catch((error: unknown) => error)
    expect((error as AggregateError).errors).toEqual([undefined, null])
  })

  test('collects synchronous throws without overflowing the stack when stopOnError is false', async () => {
    const error = await Queue.map(
      Array.from({ length: 50_000 }, (_, i) => i),
      (n) => {
        throw n
      },
      { concurrency: 1, stopOnError: false },
    ).catch((error: unknown) => error)
    expect((error as AggregateError).errors).toHaveLength(50_000)
  })

  test('rejects with a source error at the item that throws', async () => {
    const { state, iterable } = trackedGenerator(10, 3)
    const mapped: number[] = []
    await expect(Queue.map(iterable, (n) => mapped.push(n), { concurrency: 1 })).rejects.toThrow(
      'source failed at 3',
    )
    expect(mapped).toEqual([0, 1, 2])
    expect(state.pulled).toBe(3)
  })

  test('rejects with a source error that comes first', async () => {
    const error = new Error('no items')
    const input = {
      [Symbol.iterator](): Iterator<number> {
        throw error
      },
    }
    await expect(Queue.map(input, (n) => n)).rejects.toBe(error)
  })

  test('rejects with an async source error, also when stopOnError is false', async () => {
    const mapped: number[] = []
    async function* source() {
      yield 0
      yield 1
      yield 2
      throw new Error('source failed')
    }
    await expect(
      Queue.map(
        source(),
        async (n) => {
          mapped.push(n)
          await delay(10)
        },
        { concurrency: 2, stopOnError: false },
      ),
    ).rejects.toThrow('source failed')
    await delay(30)
    expect(mapped).toEqual([0, 1, 2])
  })

  test('an iterable that throws after its first items leaves no unhandled rejection', async () => {
    const error = new Error('Iterator failed')
    function* input() {
      yield 1
      yield 2
      yield 3
      throw error
    }
    await expect(
      Queue.map(input(), async (n) => {
        await delay(5)
        throw new Error(`mapper ${n}`)
      }),
    ).rejects.toBe(error)
    await delay(20)
  })

  test('rejects with the first error, and later errors are not unhandled', async () => {
    const result = Queue.map([1, 2, 3], async (n) => {
      await delay(n * 3)
      throw new Error(`fail ${n}`)
    })
    await expect(result).rejects.toThrow('fail 1')
    await delay(20)
  })

  test('closes an async source when a mapper fails', async () => {
    let closed = false
    async function* source() {
      try {
        for (let i = 0; ; i++) yield i
      } finally {
        closed = true
      }
    }
    await expect(
      Queue.map(
        source(),
        (n) => {
          if (n === 3) throw new Error('stop')
        },
        { concurrency: 1 },
      ),
    ).rejects.toThrow('stop')
    await flush()
    expect(closed).toBe(true)
  })

  test('does not close a source it read to the end', async () => {
    const { state, iterable } = trackedGenerator(3)
    await Queue.map(iterable, (n) => n)
    expect(state.closed).toBe(true)
    let returned = false
    const iterator = [1, 2][Symbol.iterator]()
    const input = {
      [Symbol.iterator]: () => ({
        next: () => iterator.next(),
        return: () => {
          returned = true
          return { done: true as const, value: undefined }
        },
      }),
    }
    await Queue.map(input, (n) => n)
    expect(returned).toBe(false)
  })

  test('a source return() that rejects does not change the rejection', async () => {
    const error = new Error('mapper')
    const input: AsyncIterable<number> = {
      [Symbol.asyncIterator]: () => ({
        next: async () => ({ done: false, value: 1 }),
        return: () => Promise.reject(new Error('return failed')),
      }),
    }
    await expect(Queue.map(input, () => Promise.reject(error), { concurrency: 1 })).rejects.toBe(
      error,
    )
    await delay(5)
  })

  test('ends an endless source when the first call throws', async () => {
    function* endless() {
      for (let i = 0; ; i++) yield i
    }
    await expect(
      Queue.map(endless(), (n) => {
        if (n === 5) throw new Error('enough')
        return n
      }),
    ).rejects.toThrow('enough')
  })
})

describe('map signal', () => {
  test('rejects with the abort reason and aborts the signal passed to fn', async () => {
    const controller = new AbortController()
    const signals: AbortSignal[] = []
    const result = Queue.map(
      [1, 2],
      (_, { signal }) => {
        signals.push(signal)
        return new Promise(() => {})
      },
      { signal: controller.signal },
    )
    controller.abort('cancelled')
    await expect(result).rejects.toBe('cancelled')
    expect(signals.every((s) => s.aborted)).toBe(true)
  })

  test('rejects with an already aborted signal without reading the input', async () => {
    const { state, iterable } = trackedGenerator(3)
    await expect(
      Queue.map(iterable, (n) => n, { signal: AbortSignal.abort('early') }),
    ).rejects.toBe('early')
    expect(state.pulled).toBe(0)
  })

  test('stops reading the input and closes it on abort', async () => {
    const controller = new AbortController()
    const { state, iterable } = trackedGenerator(100)
    const result = Queue.map(iterable, () => delay(5), {
      concurrency: 1,
      signal: controller.signal,
    })
    await delay(12)
    controller.abort()
    await expect(result).rejects.toMatchObject({ name: 'AbortError' })
    const pulled = state.pulled
    await delay(20)
    expect(state.pulled).toBe(pulled)
    expect(state.closed).toBe(true)
  })

  test('does not wait for an async source blocked in next()', async () => {
    const controller = new AbortController()
    const source: AsyncIterable<number> = {
      [Symbol.asyncIterator]: () => ({ next: () => new Promise(() => {}) }),
    }
    const result = Queue.map(source, (n) => n, { signal: controller.signal })
    controller.abort('now')
    await expect(result).rejects.toBe('now')
  })

  test('an abort wins over collected errors when stopOnError is false', async () => {
    const controller = new AbortController()
    const result = Queue.map(
      [0, 1],
      async (n) => {
        if (n === 0) throw new Error('first')
        await delay(20)
      },
      { signal: controller.signal, stopOnError: false },
    )
    await delay(5)
    controller.abort('aborted')
    await expect(result).rejects.toBe('aborted')
  })

  test('rejects when AbortSignal.timeout fires', async () => {
    await expect(
      Queue.map([1], () => new Promise(() => {}), { signal: AbortSignal.timeout(10) }),
    ).rejects.toMatchObject({ name: 'TimeoutError' })
  })

  test('removes its abort listener when it resolves or rejects', async () => {
    const counted = countingSignal()
    await Queue.map([1, 2], (n) => n, { signal: counted.signal })
    expect(counted.listeners).toBe(0)
    await Queue.map([1], () => Promise.reject(new Error('x')), { signal: counted.signal }).catch(
      () => {},
    )
    expect(counted.listeners).toBe(0)
  })

  test('one signal shared by several runs aborts all of them', async () => {
    const controller = new AbortController()
    const runs = [1, 2, 3].map(() =>
      Queue.map([1], () => new Promise(() => {}), { signal: controller.signal }),
    )
    controller.abort('all')
    for (const run of runs) await expect(run).rejects.toBe('all')
  })
})

describe('map with a queue', () => {
  test('shares a limit between map and other tasks', async () => {
    const limit = Queue.limit(1)
    const probe = concurrencyProbe()
    const direct = limit(() => probe.run(10, 2))
    const mapped = Queue.map([2, 3], (n) => limit(() => probe.run(10, n * 2)))
    expect(await Promise.all([direct, mapped])).toEqual([2, [4, 6]])
    expect(probe.max).toBe(1)
  })
})
