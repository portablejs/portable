import { Duplex, Readable } from 'node:stream'
import getStream, { MaxBufferError, getStreamAsArray, getStreamAsArrayBuffer } from 'get-stream'
import merge2 from 'merge2'
import { describe, expect, test } from 'vite-plus/test'
import { MaxBytesError, concat, merge, toArray, toBytes, toText } from '@portable/streams'
import { encode, fromChunks } from './utils.js'

function random(seed: number) {
  let state = seed
  return () => {
    state = (state * 1103515245 + 12345) % 2 ** 31
    return state / 2 ** 31
  }
}

function randomChunks(bytes: Uint8Array, seed: number): Uint8Array[] {
  const next = random(seed)
  const chunks: Uint8Array[] = []
  for (let i = 0; i < bytes.length;) {
    const size = 1 + Math.floor(next() * 64)
    chunks.push(bytes.slice(i, i + size))
    i += size
  }
  return chunks
}

const inputs = {
  ascii: 'The quick brown fox jumps over the lazy dog.\n'.repeat(50),
  multibyte: '烫烫烫\r\n锟斤拷\n🚀 emoji é€好 ☃'.repeat(20),
  bom: '\uFEFFstarts with a byte order mark',
  invalid: '\uD800 lone surrogate',
  empty: '',
}

describe('matches get-stream', () => {
  for (const [name, text] of Object.entries(inputs)) {
    for (const seed of [1, 2, 3]) {
      test(`${name}, random chunking ${seed}`, async () => {
        const chunks = randomChunks(encode(text), seed)
        expect(await toText(fromChunks(chunks))).toBe(await getStream(Readable.from(chunks)))
        expect(await toBytes(fromChunks(chunks))).toEqual(
          new Uint8Array(await getStreamAsArrayBuffer(Readable.from(chunks))),
        )
        expect(await toArray(fromChunks(chunks))).toEqual(
          await getStreamAsArray(Readable.from(chunks)),
        )
      })
    }
  }

  test('string chunks', async () => {
    const chunks = ['a', 'é', '😀', '']
    expect(await toText(chunks)).toBe(await getStream(Readable.from(chunks)))
  })

  // maxBuffer: 0 throws a TypeError from ArrayBuffer.prototype.resize in get-stream 9.0.1.
  // PARITY.md has the details.
  test('maxBytes fails exactly where maxBuffer does for bytes', async () => {
    const chunks = randomChunks(encode(inputs.multibyte), 4)
    const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0)
    for (const maxBytes of [1, 63, total - 1, total, total + 1]) {
      const ours = await toBytes(fromChunks(chunks), { maxBytes }).then(
        () => 'ok',
        (error) => (error instanceof MaxBytesError ? 'limit' : error),
      )
      const theirs = await getStreamAsArrayBuffer(Readable.from(chunks), {
        maxBuffer: maxBytes,
      }).then(
        () => 'ok',
        (error) => (error instanceof MaxBufferError ? 'limit' : error),
      )
      expect(ours).toBe(theirs)
    }
  })
})

const byString = (a: string, b: string) => a.localeCompare(b)

describe('matches merge2', () => {
  const sources = () =>
    [['a', 'b'], ['c'], ['d', 'e', 'f']].map((chunks) =>
      Readable.from(chunks, { objectMode: true }),
    )

  test('concat([a, b, c]) equals merge2(a, b, c)', async () => {
    expect(await toArray(concat(sources()))).toEqual(await toArray(merge2(...sources())))
  })

  test('merge([a, b, c]) yields the same chunks as merge2([a, b, c])', async () => {
    const ours = await toArray(merge(sources()))
    const theirs = await toArray(merge2(sources()))
    expect(ours.toSorted(byString)).toEqual(theirs.toSorted(byString))
  })

  test('concat([a, merge([b, c])]) equals merge2(a, [b, c])', async () => {
    const [a, b, c] = sources()
    const [a2, b2, c2] = sources()
    const ours = await toArray(concat([a!, merge([b!, c!])]))
    const theirs = await toArray(merge2(a2!, [b2!, c2!]))
    expect(ours.slice(0, 2)).toEqual(theirs.slice(0, 2))
    expect(ours.toSorted(byString)).toEqual(theirs.toSorted(byString))
  })
})

describe('get-stream: Node streams as async iterables', () => {
  for (const StreamClass of [Readable, Duplex]) {
    test(`reads a ${StreamClass.name}`, async () => {
      expect(await toArray(StreamClass.from(['u', 'n', 'i']))).toEqual(['u', 'n', 'i'])
    })

    test(`reads an already ended ${StreamClass.name} as empty`, async () => {
      const stream = StreamClass.from(['u'])
      await stream.toArray()
      expect(await toArray(stream)).toEqual([])
    })

    test(`rejects a destroyed ${StreamClass.name}`, async () => {
      const stream = StreamClass.from(['u'])
      stream.destroy()
      await expect(toArray(stream)).rejects.toMatchObject({ code: 'ERR_STREAM_PREMATURE_CLOSE' })
    })

    test(`rejects with the error of an errored ${StreamClass.name}`, async () => {
      const stream = new StreamClass({ read() {}, write() {} })
      const error = new Error('test')
      setTimeout(() => stream.destroy(error), 0)
      await expect(toArray(stream)).rejects.toBe(error)
    })
  }

  test('rejects when read() throws', async () => {
    const error = new Error('test')
    const stream = new Readable({
      read() {
        throw error
      },
    })
    await expect(toArray(stream)).rejects.toBe(error)
  })

  test('destroys the stream when maxBytes is exceeded', async () => {
    const stream = Readable.from([encode('unicorn\n'), encode('unicorn\n')])
    await expect(toText(stream, { maxBytes: 8 })).rejects.toThrow(MaxBytesError)
    expect(stream.destroyed).toBe(true)
  })

  test('reads Buffer chunks', async () => {
    expect(await toText(Readable.from([Buffer.from('uni'), Buffer.from('corn')]))).toBe('unicorn')
  })
})
