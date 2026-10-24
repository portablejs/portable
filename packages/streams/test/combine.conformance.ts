import { describe, expect, test } from 'vite-plus/test'
import {
  MaxBytesError,
  concat,
  fromIterable,
  limitBytes,
  merge,
  toArray,
  toBytes,
  toText,
} from '@portable/streams'
import { collect, delay, encode, fromChunks, pushable } from './utils.js'

/** merge-stream's `range(n)`: counts from n toward 0, one value every 6 to 12 ms. */
async function* range(n: number) {
  const step = n > 0 ? -1 : 1
  while (n !== 0) {
    await delay(6 + Math.round(Math.random() * 6))
    yield (n += step)
  }
}

function later(ms: number, fn: () => void) {
  setTimeout(fn, ms)
}

describe('merge2', () => {
  test('merge2(read1, read2, through3)', async () => {
    const read1 = pushable<number>()
    const read2 = pushable<number>()
    const through3 = new TransformStream<number, number>()
    const merged = concat([read1.stream, read2.stream, through3.readable])

    read1.push(1)
    later(100, () => {
      read1.push(2)
      read1.end()
    })
    read2.push(3)
    later(10, () => {
      read2.push(4)
      read2.end()
    })
    const writer = through3.writable.getWriter()
    void writer.write(5)
    later(200, () => {
      void writer.write(6)
      void writer.close()
    })

    expect(await collect(merged)).toEqual([1, 2, 3, 4, 5, 6])
  })

  test('merge2 - error handling', async () => {
    const ts = new TransformStream()
    const merged = concat([ts.readable])
    const expected = new Error('error')
    later(100, () => void ts.writable.abort(expected))
    await expect(collect(merged)).rejects.toBe(expected)
  })

  test('merge2(TransformStream)', async () => {
    const ts = new TransformStream<number, number>()
    const writer = ts.writable.getWriter()
    void writer.write(1)
    later(100, () => {
      void writer.write(2)
      void writer.close()
    })
    expect(await collect(concat([ts.readable]))).toEqual([1, 2])
  })

  test('merge2(read1, [read2, through3], through4, [through5, read6])', async () => {
    const read1 = pushable<number>()
    const read2 = pushable<number>()
    const through3 = pushable<number>()
    const through4 = pushable<number>()
    const through5 = pushable<number>()
    const read6 = pushable<number>()
    read1.push(1)
    read1.end()
    later(100, () => {
      read2.push(2)
      read2.end()
    })
    through3.push(3)
    through3.end()
    through4.push(4)
    through4.end()
    through5.push(5)
    through5.end()
    later(200, () => {
      read6.push(6)
      read6.end()
    })

    const merged = concat([
      read1.stream,
      merge([read2.stream, through3.stream]),
      through4.stream,
      merge([through5.stream, read6.stream]),
    ])
    expect(await collect(merged)).toEqual([1, 3, 2, 4, 5, 6])
  })

  test('merge2(read1, read2, through3, {objectMode: false})', async () => {
    const read1 = pushable<string>()
    const read2 = pushable<string>()
    const through3 = pushable<string>()
    read1.push('1')
    later(100, () => {
      read1.push('2')
      read1.end()
    })
    read2.push('3')
    later(10, () => {
      read2.push('4')
      read2.end()
    })
    through3.push('5')
    later(200, () => {
      through3.push('6')
      through3.end()
    })
    expect(await toText(concat([read1.stream, read2.stream, through3.stream]))).toBe('123456')
  })

  test('merge2(merge2(through4, [through5, read6]), read1, [read2, through3])', async () => {
    const read1 = pushable<number>()
    const read2 = pushable<number>()
    const through3 = pushable<number>()
    const through4 = pushable<number>()
    const through5 = pushable<number>()
    const read6 = pushable<number>()
    read1.push(1)
    read1.end()
    later(100, () => {
      read2.push(2)
      read2.end()
    })
    through3.push(3)
    through3.end()
    through4.push(4)
    through4.end()
    through5.push(5)
    through5.end()
    later(10, () => {
      read6.push(6)
      read6.end()
    })

    const inner = concat([through4.stream, merge([through5.stream, read6.stream])])
    const merged = concat([inner, read1.stream, merge([read2.stream, through3.stream])])
    expect(await collect(merged)).toEqual([4, 5, 6, 1, 3, 2])
  })
})

describe('merge-stream', () => {
  test('smoke', async () => {
    const sources = Array.from({ length: 74 }, (_, i) => range(i - 36))
    const values = await toArray(merge(sources))
    expect(values.reduce((sum, n) => sum + n, 0)).toBe(666)
  })

  test('reads no further than the reader asks', async () => {
    let produced = 0
    async function* counting() {
      for (let i = 0; i < 100; i++) {
        produced++
        yield i
      }
    }
    const reader = merge([counting(), counting()]).getReader()
    await reader.read()
    await delay(20)
    expect(produced).toBeLessThanOrEqual(2)
    await reader.cancel()
  })

  test('array', async () => {
    expect(await toArray(merge([range(100), range(-100)]))).toHaveLength(200)
  })

  test('propagates errors', async () => {
    const failing = pushable<number>()
    const fine = pushable<number>()
    let fineCancelled: unknown
    const fineStream = new ReadableStream<number>({
      pull: async (c) => {
        await delay(1)
        c.enqueue(0)
      },
      cancel: (reason) => {
        fineCancelled = reason
      },
    })
    const error = new Error('TEST: INTERNAL STREAM ERROR')
    failing.push(1)
    later(50, () => failing.error(error))
    const reader = merge([failing.stream, fineStream]).getReader()
    let thrown: unknown
    try {
      for (;;) {
        if ((await reader.read()).done) {
          break
        }
      }
    } catch (e) {
      thrown = e
    }
    expect(thrown).toBe(error)
    expect(fineCancelled).toBe(error)
    fine.end()
  })
})

describe('concat', () => {
  test('joins streams, iterables and async iterables in order', async () => {
    async function* gen() {
      yield 'c'
      yield 'd'
    }
    expect(await toText(concat([fromChunks(['a']), ['b'], gen(), new Set(['e'])]))).toBe('abcde')
  })

  test('with no sources is empty', async () => {
    expect(await collect(concat([]))).toEqual([])
  })

  test('starts reading a source only after the previous one ended', async () => {
    let started = false
    const second = new ReadableStream<number>(
      {
        pull(c) {
          started = true
          c.enqueue(2)
          c.close()
        },
      },
      { highWaterMark: 0 },
    )
    const first = pushable<number>()
    const reader = concat([first.stream, second]).getReader()
    first.push(1)
    expect(await reader.read()).toEqual({ done: false, value: 1 })
    await delay(10)
    expect(started).toBe(false)
    first.end()
    expect(await reader.read()).toEqual({ done: false, value: 2 })
  })

  test('cancelling the output cancels every source', async () => {
    const reasons: unknown[] = []
    const source = () =>
      new ReadableStream({ pull: (c) => c.enqueue(1), cancel: (r) => void reasons.push(r) })
    const reader = concat([source(), source(), source()]).getReader()
    await reader.read()
    await reader.cancel('stop')
    expect(reasons).toEqual(['stop', 'stop', 'stop'])
  })

  test('an error in one source cancels the sources not yet read', async () => {
    const error = new Error('boom')
    let cancelled: unknown
    const failing = new ReadableStream({ start: (c) => c.error(error) })
    const rest = new ReadableStream({ cancel: (r) => void (cancelled = r) })
    await expect(collect(concat([['a'], failing, rest]))).rejects.toBe(error)
    expect(cancelled).toBe(error)
  })

  test('runs the finally block of a generator source when cancelled', async () => {
    let finalized = false
    async function* gen() {
      try {
        for (;;) {
          yield 1
        }
      } finally {
        finalized = true
      }
    }
    const reader = concat([gen()]).getReader()
    await reader.read()
    await reader.cancel()
    expect(finalized).toBe(true)
  })
})

describe('merge', () => {
  test('with no sources is empty', async () => {
    expect(await collect(merge([]))).toEqual([])
  })

  test('passes chunks on in the order they arrive', async () => {
    const a = pushable<string>()
    const b = pushable<string>()
    const result = collect(merge([a.stream, b.stream]))
    b.push('b1')
    await delay(5)
    a.push('a1')
    await delay(5)
    b.push('b2')
    b.end()
    await delay(5)
    a.end()
    expect(await result).toEqual(['b1', 'a1', 'b2'])
  })

  test('cancelling the output cancels every source', async () => {
    const reasons: unknown[] = []
    const source = () =>
      new ReadableStream({ pull: (c) => c.enqueue(1), cancel: (r) => void reasons.push(r) })
    const reader = merge([source(), fromIterable([1, 2]), source()]).getReader()
    await reader.read()
    await reader.cancel('stop')
    expect(reasons).toEqual(['stop', 'stop'])
  })
})

describe('limitBytes', () => {
  test('passes chunks through unchanged up to the limit', async () => {
    const chunks = [encode('ab'), 'cd', encode('e')]
    expect(await collect(fromChunks(chunks).pipeThrough(limitBytes(5)))).toEqual(chunks)
  })

  test('fails with MaxBytesError and cancels the source past the limit', async () => {
    let cancelled: unknown
    let i = 0
    const source = new ReadableStream<Uint8Array>({
      pull: (c) => c.enqueue(new Uint8Array(++i)),
      cancel: (reason) => void (cancelled = reason),
    })
    const output: Uint8Array[] = []
    const reader = source.pipeThrough(limitBytes(5)).getReader()
    const error = await (async () => {
      for (;;) {
        output.push((await reader.read()).value!)
      }
    })().catch((e) => e)
    expect(error).toBeInstanceOf(MaxBytesError)
    expect(output.map((chunk) => chunk.length)).toEqual([1, 2])
    expect(cancelled).toBeInstanceOf(MaxBytesError)
  })

  test('counts string chunks as UTF-8 bytes', async () => {
    await expect(toBytes(fromChunks(['€']).pipeThrough(limitBytes(2)))).rejects.toThrow(
      MaxBytesError,
    )
    expect(await toText(fromChunks(['€']).pipeThrough(limitBytes(3)))).toBe('€')
  })
})

describe.each([
  ['concat', concat],
  ['merge', merge],
] as const)('%s with a signal', (_, combine) => {
  test('errors the output with the reason and cancels every source', async () => {
    const reasons: unknown[] = []
    const source = () =>
      new ReadableStream<number>({ cancel: (reason) => void reasons.push(reason) })
    const controller = new AbortController()
    const reader = combine([source(), source()], { signal: controller.signal }).getReader()
    const read = reader.read()
    const reason = new Error('stop')
    controller.abort(reason)
    await expect(read).rejects.toBe(reason)
    await expect.poll(() => reasons).toEqual([reason, reason])
  })

  test('errors at once for an aborted signal', async () => {
    const reason = new Error('already')
    await expect(toArray(combine([[1]], { signal: AbortSignal.abort(reason) }))).rejects.toBe(
      reason,
    )
  })

  test('passes every chunk through when the signal never aborts', async () => {
    const { signal } = new AbortController()
    expect(await toArray(combine([[1], [2]], { signal }))).toEqual([1, 2])
  })

  test('throws a TypeError for sources that are not an array', () => {
    // @ts-expect-error
    expect(() => combine(fromIterable([1]))).toThrow(TypeError)
  })
})
