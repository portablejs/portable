import { describe, expect, test } from 'vite-plus/test'
import { MaxBytesError, toArray, toBytes, toJson, toText } from '@portable/streams'
import { chunked, decode, delay, encode, fromChunks } from './utils.js'

const fixtureString = 'unicorn\n'
const fixtureBytes = encode(fixtureString)
const fixtureArrayBuffer = fixtureBytes.buffer
const wide = encode(`  ${fixtureString}  `).buffer

class SubclassedBytes extends Uint8Array {}

const singleChunks: Record<string, unknown> = {
  string: fixtureString,
  Uint8Array: fixtureBytes,
  'Uint8Array with offset': new Uint8Array(wide, 2, fixtureString.length),
  'Uint8Array subclass': SubclassedBytes.from(fixtureBytes),
}

const multiChunks: Record<string, unknown[]> = {
  string: fixtureString.split(''),
  Uint8Array: [...fixtureBytes].map((byte) => new Uint8Array([byte])),
}

const invalidChunks: Record<string, unknown> = {
  ArrayBuffer: fixtureArrayBuffer,
  Uint16Array: new Uint16Array(fixtureArrayBuffer),
  DataView: new DataView(fixtureArrayBuffer),
  object: {},
  array: [],
  boolean: false,
  number: 0,
  bigint: 0n,
  undefined: undefined,
  null: null,
  symbol: Symbol('test'),
}

// Typed as `never` so tests can feed chunk types the signatures rule out.
const anyChunks = (chunks: readonly unknown[]) => fromChunks(chunks) as never

const randomBytes = (length: number) =>
  Uint8Array.from({ length }, () => Math.floor(Math.random() * 256))

async function* errorAfterChunk(error: unknown) {
  yield fixtureString
  await delay(0)
  throw error
}

describe('get-stream: toText', () => {
  for (const [name, chunk] of Object.entries(singleChunks)) {
    test(`reads ${name} as text, with a single chunk`, async () => {
      expect(await toText(anyChunks([chunk]))).toBe(fixtureString)
    })
  }

  for (const [name, chunks] of Object.entries(multiChunks)) {
    test(`reads ${name} as text, with multiple chunks`, async () => {
      expect(await toText(anyChunks(chunks))).toBe(fixtureString)
    })
  }

  for (const [name, chunk] of Object.entries(invalidChunks)) {
    test(`rejects a ${name} chunk`, async () => {
      await expect(toText(anyChunks([chunk]))).rejects.toThrow(TypeError)
    })
  }

  test('fails when maxBytes is exceeded', async () => {
    const maxBytes = fixtureString.length
    await expect(toText([`${fixtureString}..`], { maxBytes })).rejects.toThrow(MaxBytesError)
    expect(await toText([fixtureString], { maxBytes })).toBe(fixtureString)
  })

  test('counts maxBytes in UTF-8 bytes, also for string chunks', async () => {
    await expect(toText(['ကက'], { maxBytes: 3 })).rejects.toThrow(MaxBytesError)
    expect(await toText(['က'], { maxBytes: 3 })).toBe('က')
    expect(await toText(['😀'], { maxBytes: 4 })).toBe('😀')
    await expect(toText(['😀'], { maxBytes: 3 })).rejects.toThrow(MaxBytesError)
  })

  // Valid UTF-8 only: Chromium 141's streaming TextDecoder replaces an ASCII byte that follows
  // an invalid sequence split across chunks, so random bytes would test the browser.
  test('decodes like Response.text()', async () => {
    const text = String.fromCodePoint(
      ...Array.from({ length: 3e4 }, () => Math.floor(Math.random() * 0xd000)),
    )
    const bytes = encode(text)
    expect(await toText(fromChunks(chunked(bytes, 1000)))).toBe(await new Response(bytes).text())
  })

  test('decodes a multi-byte character split across chunks', async () => {
    expect(await toText(chunked(encode('aက'), 1))).toBe('aက')
  })

  test('replaces a truncated multi-byte character at the end', async () => {
    expect(await toText(chunked(encode('aက'), 1).slice(0, -1))).toBe('a�')
  })

  test('fails when a truncated character exceeds maxBytes', async () => {
    const chunks = chunked(encode('aက'), 1).slice(0, -1)
    await expect(toText(chunks, { maxBytes: 2 })).rejects.toThrow(MaxBytesError)
  })

  test('replaces an invalid UTF-8 sequence', async () => {
    expect(await toText(chunked(encode('aက'), 1).slice(1, 2))).toBe('�')
  })

  test('decodes other encodings', async () => {
    const utf16 = new Uint8Array([0x68, 0, 0x69, 0])
    expect(await toText([utf16], { encoding: 'utf-16le' })).toBe('hi')
  })
})

describe('get-stream: toBytes', () => {
  for (const [name, chunk] of Object.entries(singleChunks)) {
    test(`reads ${name} as bytes, with a single chunk`, async () => {
      const bytes = await toBytes(anyChunks([chunk]))
      expect(bytes).toBeInstanceOf(Uint8Array)
      expect(bytes).toEqual(fixtureBytes)
    })
  }

  for (const [name, chunks] of Object.entries(multiChunks)) {
    test(`reads ${name} as bytes, with multiple chunks`, async () => {
      expect(await toBytes(anyChunks(chunks))).toEqual(fixtureBytes)
    })
  }

  for (const [name, chunk] of Object.entries(invalidChunks)) {
    test(`rejects a ${name} chunk`, async () => {
      await expect(toBytes(anyChunks([chunk]))).rejects.toThrow(TypeError)
    })
  }

  test('fails when maxBytes is exceeded', async () => {
    const maxBytes = fixtureString.length
    await expect(toBytes([encode(`${fixtureString}..`)], { maxBytes })).rejects.toThrow(
      MaxBytesError,
    )
    expect(await toBytes([fixtureBytes], { maxBytes })).toEqual(fixtureBytes)
  })

  test('counts string chunks as their UTF-8 bytes', async () => {
    await expect(toBytes(['\u1000\u1000'], { maxBytes: 5 })).rejects.toThrow(MaxBytesError)
    expect(await toBytes(['\u1000\u1000'], { maxBytes: 6 })).toEqual(encode('\u1000\u1000'))
  })

  test('returns a fresh buffer of exactly the read length', async () => {
    const bytes = await toBytes([new Uint8Array(wide, 2, fixtureString.length)])
    expect(bytes.byteOffset).toBe(0)
    expect(bytes.buffer.byteLength).toBe(fixtureString.length)
  })

  test('reads like Response.arrayBuffer() and Blob', async () => {
    const bytes = randomBytes(1e5)
    const ours = await toBytes(fromChunks(chunked(bytes, 1000)))
    expect(ours).toEqual(new Uint8Array(await new Response(bytes).arrayBuffer()))
    expect(new Uint8Array(await new Blob([ours]).arrayBuffer())).toEqual(bytes)
  })
})

describe('get-stream: toArray', () => {
  for (const [name, chunk] of Object.entries(singleChunks)) {
    test(`keeps a ${name} chunk as it is`, async () => {
      expect(await toArray(fromChunks([chunk]))).toEqual([chunk])
    })
  }

  for (const [name, chunks] of Object.entries(multiChunks)) {
    test(`keeps multiple ${name} chunks as they are`, async () => {
      expect(await toArray(fromChunks(chunks))).toEqual(chunks)
    })
  }

  for (const [name, chunk] of Object.entries(invalidChunks)) {
    test(`accepts a ${name} chunk`, async () => {
      const [result] = await toArray(fromChunks([chunk]))
      expect(result).toBe(chunk)
    })
  }

  test('reads many object chunks', async () => {
    const objects = Array.from({ length: 1e4 }, (_, byte) => ({ byte }))
    expect(await toArray(fromChunks(objects))).toEqual(objects)
  })
})

describe('get-stream: sources', () => {
  test('reads an async iterable', async () => {
    async function* generator() {
      yield 'a'
      await delay(0)
      yield 'b'
    }
    expect(await toText(generator())).toBe('ab')
  })

  test("calls an async iterable's return() on error, but not throw()", async () => {
    const state = { error: false, finally: false }
    async function* generator() {
      try {
        yield {}
      } catch (error) {
        state.error = true
        throw error
      } finally {
        state.finally = true
      }
    }
    await expect(toText(generator() as never)).rejects.toThrow(TypeError)
    expect(state).toEqual({ error: false, finally: true })
  })

  test('reads mixed chunk types', async () => {
    const chunks = [fixtureString, fixtureBytes, SubclassedBytes.from(fixtureBytes)]
    expect(await toText(chunks)).toBe(fixtureString.repeat(chunks.length))
    expect(decode(await toBytes(chunks))).toBe(fixtureString.repeat(chunks.length))
  })

  for (const [name, error] of Object.entries({
    Error: new Error('test'),
    string: 'test',
    null: null,
    undefined: undefined,
  })) {
    test(`rejects with the source's error when it throws ${name}`, async () => {
      await expect(toText(errorAfterChunk(error))).rejects.toBe(error)
    })
  }

  test('stops an infinite source at maxBytes', async () => {
    async function* infinite() {
      for (;;) {
        await delay(0)
        yield '.'
      }
    }
    await expect(toText(infinite(), { maxBytes: 1 })).rejects.toThrow(MaxBytesError)
  })

  for (const [name, source] of Object.entries({ undefined: undefined, null: null, string: '' })) {
    test(`rejects a ${name} source`, async () => {
      await expect(toText(source as never)).rejects.toThrow(TypeError)
    })
  }

  test('reads an array of chunks', async () => {
    expect(await toText([])).toBe('')
    expect(await toText(['a', 'b'])).toBe('ab')
  })
})

describe('get-stream: ReadableStream', () => {
  test('reads a ReadableStream', async () => {
    expect(await toText(fromChunks(fixtureString.split('')))).toBe(fixtureString)
  })

  test('reads an already ended ReadableStream as empty', async () => {
    const stream = fromChunks(fixtureString.split(''))
    expect(await toText(stream)).toBe(fixtureString)
    expect(await toText(stream)).toBe('')
  })

  test('reads an already cancelled ReadableStream as empty', async () => {
    let cancelled: unknown
    const stream = new ReadableStream({
      cancel(reason) {
        cancelled = reason
      },
    })
    const error = new Error('test')
    await stream.cancel(error)
    expect(cancelled).toBe(error)
    expect(await toText(stream)).toBe('')
  })

  test('rejects with the error of an errored ReadableStream', async () => {
    const error = new Error('test')
    const stream = new ReadableStream({
      start(controller) {
        controller.error(error)
      },
    })
    await expect(toText(stream)).rejects.toBe(error)
  })

  test('cancels the ReadableStream when maxBytes is exceeded', async () => {
    let cancelled: unknown
    const stream = new ReadableStream<string>({
      start(controller) {
        controller.enqueue(fixtureString)
        controller.enqueue(fixtureString)
        controller.close()
      },
      cancel(reason) {
        cancelled = reason
      },
    })
    const promise = toText(stream, { maxBytes: 1 })
    await expect(promise).rejects.toThrow(MaxBytesError)
    expect(cancelled).toBeInstanceOf(MaxBytesError)
    expect(stream.locked).toBe(false)
  })

  test('reads text decoded by a TextDecoderStream', async () => {
    const utf16 = new Uint8Array(fixtureString.split('').flatMap((char) => [char.charCodeAt(0), 0]))
    const stream = fromChunks([utf16]).pipeThrough(new TextDecoderStream('utf-16le'))
    expect(await toText(stream)).toBe(fixtureString)
  })
})

describe('MaxBytesError', () => {
  test('has a namespaced name and the limit', async () => {
    const error = await toBytes([new Uint8Array(4)], { maxBytes: 3 }).catch((error) => error)
    expect(error).toBeInstanceOf(MaxBytesError)
    expect(error.name).toBe('Streams.MaxBytesError')
    expect(error.maxBytes).toBe(3)
  })

  test('maxBytes: 0 accepts only an empty source', async () => {
    expect(await toBytes([new Uint8Array()], { maxBytes: 0 })).toHaveLength(0)
    await expect(toBytes([new Uint8Array(1)], { maxBytes: 0 })).rejects.toThrow(MaxBytesError)
    await expect(toText(['a'], { maxBytes: 0 })).rejects.toThrow(MaxBytesError)
  })

  test('allows a source of exactly maxBytes', async () => {
    expect(await toBytes([new Uint8Array(2), new Uint8Array(1)], { maxBytes: 3 })).toHaveLength(3)
  })
})

describe('toJson', () => {
  test('parses JSON split across chunks', async () => {
    const chunks = chunked(encode('{"test":"å","list":[1,2]}'), 3)
    expect(await toJson(fromChunks(chunks))).toEqual({ test: 'å', list: [1, 2] })
  })

  test('rejects invalid JSON with a SyntaxError', async () => {
    await expect(toJson(['{'])).rejects.toThrow(SyntaxError)
  })

  test('applies maxBytes', async () => {
    await expect(toJson(['[1,2,3]'], { maxBytes: 6 })).rejects.toThrow(MaxBytesError)
  })
})

describe('concat-stream', () => {
  test('array stream', async () => {
    expect(
      (
        await toArray([
          [1, 2, 3],
          [4, 5, 6],
        ])
      ).flat(),
    ).toEqual([1, 2, 3, 4, 5, 6])
  })

  test('buffer stream', async () => {
    const bytes = await toBytes(
      fromChunks([encode('pizza Array is not a '), encode('stringy cat')]),
    )
    expect(decode(bytes)).toBe('pizza Array is not a stringy cat')
  })

  test('buffer mixed writes', async () => {
    const chunks = [
      encode('pizza'),
      ' Array is not a ',
      new Uint8Array([115, 116, 114, 105, 110, 103, 121]),
      new Uint8Array([32, 99, 97, 116]),
    ]
    expect(decode(await toBytes(fromChunks(chunks)))).toBe('pizza Array is not a stringy cat')
  })

  test('rejects number chunks', async () => {
    await expect(toBytes(anyChunks(['a', 1000]))).rejects.toThrow(TypeError)
    await expect(toText(anyChunks(['a', 1000]))).rejects.toThrow(TypeError)
  })

  test('no encoding set, no data', async () => {
    expect(await toArray(fromChunks([]))).toEqual([])
  })

  test('encoding set to string, no data', async () => {
    expect(await toText(fromChunks([]))).toBe('')
    expect(await toBytes(fromChunks([]))).toEqual(new Uint8Array())
  })

  test('writing objects', async () => {
    const objects = [{ foo: 'bar' }, { baz: 'taco' }]
    expect(await toArray(fromChunks(objects))).toEqual(objects)
  })

  test('string -> buffer stream', async () => {
    expect(decode(await toBytes(fromChunks(['nacho ', 'dogs'])))).toBe('nacho dogs')
  })

  test('string stream', async () => {
    expect(await toText(fromChunks(['nacho ', 'dogs']))).toBe('nacho dogs')
  })

  test('end chunk', async () => {
    expect(await toText(fromChunks(['this ', 'is the ', 'end']))).toBe('this is the end')
  })

  test('string from mixed write encodings', async () => {
    const chunks = ['na', encode('cho'), new Uint8Array([32, 100]), new Uint8Array([111, 103, 115])]
    expect(await toText(fromChunks(chunks))).toBe('nacho dogs')
  })

  test('string from buffers with multibyte characters', async () => {
    const snowman = encode('☃')
    const chunks = Array.from({ length: 8 }, () => [
      snowman.subarray(0, 1),
      snowman.subarray(1),
    ]).flat()
    expect(await toText(fromChunks(chunks))).toBe('☃☃☃☃☃☃☃☃')
  })

  test('string infer encoding with empty string chunk', async () => {
    expect(await toText(fromChunks(['', 'nacho ', 'dogs']))).toBe('nacho dogs')
  })

  test('typed array stream', async () => {
    const chunks = [encode('abcde'), encode(' fg'), encode(' xyz')]
    expect(decode(await toBytes(fromChunks(chunks)))).toBe('abcde fg xyz')
  })

  test('typed array from strings, buffers, and arrays', async () => {
    const chunks = ['abcde', encode(' fg '), new Uint8Array([120, 121, 122])]
    expect(decode(await toBytes(fromChunks(chunks)))).toBe('abcde fg xyz')
  })
})

describe('raw-body: web streams', () => {
  const byteStream = (chunks: readonly string[]) => fromChunks(chunks.map(encode))

  test('reads a ReadableStream into bytes', async () => {
    expect(decode(await toBytes(byteStream(['hello', ', ', 'world!'])))).toBe('hello, world!')
  })

  test('reads an empty ReadableStream', async () => {
    expect(await toBytes(byteStream([]))).toHaveLength(0)
  })

  test('reads text', async () => {
    expect(await toText(byteStream(['hello, world!']))).toBe('hello, world!')
  })

  test('decodes multi-byte characters split across chunks', async () => {
    const bytes = encode('é€好')
    expect(await toText(fromChunks([bytes.subarray(0, 3), bytes.subarray(3)]))).toBe('é€好')
  })

  test('reads string chunks into bytes', async () => {
    expect(decode(await toBytes(fromChunks(['hello', ', world!'])))).toBe('hello, world!')
  })

  test('reads a TextDecoderStream as UTF-8 bytes', async () => {
    const stream = fromChunks(chunked(encode('café ☕ 好'), 2)).pipeThrough(new TextDecoderStream())
    expect(decode(await toBytes(stream))).toBe('café ☕ 好')
  })

  test('fails when maxBytes is exceeded', async () => {
    const error = await toBytes(byteStream(['hello, world!']), { maxBytes: 5 }).catch((e) => e)
    expect(error).toBeInstanceOf(MaxBytesError)
    expect(error.maxBytes).toBe(5)
  })

  test('rejects a locked stream', async () => {
    const stream = byteStream(['hello, world!'])
    const reader = stream.getReader()
    await expect(toBytes(stream)).rejects.toThrow(TypeError)
    reader.releaseLock()
  })

  test('rejects a body that was already consumed', async () => {
    const response = new Response('hello, world!')
    await response.text()
    await expect(toBytes(response.body!)).rejects.toThrow(TypeError)
  })

  test('rejects a stream locked by a pipe', async () => {
    const stream = byteStream(['hello, world!'])
    const piped = stream.pipeThrough(new TextDecoderStream())
    await expect(toBytes(stream)).rejects.toThrow(TypeError)
    await piped.cancel()
  })

  test('reads a cancelled stream as empty', async () => {
    const stream = byteStream(['hello, world!'])
    await stream.cancel()
    expect(await toBytes(stream)).toHaveLength(0)
  })

  test('reads an already-read stream as empty', async () => {
    const stream = byteStream(['hello, world!'])
    const reader = stream.getReader()
    while (!(await reader.read()).done);
    reader.releaseLock()
    expect(await toBytes(stream)).toHaveLength(0)
  })

  test('rejects with the error of a stream that fails after a chunk', async () => {
    const error = new Error('boom')
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encode('hello'))
        controller.error(error)
      },
    })
    await expect(toBytes(stream)).rejects.toBe(error)
  })

  test('rejects with the reason of a stream that fails with a non-Error', async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.error('timeout')
      },
    })
    await expect(toBytes(stream)).rejects.toBe('timeout')
  })

  test('rejects an invalid chunk and releases the lock', async () => {
    const stream = fromChunks([undefined])
    await expect(toBytes(stream as never)).rejects.toThrow(TypeError)
    expect(stream.locked).toBe(false)
  })

  test('rejects an ArrayBuffer chunk instead of miscounting it', async () => {
    const stream = fromChunks([new ArrayBuffer(10)])
    await expect(toBytes(stream as never, { maxBytes: 5 })).rejects.toThrow(TypeError)
    expect(stream.locked).toBe(false)
  })

  test('assembles a large multi-chunk body', async () => {
    const chunk = new Uint8Array(768 * 1024).fill(0x61)
    const bytes = await toBytes(fromChunks([chunk, chunk]))
    expect(bytes).toHaveLength(chunk.length * 2)
    expect(bytes.every((byte) => byte === 0x61)).toBe(true)
  })

  test('releases the lock when finished', async () => {
    const stream = byteStream(['hello, world!'])
    await toBytes(stream)
    expect(stream.locked).toBe(false)
  })

  test('reads the body of a Response', async () => {
    const response = new Response('hello, world!')
    expect(await toText(response.body!, { maxBytes: 1024 })).toBe('hello, world!')
  })

  test('reads the stream of a Blob', async () => {
    expect(await toText(new Blob(['hello, world!']).stream())).toBe('hello, world!')
  })

  test('reads the body of a Request', async () => {
    const request = new Request('http://localhost/', { method: 'POST', body: 'hello, world!' })
    expect(await toText(request.body!)).toBe('hello, world!')
  })

  test('reads the readable side of a TransformStream', async () => {
    const gzipped = await toBytes(
      new Blob(['hello, world!']).stream().pipeThrough(new CompressionStream('gzip')),
    )
    const text = await toText(
      new Blob([gzipped]).stream().pipeThrough(new DecompressionStream('gzip')),
    )
    expect(text).toBe('hello, world!')
  })

  test('releases the lock on error', async () => {
    const stream = byteStream(['hello', ', world!'])
    await expect(toBytes(stream, { maxBytes: 3 })).rejects.toThrow(MaxBytesError)
    expect(stream.locked).toBe(false)
  })
})

describe('stream-to-array', () => {
  test('should work as a promise', async () => {
    const chunks = await toArray(fromChunks(chunked(encode(fixtureString.repeat(100)), 64)))
    expect(Array.isArray(chunks)).toBe(true)
    expect(chunks.length).toBeGreaterThan(0)
  })

  test('should work as a promise with zalgo', async () => {
    expect(await toArray(new ReadableStream({ start: (c) => c.close() }))).toEqual([])
  })

  test('should work as a promise with chucky', async () => {
    const stream = new ReadableStream()
    await stream.cancel()
    expect(await toArray(stream)).toEqual([])
  })

  test('should handle stream errors', async () => {
    const stream = new ReadableStream({ start: (c) => c.error(new Error('ENOENT')) })
    await expect(toArray(stream)).rejects.toThrow('ENOENT')
  })
})

describe('bl', () => {
  test('write nothing, should get empty buffer', async () => {
    expect(await toBytes(fromChunks([]))).toEqual(new Uint8Array())
  })

  test('unicode string', async () => {
    const bytes = await toBytes(fromChunks(['☀', ' and ', '☃']))
    expect(bytes).toEqual(encode('☀ and ☃'))
  })

  test('String appendage', async () => {
    expect(decode(await toBytes(['abcd', 'efg', 'hi', 'j']))).toBe('abcdefghij')
  })
})
