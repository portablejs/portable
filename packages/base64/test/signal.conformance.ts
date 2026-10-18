import { describe, expect, test } from 'vite-plus/test'
import * as Base64 from '@portable/base64'

async function abortMidway<T>(
  chunk: T,
  transform: (signal: AbortSignal) => TransformStream<T, unknown>,
): Promise<boolean> {
  const controller = new AbortController()
  let cancelled: unknown
  const source = new ReadableStream<T>({
    pull: (c) => c.enqueue(chunk),
    cancel: (reason) => {
      cancelled = reason
    },
  })
  const reader = source.pipeThrough(transform(controller.signal)).getReader()
  await reader.read()
  const reason = new Error('stop')
  controller.abort(reason)
  await expect(reader.read()).rejects.toBe(reason)
  await new Promise((resolve) => setTimeout(resolve, 0))
  return cancelled === reason
}

describe('signal', () => {
  test('aborting errors the DecoderStream and cancels its source', async () => {
    expect(await abortMidway('QUJD', (signal) => new Base64.DecoderStream({ signal }))).toBe(true)
  })

  test('an aborted signal errors the DecoderStream at once', async () => {
    const reason = new Error('stop')
    const stream = new Base64.DecoderStream({ signal: AbortSignal.abort(reason) })
    await expect(stream.readable.getReader().read()).rejects.toBe(reason)
  })

  test('aborting errors the EncoderStream and cancels its source', async () => {
    expect(
      await abortMidway(
        new Uint8Array([1, 2, 3]),
        (signal) => new Base64.EncoderStream({ signal }),
      ),
    ).toBe(true)
  })

  test('an aborted signal errors the EncoderStream at once', async () => {
    const reason = new Error('stop')
    const stream = new Base64.EncoderStream({ signal: AbortSignal.abort(reason) })
    await expect(stream.readable.getReader().read()).rejects.toBe(reason)
  })
})
