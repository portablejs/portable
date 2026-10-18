import { describe, expect, test } from 'vite-plus/test'
import {
  batch,
  filter,
  fromIterable,
  map,
  tap,
  toArray,
  toAsyncIterable,
  toText,
  transform,
} from '@portable/streams'
import { collect, decode, delay, encode, fromChunks } from './utils.js'

const through = <I, O>(chunks: readonly I[], pair: ReadableWritablePair<O, I>) =>
  collect(fromChunks(chunks).pipeThrough(pair))

const double = () =>
  transform(async function* (source: AsyncIterable<string>) {
    for await (const chunk of source) {
      yield chunk
      yield chunk
    }
  })

const evens = () =>
  transform(async function* (source: AsyncIterable<number>) {
    for await (const n of source) if (n % 2 === 0) yield n
  })

describe('through2: web', () => {
  test('classicControllerEnqueue', async () => {
    expect((await through(['a', 'b'], double())).join('')).toBe('aabb')
  })

  test('asyncReturnedValueEnqueued', async () => {
    expect(
      await through(
        [0, 1, 2, 3, 4],
        filter(async (n: number) => n % 2 === 0),
      ),
    ).toEqual([0, 2, 4])
  })

  test('asyncgenFanOut', async () => {
    expect(await through(['a', 'b'], double())).toEqual(['a', 'a', 'b', 'b'])
  })

  test('asyncgenFilter', async () => {
    expect(await through([0, 1, 2, 3, 4, 5], evens())).toEqual([0, 2, 4])
  })

  test('flushClassic and flushAsync', async () => {
    const withEnd = transform(async function* (source: AsyncIterable<string>) {
      yield* source
      yield 'END'
    })
    expect(await through(['a', 'b'], withEnd)).toEqual(['a', 'b', 'END'])
  })

  test('asyncRejectedPropagates', async () => {
    const failing = map(async () => {
      throw new Error('boom')
    })
    await expect(through(['x'], failing)).rejects.toThrow('boom')
  })

  test('asyncgenThrownPropagates', async () => {
    // oxlint-disable-next-line require-yield
    const failing = transform(async function* () {
      throw new Error('gen-boom')
    })
    await expect(through(['x'], failing)).rejects.toThrow('gen-boom')
  })

  test('noopDefault', async () => {
    const identity = transform(async function* (source: AsyncIterable<string>) {
      yield* source
    })
    expect(await through(['a', 'b', 'c'], identity)).toEqual(['a', 'b', 'c'])
  })

  test('asyncgenWritableBackpressure', async () => {
    let pulled = 0
    let yielded = 0
    let maxAhead = 0
    const source = new ReadableStream<number>(
      {
        pull(controller) {
          if (pulled === 200) return controller.close()
          controller.enqueue(pulled++)
          maxAhead = Math.max(maxAhead, pulled - yielded)
        },
      },
      { highWaterMark: 0 },
    )
    const slow = transform(async function* (input: AsyncIterable<number>) {
      for await (const n of input) {
        await delay(1)
        yielded++
        yield n
      }
    })
    const out = await collect(source.pipeThrough(slow))
    expect(out).toEqual(Array.from({ length: 200 }, (_, i) => i))
    expect(maxAhead).toBeLessThan(8)
  })

  test('asyncgenCancelRunsFinally', async () => {
    let finalized = false
    const ts = transform(async function* (source: AsyncIterable<string>) {
      try {
        for await (const chunk of source) yield chunk
      } finally {
        finalized = true
      }
    })
    const upstream = new ReadableStream({ start: (c) => c.enqueue('a') })
    const reader = upstream.pipeThrough(ts).getReader()
    await reader.read()
    await reader.cancel()
    expect(finalized).toBe(true)
  })

  test('asyncgenReaderBackpressure', async () => {
    let produced = 0
    const fanOut = transform(async function* (source: AsyncIterable<string>) {
      for await (const _ of source) {
        for (let i = 0; i < 50; i++) {
          produced++
          yield i
        }
      }
    })
    const reader = fromChunks(['go']).pipeThrough(fanOut).getReader()
    const out: number[] = []
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      out.push(value)
      expect(produced - out.length).toBeLessThanOrEqual(1)
      await delay(1)
    }
    expect(out).toEqual(Array.from({ length: 50 }, (_, i) => i))
  })
})

describe('through2: node', () => {
  const fillByIndex = () =>
    map((chunk: Uint8Array, index: number) => new Uint8Array(chunk.length).fill(97 + index))

  test('classicByteTransform', async () => {
    const out = await through(
      [new Uint8Array(10), new Uint8Array(5), new Uint8Array(10)],
      fillByIndex(),
    )
    expect(out.map(decode).join('')).toBe('aaaaaaaaaabbbbbcccccccccc')
  })

  test('classicNoopTransform and classicCallbackShorthand', async () => {
    expect(await toText(fromChunks([encode('eeee')]).pipeThrough(new TransformStream()))).toBe(
      'eeee',
    )
  })

  test('classicFlush and asyncgenWithClassicFlush', async () => {
    const withEnd = transform(async function* (source: AsyncIterable<Uint8Array>) {
      for await (const chunk of source) yield chunk
      yield encode('end')
    })
    const chunks = [encode('aaa'), encode('bb')]
    expect(await toText(fromChunks(chunks).pipeThrough(withEnd))).toBe('aaabbend')
  })

  test('asyncReturnedValuePushed', async () => {
    const out = await through(
      [new Uint8Array([1]), new Uint8Array([2])],
      map(async () => 'X'),
    )
    expect(out.join('')).toBe('XX')
  })

  test('asyncUndefinedSkipsEmission', async () => {
    expect(
      await through(
        [0, 1, 2, 3, 4, 5],
        filter(async (n: number) => n % 2 === 0),
      ),
    ).toEqual([0, 2, 4])
  })

  test('asyncgenOneToOne', async () => {
    const doubled = transform(async function* (source: AsyncIterable<number>) {
      for await (const n of source) yield n * 2
    })
    expect(await through([1, 2, 3, 4], doubled)).toEqual([2, 4, 6, 8])
  })

  test('objectTransformPassthrough and legacyDefaultObj', async () => {
    const plusOne = map((chunk: { in: number }) => ({ out: chunk.in + 1 }))
    expect(await through([{ in: 1 }, { in: 2 }, { in: 3 }], plusOne)).toEqual([
      { out: 2 },
      { out: 3 },
      { out: 4 },
    ])
  })

  test('objectTransformFromReadable', async () => {
    const records = [
      { temp: -2.2, unit: 'F' },
      { temp: -40, unit: 'F' },
      { temp: 212, unit: 'F' },
      { temp: 22, unit: 'C' },
    ]
    const celsius = map(async (r: { temp: number; unit: string }) =>
      r.unit === 'F' ? { temp: ((r.temp - 32) * 5) / 9, unit: 'C' } : r,
    )
    const out = await collect(fromIterable(records).pipeThrough(celsius))
    expect(out.map((r) => Math.round(r.temp))).toEqual([-19, -40, 100, 22])
    expect(out.every((r) => r.unit === 'C')).toBe(true)
  })

  test('transformerReusableFactory', async () => {
    const a = through([new Uint8Array(3), new Uint8Array(2)], fillByIndex())
    const b = through([new Uint8Array(2), new Uint8Array(3)], fillByIndex())
    expect((await a).map(decode).join('')).toBe('aaabb')
    expect((await b).map(decode).join('')).toBe('aabbb')
  })

  test('transformerAsyncSupported', async () => {
    expect(
      await through(
        [1, 2],
        map(async (n: number) => n * 10),
      ),
    ).toEqual([10, 20])
  })

  test('transformerAsyncgenSupported', async () => {
    const doubled = () =>
      transform(async function* (source: AsyncIterable<number>) {
        for await (const n of source) yield n * 2
      })
    const [a, b] = await Promise.all([through([1, 2], doubled()), through([10, 20], doubled())])
    expect(a).toEqual([2, 4])
    expect(b).toEqual([20, 40])
  })

  test('asyncgenDownstreamBackpressure', async () => {
    const fanOut = transform(async function* (source: AsyncIterable<string>) {
      for await (const _ of source) for (let i = 0; i < 20; i++) yield i
    })
    const output = fromChunks(['start']).pipeThrough(fanOut)
    await delay(50)
    expect(await collect(output)).toEqual(Array.from({ length: 20 }, (_, i) => i))
  })

  test('asyncgenDestroyMidStream', async () => {
    const reader = fromChunks([1, 2, 3])
      .pipeThrough(double() as never)
      .getReader()
    await reader.read()
    await reader.read()
    await reader.cancel()
    expect(await reader.closed).toBeUndefined()
  })

  test('asyncgenDestroyRunsFinally', async () => {
    let finalized = false
    let upstreamCancelled = false
    const ts = transform(async function* (source: AsyncIterable<string>) {
      try {
        for await (const chunk of source) yield chunk
      } finally {
        finalized = true
      }
    })
    const upstream = new ReadableStream<string>({
      start: (c) => c.enqueue('a'),
      cancel: () => void (upstreamCancelled = true),
    })
    const reader = upstream.pipeThrough(ts).getReader()
    await reader.read()
    await reader.cancel()
    await delay(0)
    expect(finalized).toBe(true)
    expect(upstreamCancelled).toBe(true)
  })
})

describe('transform', () => {
  test('cancels the input when the generator throws', async () => {
    let cancelled: unknown
    const error = new Error('boom')
    const upstream = new ReadableStream<number>({
      pull: (c) => c.enqueue(1),
      cancel: (reason) => void (cancelled = reason),
    })
    const failing = transform(async function* (source: AsyncIterable<number>) {
      for await (const n of source) {
        yield n
        throw error
      }
    })
    await expect(collect(upstream.pipeThrough(failing))).rejects.toBe(error)
    expect(cancelled).toBe(error)
  })

  test('cancelling while the generator waits for input runs finally and cancels upstream', async () => {
    let finalized = false
    let upstreamCancelled: unknown
    const upstream = new ReadableStream<number>({
      cancel: (reason) => void (upstreamCancelled = reason),
    })
    const ts = transform(async function* (source: AsyncIterable<number>) {
      try {
        yield 0
        for await (const n of source) yield n
      } finally {
        finalized = true
      }
    })
    const reader = upstream.pipeThrough(ts).getReader()
    await reader.read()
    const pending = reader.read()
    await delay(5)
    await reader.cancel('stop')
    expect(await pending).toEqual({ done: true, value: undefined })
    expect(finalized).toBe(true)
    await delay(0)
    expect(upstreamCancelled).toBe('stop')
  })

  test('errors the output when the input fails', async () => {
    const error = new Error('upstream')
    const upstream = new ReadableStream<number>({
      start(c) {
        c.enqueue(1)
        c.error(error)
      },
    })
    const identity = transform(async function* (source: AsyncIterable<number>) {
      yield* source
    })
    await expect(collect(upstream.pipeThrough(identity))).rejects.toBe(error)
  })

  test('keeps state across chunks in local variables', async () => {
    const lines = transform(async function* (source: AsyncIterable<string>) {
      let buffer = ''
      for await (const chunk of source) {
        const parts = (buffer + chunk).split('\n')
        buffer = parts.pop()!
        yield* parts
      }
      if (buffer) yield buffer
    })
    expect(await through(['a\nb', 'c\n', 'd'], lines)).toEqual(['a', 'bc', 'd'])
  })
})

describe('fromIterable', () => {
  test('reads arrays, sets, generators and async generators', async () => {
    function* gen() {
      yield 1
      yield 2
    }
    async function* asyncGen() {
      yield 1
      await delay(0)
      yield 2
    }
    expect(await collect(fromIterable([1, 2]))).toEqual([1, 2])
    expect(await collect(fromIterable(new Set([1, 2])))).toEqual([1, 2])
    expect(await collect(fromIterable(gen()))).toEqual([1, 2])
    expect(await collect(fromIterable(asyncGen()))).toEqual([1, 2])
  })

  test('awaits promises yielded by a sync iterable', async () => {
    expect(await collect(fromIterable([Promise.resolve(1), 2]))).toEqual([1, 2])
  })

  test('pulls one value per read', async () => {
    let produced = 0
    function* counter() {
      for (;;) yield produced++
    }
    const reader = fromIterable(counter()).getReader()
    await delay(0)
    expect(produced).toBe(0)
    await reader.read()
    await reader.read()
    await delay(0)
    expect(produced).toBe(2)
    await reader.cancel()
  })

  test('cancelling calls return() so finally blocks run', async () => {
    const state = { finally: false, sync: false }
    async function* asyncGen() {
      try {
        for (;;) yield 1
      } finally {
        state.finally = true
      }
    }
    function* syncGen() {
      try {
        for (;;) yield 1
      } finally {
        state.sync = true
      }
    }
    for (const stream of [fromIterable(asyncGen()), fromIterable(syncGen())]) {
      const reader = stream.getReader()
      await reader.read()
      await reader.cancel()
    }
    expect(state).toEqual({ finally: true, sync: true })
  })

  test('errors the stream when the iterator throws', async () => {
    const error = new Error('boom')
    // oxlint-disable-next-line require-yield
    async function* failing() {
      throw error
    }
    await expect(collect(fromIterable(failing()))).rejects.toBe(error)
  })
})

describe('toAsyncIterable', () => {
  test('iterates a stream', async () => {
    const chunks: string[] = []
    for await (const chunk of toAsyncIterable(fromChunks(['a', 'b']))) chunks.push(chunk)
    expect(chunks).toEqual(['a', 'b'])
  })

  test('breaking out of the loop cancels the stream', async () => {
    let cancelled = false
    const stream = new ReadableStream<number>({
      pull: (c) => c.enqueue(1),
      cancel: () => void (cancelled = true),
    })
    for await (const _ of toAsyncIterable(stream)) break
    expect(cancelled).toBe(true)
    expect(stream.locked).toBe(false)
  })

  test('with preventCancel, breaking out only releases the lock', async () => {
    let cancelled = false
    const stream = new ReadableStream<number>({
      pull: (c) => c.enqueue(1),
      cancel: () => void (cancelled = true),
    })
    for await (const _ of toAsyncIterable(stream, { preventCancel: true })) break
    expect(cancelled).toBe(false)
    expect(stream.locked).toBe(false)
    expect((await stream.getReader().read()).value).toBe(1)
  })

  test('throws the stream error and releases the lock', async () => {
    const error = new Error('boom')
    const stream = new ReadableStream({ start: (c) => c.error(error) })
    const iterate = async () => {
      for await (const _ of toAsyncIterable(stream));
    }
    await expect(iterate()).rejects.toBe(error)
    expect(stream.locked).toBe(false)
  })

  test('works with the collectors', async () => {
    expect(await toArray(toAsyncIterable(fromChunks([1, 2])))).toEqual([1, 2])
  })
})

describe('map, filter, tap, batch', () => {
  test('map passes the chunk index and keeps order with async functions', async () => {
    const slowFirst = map(async (chunk: string, index: number) => {
      await delay(index === 0 ? 10 : 0)
      return `${index}:${chunk}`
    })
    expect(await through(['a', 'b', 'c'], slowFirst)).toEqual(['0:a', '1:b', '2:c'])
  })

  test('filter narrows with a type guard', async () => {
    const strings = filter((chunk: string | number) => typeof chunk === 'string')
    expect(await through(['a', 1, 'b'], strings)).toEqual(['a', 'b'])
  })

  test('tap sees each chunk and passes it on unchanged', async () => {
    const seen: [string, number][] = []
    const out = await through(
      ['a', 'b'],
      tap((chunk: string, index) => void seen.push([chunk, index])),
    )
    expect(out).toEqual(['a', 'b'])
    expect(seen).toEqual([
      ['a', 0],
      ['b', 1],
    ])
  })

  test('tap waits for an async function', async () => {
    const order: string[] = []
    const out = fromChunks(['a']).pipeThrough(
      tap(async () => {
        await delay(5)
        order.push('tap')
      }),
    )
    const reader = out.getReader()
    await reader.read()
    order.push('read')
    expect(order).toEqual(['tap', 'read'])
  })

  test('a throwing function errors the stream', async () => {
    const error = new Error('boom')
    for (const pair of [
      map(() => {
        throw error
      }),
      filter(() => {
        throw error
      }),
      tap(() => {
        throw error
      }),
    ])
      await expect(through(['a'], pair)).rejects.toBe(error)
  })

  test('batch groups chunks and emits the rest at the end', async () => {
    expect(await through([1, 2, 3, 4, 5], batch(2))).toEqual([[1, 2], [3, 4], [5]])
    expect(await through([1, 2], batch(2))).toEqual([[1, 2]])
    expect(await through([], batch(2))).toEqual([])
  })

  test('batch rejects a size that is not a positive integer', () => {
    for (const size of [0, -1, 1.5, Number.NaN]) expect(() => batch(size)).toThrow(RangeError)
  })
})
