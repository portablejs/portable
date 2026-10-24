import { describe, expect, test } from 'vite-plus/test'
import * as OAuth1 from '@portable/oauth1'

// Firefox has no `Request.prototype.body` and sends a ReadableStream request body as text.
const streamBodies = 'body' in Request.prototype

const consumer = { key: 'k', secret: 's' }

function slowFormRequest() {
  const source = { cancelled: undefined as unknown, pulls: 0 }
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      source.pulls++
      if (source.pulls === 1) controller.enqueue(new TextEncoder().encode('a=1'))
      else return new Promise<void>(() => {})
      return undefined
    },
    cancel(reason) {
      source.cancelled = reason
    },
  })
  const init = {
    method: 'POST',
    body,
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    duplex: 'half',
  }
  return { request: new Request('https://api.example.com/items', init), source }
}

describe('signal', () => {
  test.runIf(streamBodies)(
    'aborting sign while it reads a form body rejects with the reason and cancels the body',
    async () => {
      const { request, source } = slowFormRequest()
      const controller = new AbortController()
      const reason = new Error('stop')
      const signing = OAuth1.sign(request, { consumer, signal: controller.signal })
      await new Promise((resolve) => setTimeout(resolve, 0))
      controller.abort(reason)
      await expect(signing).rejects.toBe(reason)
      expect(source.cancelled).toBe(reason)
    },
  )

  test('aborting while the hmac runs rejects with the reason', async () => {
    const controller = new AbortController()
    const reason = new Error('stop')
    const hmac = () => {
      controller.abort(reason)
      return new Promise<Uint8Array>(() => {})
    }
    const request = new Request('https://api.example.com/items')
    await expect(
      OAuth1.authorization(request, { consumer, hmac, signal: controller.signal }),
    ).rejects.toBe(reason)
  })

  test('an aborted signal rejects sign and authorization at once', async () => {
    const reason = new Error('stop')
    const signal = AbortSignal.abort(reason)
    const request = new Request('https://api.example.com/items')
    await expect(OAuth1.sign(request, { consumer, signal })).rejects.toBe(reason)
    await expect(OAuth1.authorization(request, { consumer, signal })).rejects.toBe(reason)
  })
})
