import { describe, expect, test } from 'vite-plus/test'
import * as ImageSize from '@portable/image-size'

describe('signal', () => {
  test('aborting parseStream rejects with the reason and cancels the stream', async () => {
    const controller = new AbortController()
    const reason = new Error('stop')
    let cancelled: unknown
    let pulls = 0
    const stream = new ReadableStream<Uint8Array>({
      pull(c) {
        pulls++
        if (pulls === 1) c.enqueue(new Uint8Array([0xff, 0xd8]))
        else if (pulls === 2) controller.abort(reason)
      },
      cancel: (r) => {
        cancelled = r
      },
    })
    await expect(ImageSize.parseStream(stream, { signal: controller.signal })).rejects.toBe(reason)
    expect(cancelled).toBe(reason)
  })

  test('an aborted signal rejects at once', async () => {
    const reason = new Error('stop')
    const stream = new ReadableStream<Uint8Array>({ pull: () => new Promise(() => {}) })
    await expect(ImageSize.parseStream(stream, { signal: AbortSignal.abort(reason) })).rejects.toBe(
      reason,
    )
  })
})
