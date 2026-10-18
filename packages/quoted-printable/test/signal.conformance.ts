import { describe, expect, test } from 'vite-plus/test'
import * as QuotedPrintable from '@portable/quoted-printable'

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
    expect(
      await abortMidway('abc', (signal) => new QuotedPrintable.DecoderStream({ signal })),
    ).toBe(true)
  })

  test('an aborted signal errors the DecoderStream at once', async () => {
    const reason = new Error('stop')
    const stream = new QuotedPrintable.DecoderStream({ signal: AbortSignal.abort(reason) })
    await expect(stream.readable.getReader().read()).rejects.toBe(reason)
  })

  test('aborting errors the EncoderStream and cancels its source', async () => {
    expect(
      await abortMidway('abc', (signal) => new QuotedPrintable.EncoderStream({ signal })),
    ).toBe(true)
  })

  test('an aborted signal errors the EncoderStream at once', async () => {
    const reason = new Error('stop')
    const stream = new QuotedPrintable.EncoderStream({ signal: AbortSignal.abort(reason) })
    await expect(stream.readable.getReader().read()).rejects.toBe(reason)
  })
})
