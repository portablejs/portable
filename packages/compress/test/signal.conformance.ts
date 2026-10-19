import * as Compress from '@portable/compress'
import { describe, expect, test } from 'vite-plus/test'

describe('signal', () => {
  test('an aborted signal rejects encode and decode with its reason', async () => {
    const reason = new Error('stop')
    const signal = AbortSignal.abort(reason)
    await expect(Compress.encode('hello', { signal })).rejects.toBe(reason)
    const gzipped = await Compress.encode('hello')
    await expect(Compress.decode(gzipped, { signal })).rejects.toBe(reason)
  })

  test('aborting during decode rejects with the reason', async () => {
    const gzipped = await Compress.encode(new Uint8Array(4 << 20))
    const controller = new AbortController()
    const reason = new Error('stop')
    const decoded = Compress.decode(gzipped, { signal: controller.signal })
    controller.abort(reason)
    await expect(decoded).rejects.toBe(reason)
  })

  test('aborting errors the DecoderStream and cancels its source', async () => {
    const random = new Uint8Array(1 << 20)
    for (let i = 0; i < random.length; i += 65536)
      crypto.getRandomValues(random.subarray(i, i + 65536))
    const gzipped = await Compress.encode(random)
    const controller = new AbortController()
    let cancelled: unknown
    let offset = 0
    const source = new ReadableStream<Uint8Array>({
      pull(c) {
        if (offset >= gzipped.length) return c.close()
        c.enqueue(gzipped.subarray(offset, (offset += 64)))
      },
      cancel(reason) {
        cancelled = reason
      },
    })
    const reader = source
      .pipeThrough(new Compress.DecoderStream({ signal: controller.signal }))
      .getReader()
    await reader.read()
    const reason = new Error('stop')
    controller.abort(reason)
    await expect(reader.read()).rejects.toBe(reason)
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(cancelled).toBe(reason)
  })

  test('an aborted signal errors the DecoderStream at once', async () => {
    const reason = new Error('stop')
    const stream = new Compress.DecoderStream({ signal: AbortSignal.abort(reason) })
    await expect(stream.readable.getReader().read()).rejects.toBe(reason)
  })
})
