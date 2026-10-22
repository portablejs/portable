import { describe, expect, test } from 'vite-plus/test'
import * as Webhooks from '@portable/webhooks'

// Firefox has no `Request.prototype.body` and sends a ReadableStream request body as text.
const streamBodies = 'body' in Request.prototype

const secret = 'whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw'

function slowRequest(headers: Record<string, string>) {
  const source = { cancelled: undefined as unknown, pulls: 0 }
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      source.pulls++
      if (source.pulls === 1) controller.enqueue(new TextEncoder().encode('{'))
      else return new Promise<void>(() => {})
      return undefined
    },
    cancel(reason) {
      source.cancelled = reason
    },
  })
  const init = { method: 'POST', body, headers, duplex: 'half' }
  return { request: new Request('https://example.com/webhooks', init), source }
}

describe('signal', () => {
  test.runIf(streamBodies)(
    'aborting verify while it reads the body rejects with the reason and cancels the body',
    async () => {
      const headers = await Webhooks.sign('{}', { secret })
      const { request, source } = slowRequest(headers)
      const controller = new AbortController()
      const reason = new Error('stop')
      const verifying = Webhooks.verify(request, { secret, signal: controller.signal })
      await new Promise((resolve) => setTimeout(resolve, 0))
      controller.abort(reason)
      await expect(verifying).rejects.toBe(reason)
      expect(source.cancelled).toBe(reason)
    },
  )

  test('aborting verify while the hmac runs rejects with the reason', async () => {
    const headers = await Webhooks.sign('{}', { secret })
    const controller = new AbortController()
    const reason = new Error('stop')
    const hmac = () => {
      controller.abort(reason)
      return new Promise<Uint8Array>(() => {})
    }
    await expect(
      Webhooks.verify({ headers, body: '{}' }, { secret, hmac, signal: controller.signal }),
    ).rejects.toBe(reason)
  })

  test('an aborted signal rejects verify and sign at once', async () => {
    const reason = new Error('stop')
    const signal = AbortSignal.abort(reason)
    await expect(Webhooks.sign('{}', { secret, signal })).rejects.toBe(reason)
    await expect(Webhooks.verify({ headers: {}, body: '{}' }, { secret, signal })).rejects.toBe(
      reason,
    )
  })
})
