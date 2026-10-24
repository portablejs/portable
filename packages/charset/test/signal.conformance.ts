import { describe, expect, test } from 'vite-plus/test'
import * as Charset from '@portable/charset'

async function abortMidway<chunk>(
  chunk: chunk,
  transform: (signal: AbortSignal) => TransformStream<chunk, unknown>,
): Promise<boolean> {
  const controller = new AbortController()
  let cancelled: unknown
  const source = new ReadableStream<chunk>({
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
  test('aborting errors the EncoderStream and cancels its source', async () => {
    expect(
      await abortMidway('abc', (signal) => new Charset.EncoderStream(Charset.utf8, { signal })),
    ).toBe(true)
  })

  test('an aborted signal errors the EncoderStream at once', async () => {
    const reason = new Error('stop')
    const stream = new Charset.EncoderStream(Charset.utf8, { signal: AbortSignal.abort(reason) })
    await expect(stream.readable.getReader().read()).rejects.toBe(reason)
  })
})

describe('load', () => {
  test('rejects with the reason of an aborted signal', async () => {
    const reason = new Error('stop')
    await expect(Charset.load('sjis', { signal: AbortSignal.abort(reason) })).rejects.toBe(reason)
  })

  test('rejects when the signal aborts during the import', async () => {
    const controller = new AbortController()
    const reason = new Error('stop')
    const loading = Charset.load('big5', { signal: controller.signal })
    controller.abort(reason)
    await expect(loading).rejects.toBe(reason)
  })

  test('resolves with the charset when the signal does not abort', async () => {
    const charset = await Charset.load('euc-kr', { signal: new AbortController().signal })
    expect(charset.name).toBe('EUC-KR')
  })
})
