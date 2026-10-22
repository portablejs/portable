import { fromIterable, toArray } from '@portable/streams'
import { describe, expect, test } from 'vite-plus/test'
import { InvalidInputError, DecoderStream, EncoderStream } from '@portable/jsonl'
import data from './fixtures/data.ndjson?raw'
import { chunked, decode, encode, encodeUtf8, lineSeparator } from './utils.js'

const escaped = {
  stringWithTabsAndNewlines: "Did it work?\nNo...\t\tI don't think so...",
  anArray: [1, 2, true, 'tabs?\t\t\t\u0001\u0002\u0003', false],
}
const pattern = {
  a: [[[]]],
  b: { a: 1 },
  c: { a: 1, b: 2 },
  d: [true, 1, "'x\"y'", null, false, true, {}, [], ''],
  e: 1,
  f: '',
  g: true,
  h: false,
  i: null,
  j: [],
  k: {},
}

describe('ndjson', () => {
  test('decodes a line', async () => {
    expect(await decode(['{"hello": "world"}\n'])).toEqual([{ hello: 'world' }])
  })

  test('decodes two lines', async () => {
    expect(await decode(['{"hello": "world"}\n{"hola": "mundo"}\n'])).toEqual([
      { hello: 'world' },
      { hola: 'mundo' },
    ])
  })

  test('fails on an invalid line', async () => {
    await expect(decode(['{"no":"json"\n'])).rejects.toThrow(InvalidInputError)
  })

  test('skips invalid lines with invalid: skip', async () => {
    expect(await decode(['{"json":false\n{"json":true}\n'], { invalid: 'skip' })).toEqual([
      { json: true },
    ])
  })

  test('encodes a value as a line', async () => {
    expect(await encode([{ hello: 'world' }])).toBe('{"hello":"world"}\n')
  })

  test('fails on a circular value', async () => {
    const value: Record<string, unknown> = {}
    value.obj = value
    await expect(encode([value])).rejects.toThrow(TypeError)
  })

  test('decodes the ndjson fixture', async () => {
    expect(await decode([data])).toEqual([{ foo: 'bar' }, { hello: 'world' }])
  })
})

describe('stream-json jsonl', () => {
  for (const [count, size] of [
    [1, 4],
    [2, 4],
    [3, 4],
    [5, 4],
    [10, 4],
    [5, 3],
    [10, 7],
  ] as const) {
    test(`decodes ${count} lines from ${size}-character chunks`, async () => {
      const objects = Array.from({ length: count }, (_, n) => ({ ...escaped, n }))
      const text = objects.map((object) => JSON.stringify(object)).join('\n')
      expect(await decode(chunked(text, size))).toEqual(objects)
    })
  }

  test('encodes one value read back from a line', async () => {
    const line = JSON.stringify(pattern)
    expect(await encode(await decode([line]))).toBe(line + '\n')
  })

  test('encodes several values read back from lines', async () => {
    const line = JSON.stringify(pattern)
    const text = `${line}\n${line}\n${line}\n`
    expect(await encode(await decode([text]))).toBe(text)
  })

  test('separates values with \\n', async () => {
    expect(await encode([1, 2, 3])).toBe('1\n2\n3\n')
  })

  test('fails on an invalid last line', async () => {
    await expect(decode(['{'])).rejects.toThrow(InvalidInputError)
  })

  test('fails on an invalid line in the middle, naming the line', async () => {
    await expect(decode(['{}\n]\n1'])).rejects.toThrow('Invalid JSON on line 2.')
  })

  test('skips invalid lines in the middle and at the end', async () => {
    expect(await decode(['{}\n]\n1\n{'], { invalid: 'skip' })).toEqual([{}, 1])
  })
})

describe('@worker-tools/json-stream', () => {
  test('round-trips values through bytes', async () => {
    const values = [{ a: 1 }, { b: 2 }, { c: 3 }, 'foo', { a: { nested: { object: true } } }]
    const decoded = await toArray(
      fromIterable(values).pipeThrough(new EncoderStream()).pipeThrough(new DecoderStream()),
    )
    expect(decoded).toEqual(values)
  })
})

describe('DecoderStream', () => {
  test('accepts CRLF line endings and skips blank lines', async () => {
    expect(await decode(['1\r\n\r\n  \n\t\r\n2\r\n'])).toEqual([1, 2])
  })

  test('decodes a last line with no newline', async () => {
    expect(await decode(['1\n2'])).toEqual([1, 2])
  })

  test('decodes multi-byte characters split across chunks', async () => {
    expect(await decode(chunked(encodeUtf8('"烫🚀"\n"ü"\n'), 1))).toEqual(['烫🚀', 'ü'])
  })

  test('decodes a line split across many chunks', async () => {
    const value = { text: 'x'.repeat(10_000) }
    expect(await decode(chunked(JSON.stringify(value) + '\n', 7))).toEqual([value])
  })

  test('keeps the cause of an invalid line', async () => {
    const error = await decode(['{]\n']).catch((error: unknown) => error)
    expect(error).toBeInstanceOf(InvalidInputError)
    expect((error as Error).name).toBe('Jsonl.InvalidInputError')
    expect((error as Error).cause).toBeInstanceOf(SyntaxError)
  })

  test('does not modify the options object', () => {
    const options = { invalid: 'skip' } as const
    new DecoderStream(options)
    expect(options).toEqual({ invalid: 'skip' })
  })
})

describe('EncoderStream', () => {
  for (const [name, value] of [
    ['undefined', undefined],
    ['a function', () => 1],
    ['a symbol', Symbol('s')],
    ['a BigInt', 1n],
  ] as const) {
    test(`fails on ${name}`, async () => {
      await expect(encode([value])).rejects.toThrow(TypeError)
    })
  }

  test('escapes line separators inside strings, so each value stays on one line', async () => {
    const text = await encode(['a\nb', { 'c\r\nd': lineSeparator }])
    expect(text.split('\n')).toHaveLength(3)
  })

  test('produces UTF-8 bytes', async () => {
    const chunks = await toArray(fromIterable([{ a: 'é' }]).pipeThrough(new EncoderStream()))
    expect(chunks.every((chunk) => chunk instanceof Uint8Array)).toBe(true)
    expect(new TextDecoder().decode(chunks[0])).toBe('{"a":"é"}\n')
  })
})

describe('known upstream issues', () => {
  test('emits a null line instead of ending the stream (ndjson #6)', async () => {
    expect(await decode(['1\nnull\n2\n'])).toEqual([1, null, 2])
  })

  test('skips whitespace-only lines, which ndjson reports as invalid', async () => {
    expect(await decode(['1\n   \n2\n'])).toEqual([1, 2])
  })

  test('ends lines with \\n on every platform (ndjson uses os.EOL)', async () => {
    expect(await encode([1])).toBe('1\n')
  })
})
