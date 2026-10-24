import { describe, expect, test } from 'vite-plus/test'
import * as Compress from '@portable/compress'
import * as Streams from '@portable/streams'
import {
  chunked,
  difference,
  decode,
  decodeChunks,
  fixture,
  formats,
  randomBytes,
  randomChunks,
} from './utils.js'

describe('DecoderStream', () => {
  for (const format of formats) {
    test(`${format}: decodes randomly chunked input`, async () => {
      const data = await fixture('lorem_utf_100k.txt')
      const compressed = await Compress.encode(data, { format })
      for (const seed of [1, 2, 3]) {
        expect(
          difference(await decodeChunks(randomChunks(compressed, seed, 4096), { format }), data),
        ).toBe(undefined)
      }
    })
  }

  test('100 bytes, one byte per chunk', async () => {
    const data = randomBytes(100, 4)
    expect(difference(await decodeChunks(chunked(await Compress.encode(data), 1)), data)).toBe(
      undefined,
    )
  })

  test('20,000 bytes, ten bytes per chunk', async () => {
    const data = randomBytes(20_000, 5)
    expect(difference(await decodeChunks(chunked(await Compress.encode(data), 10)), data)).toBe(
      undefined,
    )
  })

  test('16 KiB + 1 of output, one byte per chunk', async () => {
    const data = randomBytes(16 * 1024 + 1, 6)
    expect(
      difference(
        await decodeChunks(chunked(await Compress.encode(data, { format: 'deflate' }), 1), {
          format: 'deflate',
        }),
        data,
      ),
    ).toBe(undefined)
  })

  test('large chunks', async () => {
    const data = randomBytes(1_000_000, 7)
    expect(
      difference(await decodeChunks(chunked(await Compress.encode(data), 100_000)), data),
    ).toBe(undefined)
  })

  test('empty chunks', async () => {
    const compressed = await Compress.encode('hello')
    const chunks = [
      new Uint8Array(0),
      compressed.subarray(0, 5),
      new Uint8Array(0),
      compressed.subarray(5),
    ]
    expect(decode(await decodeChunks(chunks))).toBe('hello')
  })

  test('is a TransformStream', () => {
    expect(new Compress.DecoderStream()).toBeInstanceOf(TransformStream)
  })

  test('emits output before the input ends', async () => {
    const flushed = new Uint8Array([
      0xca, 0x48, 0xcd, 0xc9, 0xc9, 0x57, 0x28, 0xcf, 0x2f, 0xca, 0x49, 0x51, 0xc8, 0x40, 0xb0,
      0x01, 0x00, 0x00, 0x00, 0xff, 0xff,
    ])
    const stream = new Compress.DecoderStream({ format: 'deflate-raw' })
    const writer = stream.writable.getWriter()
    void writer.write(flushed)
    const reader = stream.readable.getReader()
    let text = ''
    while (text.length < 23) {
      text += decode((await reader.read()).value!)
    }
    expect(text).toBe('hello world hello world')
    await reader.cancel()
  })

  test('truncated input fails with TruncatedError', async () => {
    const compressed = await Compress.encode(randomBytes(50_000, 8))
    await expect(decodeChunks(chunked(compressed.subarray(0, -10), 1000))).rejects.toThrow(
      Compress.TruncatedError,
    )
  })

  test('deflate cut inside its data or its checksum fails with TruncatedError', async () => {
    const compressed = await Compress.encode(randomBytes(50_000, 8), { format: 'deflate' })
    for (const cut of [2, 10]) {
      for (const size of [3, 1000]) {
        await expect(
          decodeChunks(chunked(compressed.subarray(0, -cut), size), { format: 'deflate' }),
        ).rejects.toThrow(Compress.TruncatedError)
      }
    }
  })

  test('corrupt input fails with InvalidInputError', async () => {
    const compressed = await Compress.encode(randomBytes(50_000, 9))
    compressed[compressed.length - 7]! ^= 1
    await expect(decodeChunks(chunked(compressed, 1000))).rejects.toThrow(
      Compress.InvalidInputError,
    )
    await expect(decodeChunks([new TextEncoder().encode('not gzip')])).rejects.toThrow(
      Compress.InvalidInputError,
    )
  })

  test('a second gzip member fails with InvalidInputError', async () => {
    const joined = new Uint8Array([
      ...(await Compress.encode('foo')),
      ...(await Compress.encode('bar')),
    ])
    await expect(decodeChunks([joined])).rejects.toThrow(Compress.InvalidInputError)
  })

  test('rejects a chunk that is not a Uint8Array', async () => {
    const stream = new Compress.DecoderStream()
    const writer = stream.writable.getWriter() as WritableStreamDefaultWriter<unknown>
    await expect(writer.write('text')).rejects.toThrow(TypeError)
  })
})

describe('DecoderStream maxBytes', () => {
  test('fails past the limit and cancels the input', async () => {
    const compressed = await Compress.encode(randomBytes(5_000_000, 11))
    let cancelled: unknown
    let sent = 0
    const chunks = chunked(compressed, 1024)
    const source = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (sent < chunks.length) {
          controller.enqueue(chunks[sent++]!)
        } else {
          controller.close()
        }
      },
      cancel(reason) {
        cancelled = reason
      },
    })
    const error = await Streams.toBytes(
      source.pipeThrough(new Compress.DecoderStream({ maxBytes: 1_000_000 })),
    ).catch((e) => e)
    expect(error).toBeInstanceOf(Compress.MaxBytesError)
    expect(error.maxBytes).toBe(1_000_000)
    await new Promise((resolve) => setTimeout(resolve, 10))
    expect(cancelled).toBe(error)
    expect(sent).toBeLessThan(chunks.length)
  })

  test('accepts output exactly at the limit', async () => {
    const compressed = await Compress.encode(new Uint8Array(100_000))
    expect((await decodeChunks([compressed], { maxBytes: 100_000 })).length).toBe(100_000)
    await expect(decodeChunks([compressed], { maxBytes: 99_999 })).rejects.toThrow(
      Compress.MaxBytesError,
    )
  })
})

describe('DecoderStream cancellation', () => {
  test('cancelling the output cancels the input', async () => {
    const compressed = await Compress.encode(randomBytes(200_000, 10))
    let cancelled: unknown
    const source = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(compressed.subarray(0, 1000))
      },
      cancel(reason) {
        cancelled = reason
      },
    })
    const reader = source.pipeThrough(new Compress.DecoderStream()).getReader()
    await reader.read()
    await reader.cancel('done')
    await new Promise((resolve) => setTimeout(resolve, 10))
    expect(cancelled).toBe('done')
  })

  test('aborting the input fails the output with the same reason', async () => {
    const stream = new Compress.DecoderStream()
    const reason = new Error('upstream failed')
    await stream.writable.abort(reason)
    await expect(stream.readable.getReader().read()).rejects.toBe(reason)
  })
})
