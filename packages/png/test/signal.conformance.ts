import { describe, expect, test } from 'vite-plus/test'
import * as Png from '@portable/png'

const image = { width: 512, height: 512, data: new Uint8Array(512 * 512 * 4).map((_, i) => i * 7) }

describe('signal', () => {
  test('aborting during decode rejects with the reason', async () => {
    const bytes = await Png.encode(image)
    const controller = new AbortController()
    const reason = new Error('stop')
    const decoding = Png.decode(bytes, { signal: controller.signal })
    controller.abort(reason)
    await expect(decoding).rejects.toBe(reason)
  })

  test('aborting during encode rejects with the reason', async () => {
    const controller = new AbortController()
    const reason = new Error('stop')
    const encoding = Png.encode(image, { signal: controller.signal })
    controller.abort(reason)
    await expect(encoding).rejects.toBe(reason)
  })

  test('an aborted signal rejects before any work', async () => {
    const reason = new Error('stop')
    let called = false
    const deflate = (data: Uint8Array) => {
      called = true
      return data
    }
    await expect(Png.encode(image, { deflate, signal: AbortSignal.abort(reason) })).rejects.toBe(
      reason,
    )
    expect(called).toBe(false)
  })

  test('a signal that never aborts changes nothing', async () => {
    const small = { width: 8, height: 8, data: image.data.slice(0, 8 * 8 * 4) }
    const bytes = await Png.encode(small, { signal: new AbortController().signal })
    const decoded = await Png.decode(bytes, { signal: new AbortController().signal })
    expect(decoded.data).toEqual(small.data)
  })
})
