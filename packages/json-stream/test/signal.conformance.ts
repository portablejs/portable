import { describe, expect, test } from 'vite-plus/test'
import * as JsonStream from '@portable/json-stream'

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
  test('aborting errors the DecoderStream and cancels its source', async () => {
    expect(await abortMidway('1 ', (signal) => new JsonStream.DecoderStream({ signal }))).toBe(true)
  })

  test('an aborted signal errors the DecoderStream at once', async () => {
    const reason = new Error('stop')
    const stream = new JsonStream.DecoderStream({ signal: AbortSignal.abort(reason) })
    await expect(stream.readable.getReader().read()).rejects.toBe(reason)
  })

  test('aborting errors encodeStream output and cancels a nested stream', async () => {
    const controller = new AbortController()
    let cancelled: unknown
    const rows = new ReadableStream<number>({
      pull: (c) => c.enqueue(1),
      cancel: (reason) => {
        cancelled = reason
      },
    })
    const reader = JsonStream.encodeStream({ rows }, { signal: controller.signal }).getReader()
    await reader.read()
    const reason = new Error('stop')
    controller.abort(reason)
    await expect(reader.read()).rejects.toBe(reason)
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(cancelled).toBe(reason)
  })
})
