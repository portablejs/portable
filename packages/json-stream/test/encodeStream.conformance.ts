import { fromIterable } from '@portable/streams'
import { describe, expect, test } from 'vite-plus/test'
import { encodeStream } from '@portable/json-stream'
import { deferred, encodeText, lineSeparator, streamOf } from './utils.js'

const decoder = new TextDecoder()

async function readText(reader: ReadableStreamDefaultReader<Uint8Array>): Promise<string> {
  const { value } = await reader.read()
  return value === undefined ? '' : decoder.decode(value)
}

async function readRest(reader: ReadableStreamDefaultReader<Uint8Array>): Promise<string> {
  let text = ''
  for (let result = await reader.read(); !result.done; result = await reader.read())
    text += decoder.decode(result.value)
  return text
}

function erroring(error: Error): ReadableStream<unknown> {
  let sent = false
  return new ReadableStream({
    pull(controller) {
      if (sent) controller.error(error)
      else controller.enqueue(1)
      sent = true
    },
  })
}

describe('json-stream-stringify', () => {
  const date = new Date()

  const cases = [
    ['null', null, 'null'],
    ['Infinity', Infinity, 'null'],
    ['a date', date, `"${date.toJSON()}"`],
    ['true', true, 'true'],
    ['a symbol', Symbol('test'), ''],
    ['1', 1, '1'],
    ['a newline', '\n', '"\\n"'],
    ['non-ASCII text', '漢字', '"漢字"'],
    ['an empty object', {}, '{}'],
    ['a regexp', /regex/gi, '{}'],
    ['a key named undefined', { undefined: null }, '{"undefined":null}'],
    ['an empty key', { '': null }, '{"":null}'],
    ['an undefined property', { a: undefined }, '{}'],
    ['a null property', { a: null }, '{"a":null}'],
    ['an undefined property after another', { a: 1, b: undefined }, '{"a":1}'],
    ['a promise of undefined', { a: 1, b: Promise.resolve(undefined) }, '{"a":1}'],
    ['a date property', { a: date }, `{"a":"${date.toJSON()}"}`],
    ['nested objects', { a: 1, b: { c: 2 } }, '{"a":1,"b":{"c":2}}'],
    ['an array property', { a: [1], b: 2 }, '{"a":[1],"b":2}'],
    ['an empty array', [], '[]'],
    ['nested empty arrays', [[[]], [[]]], '[[[]],[[]]]'],
    ['undefined in an array', [1, undefined, 2], '[1,null,2]'],
    // oxlint-disable-next-line no-sparse-arrays
    ['a sparse array', [1, , 2], '[1,null,2]'],
    ['mixed array', [1, 'a'], '[1,"a"]'],
    ['a promise', Promise.resolve(1), '1'],
    ['a promise of a promise', Promise.resolve(Promise.resolve(1)), '1'],
    ['a promise property', { a: Promise.resolve(1) }, '{"a":1}'],
  ] satisfies [string, unknown, string][]
  for (const [name, value, expected] of cases) {
    test(`writes ${name} as JSON.stringify does`, async () => {
      expect(await encodeText(value)).toBe(expected)
    })
  }

  test('calls a function property and writes what it returns', async () => {
    expect(await encodeText({ a: () => undefined, b: 'b' })).toBe('{"b":"b"}')
    expect(await encodeText([() => undefined, undefined])).toBe('[null,null]')
  })

  test('resolves a thenable that resolves to a promise', async () => {
    // oxlint-disable-next-line unicorn/no-thenable
    const thenable = { then: (resolve: (value: unknown) => void) => resolve(Promise.resolve(1)) }
    expect(await encodeText(thenable)).toBe('1')
  })

  test('fails with the rejection reason of a promise', async () => {
    const error = new Error('should emit error')
    await expect(encodeText(Promise.reject(error))).rejects.toBe(error)
  })

  test('calls a replacer function', async () => {
    expect(await encodeText(1, { replacer: () => 2 })).toBe('2')
    expect(
      await encodeText({ a: undefined }, { replacer: (key, value) => (key ? 1 : value) }),
    ).toBe('{"a":1}')
    expect(
      await encodeText(
        { a: 1, b: 2 },
        { replacer: (key, value) => (key === 'b' ? undefined : value) },
      ),
    ).toBe('{"a":1}')
  })

  test('writes only the keys in a replacer array', async () => {
    expect(await encodeText({ a: 1, b: 2 }, { replacer: ['b'] })).toBe('{"b":2}')
  })

  test('writes a stream as an array', async () => {
    expect(await encodeText(streamOf([1]))).toBe('[1]')
    expect(await encodeText(Promise.resolve(streamOf([1])))).toBe('[1]')
    expect(await encodeText({ a: streamOf([1, 2, 3]) })).toBe('{"a":[1,2,3]}')
    expect(await encodeText(streamOf([{}, 'a', undefined, 'c']))).toBe('[{},"a",null,"c"]')
  })

  test('writes a stream between other properties', async () => {
    expect(await encodeText({ a: 'b', c: streamOf(['d']), e: 'f' })).toBe(
      '{"a":"b","c":["d"],"e":"f"}',
    )
  })

  test('writes objects with dates from a stream', async () => {
    expect(await encodeText({ a: streamOf([{ name: 'name', arr: [], date }]) })).toBe(
      `{"a":[{"name":"name","arr":[],"date":"${date.toJSON()}"}]}`,
    )
  })

  test('reads a stream that produces values slowly', async () => {
    let i = 0
    const slow = new ReadableStream<string>({
      async pull(controller) {
        await new Promise((resolve) => setTimeout(resolve, 1))
        if (i < 3) controller.enqueue('abc'[i++]!)
        else controller.close()
      },
    })
    expect(await encodeText(slow)).toBe('["a","b","c"]')
  })

  test('fails with the error of a nested stream', async () => {
    const error = new Error('should emit error')
    await expect(encodeText({ a: [erroring(error)] })).rejects.toBe(error)
  })

  test('fails on a stream that is already being read', async () => {
    const stream = streamOf([1])
    stream.getReader()
    await expect(encodeText(stream)).rejects.toThrow(TypeError)
  })

  test('indents with a number of spaces', async () => {
    expect(await encodeText({ a: 1 }, { space: 2 })).toBe('{\n  "a": 1\n}')
    expect(await encodeText([1], { space: 2 })).toBe('[\n  1\n]')
  })

  test('indents with a string', async () => {
    expect(await encodeText([1], { space: 'a' })).toBe('[\na1\n]')
  })

  test('fails on a circular object', async () => {
    const cyclic: Record<string, unknown> = {}
    cyclic.a = cyclic
    await expect(encodeText(cyclic)).rejects.toThrow(TypeError)
  })

  test('fails on a circular object behind promises', async () => {
    const cyclic: Record<string, unknown> = {}
    cyclic.a = Promise.resolve(cyclic)
    await expect(encodeText(Promise.resolve(cyclic))).rejects.toThrow(TypeError)
  })

  test('fails on a circular object inside a stream', async () => {
    const cyclic: Record<string, unknown> = {}
    cyclic.a = streamOf([cyclic])
    await expect(encodeText(streamOf([cyclic]))).rejects.toThrow(TypeError)
  })

  test('writes a repeated, non-circular reference each time', async () => {
    const a = { foo: 'bar' }
    expect(await encodeText([a, a])).toBe('[{"foo":"bar"},{"foo":"bar"}]')
    const array: unknown[] = []
    expect(await encodeText({ a: array, b: array })).toBe('{"a":[],"b":[]}')
  })

  test('reads a stream only as fast as the output is read', async () => {
    let pulls = 0
    const source = new ReadableStream<string>(
      {
        pull(controller) {
          pulls++
          controller.enqueue('x'.repeat(20_000))
        },
      },
      { highWaterMark: 0 },
    )
    const reader = encodeStream(source).getReader()
    await reader.read()
    await reader.read()
    await new Promise((resolve) => setTimeout(resolve, 10))
    expect(pulls).toBeLessThan(5)
    await reader.cancel()
  })
})

describe('@worker-tools/json-stream', () => {
  async function* items<value>(values: readonly value[]) {
    for (const value of values) {
      await new Promise((resolve) => setTimeout(resolve))
      yield value
    }
  }

  test('writes plain values as JSON.stringify does', async () => {
    const value = { a: 3, b: { nested: 4 }, c: [1, 2, 3], __x: undefined }
    expect(await encodeText(value)).toBe(JSON.stringify(value))
  })

  test('writes promises and async generators', async () => {
    expect(await encodeText({ a: 3, b: Promise.resolve(4) })).toBe('{"a":3,"b":4}')
    expect(await encodeText({ a: 3, b: Promise.resolve(4), c: items([1, 2, 3]) })).toBe(
      '{"a":3,"b":4,"c":[1,2,3]}',
    )
  })

  test('writes undefined from an async generator as null', async () => {
    expect(await encodeText({ a: items([1, undefined, 3]) })).toBe('{"a":[1,null,3]}')
  })

  test('omits a property whose toJSON returns undefined', async () => {
    expect(await encodeText({ a: { toJSON: () => undefined }, b: 4 })).toBe('{"b":4}')
  })

  test('fails on a circular object', async () => {
    const a: Record<string, unknown> = { a: 3, foo: { b: 4 } }
    ;(a.foo as Record<string, unknown>).a = a
    await expect(encodeText(a)).rejects.toThrow(TypeError)
  })

  test('writes duplicate references', async () => {
    const foo = { foo: 'bar' }
    const a = { a: { x: foo, y: foo }, b: foo }
    expect(await encodeText(a)).toBe(JSON.stringify(a))
  })

  test('produces a Response body any JSON parser can read', async () => {
    const body = encodeStream({ a: 3, b: Promise.resolve(4), c: items([1, 2, 3]) })
    expect(await new Response(body).json()).toEqual({ a: 3, b: 4, c: [1, 2, 3] })
  })
})

describe('stream-json', () => {
  test('writes special characters as JSON.stringify does', async () => {
    const value = { [lineSeparator + '\n"\\']: ['\u0000\u0001\u001f\u007f', '\ud800', '\b\f\r\t/'] }
    expect(await encodeText(value)).toBe(JSON.stringify(value))
  })

  test('writes NaN, Infinity and -Infinity as null', async () => {
    expect(await encodeText([NaN, Infinity, -Infinity])).toBe('[null,null,null]')
  })

  test('fails on a BigInt, as JSON.stringify does', async () => {
    await expect(encodeText({ a: 1n })).rejects.toThrow(TypeError)
  })

  test('calls toJSON with the key', async () => {
    const keys: string[] = []
    const value = { toJSON: (key: string) => (keys.push(key), key) }
    expect(await encodeText({ a: value, b: [value] })).toBe('{"a":"a","b":["0"]}')
    expect(keys).toEqual(['a', '0'])
  })

  test('calls toJSON on the value toJSON returns only once', async () => {
    class Inner {
      toJSON() {
        return 'inner'
      }
    }
    expect(await encodeText({ a: { toJSON: () => new Inner() } })).toBe('{"a":{}}')
  })

  test('calls the replacer with the holder as this', async () => {
    const holders: unknown[] = []
    const value = { a: [1] }
    await encodeText(value, {
      replacer(this: unknown, _key, v) {
        holders.push(this)
        return v
      },
    })
    expect(holders).toEqual([{ '': value }, value, value.a])
  })

  test('writes nothing when the replacer drops the root value', async () => {
    expect(await encodeText({ a: 1 }, { replacer: () => undefined })).toBe('')
  })

  test('writes an empty stream as an empty array', async () => {
    expect(await encodeText(streamOf([]))).toBe('[]')
  })

  test('replaces the root value', async () => {
    expect(
      await encodeText({ a: 1 }, { replacer: (key, value) => (key === '' ? [1] : value) }),
    ).toBe('[1]')
  })

  test('writes boxed primitives as their value', async () => {
    // oxlint-disable-next-line no-new-wrappers
    expect(await encodeText([new Number(1), new String('a'), new Boolean(false)])).toBe(
      '[1,"a",false]',
    )
  })
})

describe('encodeStream', () => {
  test('matches JSON.stringify for nested plain values with indentation', async () => {
    const value = { a: [1, { b: [] }, {}, 'x'], c: { d: null, e: [[]] }, f: '' }
    for (const space of [undefined, 2, '\t', 20, 0, -1]) {
      expect(await encodeText(value, { space })).toBe(JSON.stringify(value, null, space))
    }
  })

  test('writes up to the first unresolved value, then waits for it', async () => {
    const b = deferred<number>()
    const reader = encodeStream({ a: 1, b: b.promise, c: 3 }).getReader()
    expect(await readText(reader)).toBe('{"a":1')
    b.resolve(2)
    expect(await readRest(reader)).toBe(',"b":2,"c":3}')
  })

  test('writes each stream value before the next is available', async () => {
    let push!: (value: unknown) => void
    const source = new ReadableStream({
      start(controller) {
        push = (value) => controller.enqueue(value)
      },
    })
    const reader = encodeStream({ items: source }).getReader()
    push({ id: 1 })
    expect(await readText(reader)).toBe('{"items":[')
    expect(await readText(reader)).toBe('{"id":1}')
  })

  test('calls a function only when the writer reaches it', async () => {
    const calls: string[] = []
    const first = deferred<string>()
    const reader = encodeStream({
      a: first.promise,
      b: () => {
        calls.push('b')
        return 'B'
      },
    }).getReader()
    await reader.read()
    expect(calls).toEqual([])
    first.resolve('A')
    expect(await readRest(reader)).toBe('"a":"A","b":"B"}')
    expect(calls).toEqual(['b'])
  })

  test('writes what a function property returns, where JSON.stringify drops the property', async () => {
    expect(await encodeText({ a: () => 1, b: [() => 'x'] })).toBe('{"a":1,"b":["x"]}')
  })

  test('resolves a function that returns a promise of a stream', async () => {
    expect(await encodeText({ a: async () => streamOf([1, 2]) })).toBe('{"a":[1,2]}')
  })

  test('applies the replacer to resolved values only once', async () => {
    const seen: unknown[] = []
    const text = await encodeText(
      { a: Promise.resolve(1) },
      {
        replacer: (key, value) => {
          seen.push(value)
          return key === 'a' ? Promise.resolve(Number(value) + 1) : value
        },
      },
    )
    expect(text).toBe('{"a":2}')
    expect(seen).toHaveLength(2)
  })

  test('writes an iterable stream from fromIterable', async () => {
    expect(await encodeText(fromIterable([1, 2]))).toBe('[1,2]')
  })

  test('writes Map and Set as {} like JSON.stringify', async () => {
    expect(await encodeText([new Map([[1, 2]]), new Set([1])])).toBe('[{},{}]')
  })

  test('cancelling the output cancels a nested stream and returns a nested iterator', async () => {
    let streamCancelled = false
    let iteratorFinished = false
    const stream = new ReadableStream({
      pull(controller) {
        controller.enqueue(1)
      },
      cancel() {
        streamCancelled = true
      },
    })
    async function* generator() {
      try {
        for (;;) yield 1
      } finally {
        iteratorFinished = true
      }
    }
    const first = encodeStream({ a: stream }).getReader()
    await first.read()
    await first.read()
    await first.cancel()
    expect(streamCancelled).toBe(true)

    const second = encodeStream({ a: generator() }).getReader()
    await second.read()
    await second.read()
    await second.cancel()
    expect(iteratorFinished).toBe(true)
  })

  test('cancelling the output cancels a nested stream that is waiting for data', async () => {
    let cancelled = false
    const stream = new ReadableStream({
      cancel() {
        cancelled = true
      },
    })
    const reader = encodeStream([stream]).getReader()
    expect(await readText(reader)).toBe('[[')
    const pending = reader.read()
    await reader.cancel()
    expect(cancelled).toBe(true)
    expect((await pending).done).toBe(true)
  })

  test('cancels nested streams when another value fails', async () => {
    let cancelled = false
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(() => Promise.reject(new Error('boom')))
      },
      cancel() {
        cancelled = true
      },
    })
    await expect(encodeText({ a: stream })).rejects.toThrow('boom')
    expect(cancelled).toBe(true)
  })
})

describe('known upstream issues', () => {
  test('writes a stream that is not the first property as valid JSON (json-stream-stringify #47)', async () => {
    const text = await encodeText({ a: 1, b: streamOf(['x']), c: streamOf(['y']) })
    expect(JSON.parse(text)).toEqual({ a: 1, b: ['x'], c: ['y'] })
  })

  test('writes keys that are empty strings (json-stream-stringify #28)', async () => {
    expect(await encodeText({ '': 1, a: { '': 2 } })).toBe('{"":1,"a":{"":2}}')
  })

  test('does not report empty arrays as circular (json-stream-stringify #34)', async () => {
    expect(await encodeText([[], [], { a: [] }])).toBe('[[],[],{"a":[]}]')
  })

  test('writes no trailing comma when the replacer drops the last key (json-stream-stringify #7)', async () => {
    const text = await encodeText(
      { a: 1, b: 2 },
      { replacer: (k, v) => (k === 'b' ? undefined : v) },
    )
    expect(text).toBe('{"a":1}')
  })

  test('resolves a promise returned by the replacer (json-stream-stringify #1)', async () => {
    expect(
      await encodeText({ a: 1 }, { replacer: (k, v) => (k === 'a' ? Promise.resolve(2) : v) }),
    ).toBe('{"a":2}')
  })

  test('writes a stream that has already closed as an empty array (json-stream-stringify #36)', async () => {
    const stream = streamOf([])
    const reader = stream.getReader()
    await reader.read()
    reader.releaseLock()
    expect(await encodeText({ a: stream })).toBe('{"a":[]}')
  })

  test('writes a large array of streamed objects without losing any (json-stream-stringify #41, #43)', async () => {
    const values = Array.from({ length: 20_000 }, (_, i) => ({ i }))
    const text = await encodeText(streamOf(values))
    expect(JSON.parse(text)).toEqual(values)
  })
})
