import { describe, expect, test } from 'vite-plus/test'
import * as WebPush from '@portable/web-push'
import { decrypt, pushService, userAgent, verifyVapid } from './utils.js'

const vapid: WebPush.Vapid = {
  subject: 'mailto:ops@example.com',
  publicKey:
    'BDktD8eWXxRBejqiC_F3OwkHxonimzIBkPa7L4XflJtOnPoBLJQ7lLbCmxlLNywNTp-MF30-cKWa3k9WEkLcZEE',
  privateKey: 'sfgZehuVVExoyNAnj7Benvwt4H2RyaHyafL_A_FzTn0',
}
const text = new TextDecoder()
const agent = await userAgent()

async function sent(
  payload: string | Uint8Array | undefined,
  options: Partial<WebPush.send.Options> = {},
  status = 201,
) {
  const service = pushService(status, 'ok')
  const result = await WebPush.send(agent.subscription, payload, {
    vapid,
    fetch: service.fetch,
    ...options,
  })
  const request = service.requests[0]!
  const body = new Uint8Array(await request.arrayBuffer())
  return { result, request, body }
}

describe('send', () => {
  test('POSTs the encrypted payload with the push headers', async () => {
    const { result, request, body } = await sent('hello')
    expect(result).toEqual({ kind: 'sent', status: 201 })
    expect(request.method).toBe('POST')
    expect(request.url).toBe(agent.subscription.endpoint)
    expect(request.headers.get('ttl')).toBe('2419200')
    expect(request.headers.get('content-encoding')).toBe('aes128gcm')
    expect(request.headers.get('content-type')).toBe('application/octet-stream')
    expect(request.headers.get('urgency')).toBeNull()
    expect(request.headers.get('topic')).toBeNull()
    await verifyVapid(request.headers.get('authorization'))
    expect(text.decode(await decrypt(body, agent))).toBe('hello')
  })

  test('sends bytes', async () => {
    const { body } = await sent(new Uint8Array([104, 105]))
    expect(text.decode(await decrypt(body, agent))).toBe('hi')
  })

  test('sends a non-ASCII string', async () => {
    const { body } = await sent('😁')
    expect(text.decode(await decrypt(body, agent))).toBe('😁')
  })

  test('sends an empty string as an encrypted empty payload', async () => {
    const { request, body } = await sent('')
    expect(request.headers.get('content-encoding')).toBe('aes128gcm')
    expect(await decrypt(body, agent)).toEqual(new Uint8Array())
  })

  test('sends no body when the payload is undefined', async () => {
    const { request, body } = await sent(undefined)
    expect(body).toHaveLength(0)
    expect(request.headers.get('content-encoding')).toBeNull()
    expect(request.headers.get('ttl')).toBe('2419200')
    await verifyVapid(request.headers.get('authorization'))
  })

  test('sends an empty push to a subscription without keys', async () => {
    const service = pushService()
    const result = await WebPush.send({ endpoint: agent.subscription.endpoint }, undefined, {
      vapid,
      fetch: service.fetch,
    })
    expect(result.kind).toBe('sent')
  })

  test.for([0, 5, 86400])('sends ttl %i', async (ttl) => {
    const { request } = await sent('hello', { ttl })
    expect(request.headers.get('ttl')).toBe(String(ttl))
  })

  test.for([-1, 1.5, Number.NaN, Infinity, '60' as unknown as number])(
    'rejects ttl %s',
    async (ttl) => {
      await expect(sent('hello', { ttl })).rejects.toThrow(RangeError)
    },
  )

  test.for(['very-low', 'low', 'normal', 'high'] as const)('sends urgency %s', async (urgency) => {
    const { request } = await sent('hello', { urgency })
    expect(request.headers.get('urgency')).toBe(urgency)
  })

  test('rejects an unknown urgency', async () => {
    await expect(sent('hello', { urgency: 'urgent' as WebPush.Urgency })).rejects.toThrow(
      RangeError,
    )
  })

  test('sends a topic', async () => {
    const { request } = await sent('hello', { topic: 'chat-42_unread' })
    expect(request.headers.get('topic')).toBe('chat-42_unread')
  })

  test.for(['', 'a'.repeat(33), 'has space', 'slash/plus+'])('rejects topic %j', async (topic) => {
    await expect(sent('hello', { topic })).rejects.toThrow(RangeError)
  })

  test.for([200, 201, 202, 204])('returns sent for status %i', async (status) => {
    const { result } = await sent('hello', {}, status)
    expect(result).toEqual({ kind: 'sent', status })
  })

  test.for([404, 410])('returns gone for status %i', async (status) => {
    const { result } = await sent('hello', {}, status)
    expect(result).toEqual({ kind: 'gone', status })
  })

  test.for([400, 403, 413, 429, 500, 503])('throws ResponseError for status %i', async (status) => {
    const service = pushService(status, '{"reason":"BadJwtToken"}')
    const error = await WebPush.send(agent.subscription, 'hello', {
      vapid,
      fetch: service.fetch,
    }).catch((error: unknown) => error)
    expect(error).toBeInstanceOf(WebPush.ResponseError)
    expect(error).toMatchObject({ status, body: '{"reason":"BadJwtToken"}' })
    expect((error as WebPush.ResponseError).headers).toBeInstanceOf(Headers)
  })

  test('rejects with the fetch error when the push service is unreachable', async () => {
    const failure = new TypeError('fetch failed')
    await expect(
      sent('hello', {
        fetch: () => Promise.reject(failure),
      }),
    ).rejects.toBe(failure)
  })

  test('passes the signal to fetch through the request', async () => {
    const controller = new AbortController()
    const reason = new Error('stop')
    const promise = sent('hello', {
      signal: controller.signal,
      fetch: (request) =>
        new Promise((_, reject) => {
          request.signal.addEventListener('abort', () => reject(request.signal.reason))
          controller.abort(reason)
        }),
    })
    await expect(promise).rejects.toBe(reason)
  })

  test('rejects an aborted signal before sending', async () => {
    const service = pushService()
    const reason = new Error('stop')
    await expect(
      WebPush.send(agent.subscription, 'hello', {
        vapid,
        fetch: service.fetch,
        signal: AbortSignal.abort(reason),
      }),
    ).rejects.toBe(reason)
    expect(service.requests).toHaveLength(0)
  })

  const { p256dh, auth } = agent.subscription.keys
  test.for<[string, unknown, string | undefined]>([
    ['no subscription', undefined, undefined],
    ['no endpoint', {}, undefined],
    ['an empty endpoint', { endpoint: '' }, undefined],
    ['an array endpoint', { endpoint: [] }, undefined],
    ['an object endpoint', { endpoint: {} }, undefined],
    ['a boolean endpoint', { endpoint: true }, undefined],
    ['an endpoint that is not a URL', { endpoint: 'push service' }, undefined],
    ['an http: endpoint', { endpoint: 'http://push.example.net/p/1' }, undefined],
    ['a payload with no keys', { endpoint: agent.subscription.endpoint }, 'hello'],
    [
      'a payload with only p256dh',
      { endpoint: agent.subscription.endpoint, keys: { p256dh } },
      'hi',
    ],
    ['a payload with only auth', { endpoint: agent.subscription.endpoint, keys: { auth } }, 'hi'],
  ])('rejects %s', async ([, subscription, payload]) => {
    const service = pushService()
    await expect(
      WebPush.send(subscription as WebPush.Subscription, payload, { vapid, fetch: service.fetch }),
    ).rejects.toThrow(WebPush.InvalidInputError)
    expect(service.requests).toHaveLength(0)
  })

  test('rejects a payload that is not a string or bytes', async () => {
    await expect(sent([] as never)).rejects.toThrow(TypeError)
  })
})

describe('toRequest', () => {
  test('returns the request send would make', async () => {
    const request = await WebPush.toRequest(agent.subscription, 'hello', {
      vapid,
      ttl: 60,
      urgency: 'high',
      topic: 'news',
    })
    expect(request.method).toBe('POST')
    expect(request.url).toBe(agent.subscription.endpoint)
    expect(Object.fromEntries(request.headers)).toMatchObject({
      ttl: '60',
      urgency: 'high',
      topic: 'news',
      'content-encoding': 'aes128gcm',
    })
    const body = new Uint8Array(await request.arrayBuffer())
    expect(text.decode(await decrypt(body, agent))).toBe('hello')
  })
})
