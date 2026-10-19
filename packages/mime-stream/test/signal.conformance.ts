import * as MimeStream from '@portable/mime-stream'
import { describe, expect, test } from 'vite-plus/test'

const encode = (text: string): Uint8Array => new TextEncoder().encode(text)

function endless(first: string, then: string) {
  const state: { cancelled: unknown } = { cancelled: undefined }
  let started = false
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      controller.enqueue(encode(started ? then : first))
      started = true
    },
    cancel(reason) {
      state.cancelled = reason
    },
  })
  return { stream, state }
}

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
    const first = encode('Subject: x\r\n\r\n')
    let sent = false
    const controller = new AbortController()
    let cancelled: unknown
    const source = new ReadableStream<Uint8Array>({
      pull(c) {
        c.enqueue(sent ? encode('body line\r\n') : first)
        sent = true
      },
      cancel(reason) {
        cancelled = reason
      },
    })
    const reader = source
      .pipeThrough(new MimeStream.DecoderStream({ signal: controller.signal }))
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
    const stream = new MimeStream.DecoderStream({ signal: AbortSignal.abort(reason) })
    await expect(stream.readable.getReader().read()).rejects.toBe(reason)
  })

  test('aborting errors the EncoderStream and cancels its source', async () => {
    expect(
      await abortMidway('line\r\n', (signal) => new MimeStream.EncoderStream({ signal })),
    ).toBe(true)
  })

  test('splitHeaders rejects with signal.reason while reading the header block', async () => {
    const { stream, state } = endless('Subject: x\r\n', 'X-Long: y\r\n')
    const controller = new AbortController()
    const reason = new Error('stop')
    const split = MimeStream.splitHeaders(stream, { signal: controller.signal })
    controller.abort(reason)
    await expect(split).rejects.toBe(reason)
    expect(state.cancelled).toBe(reason)
  })

  test('aborting after splitHeaders errors the body and cancels the input', async () => {
    const { stream, state } = endless('Subject: x\r\n\r\n', 'body\r\n')
    const controller = new AbortController()
    const { body } = await MimeStream.splitHeaders(stream, { signal: controller.signal })
    const reader = body.getReader()
    await reader.read()
    const reason = new Error('stop')
    controller.abort(reason)
    await expect(reader.read()).rejects.toBe(reason)
    expect(state.cancelled).toBe(reason)
  })
})
