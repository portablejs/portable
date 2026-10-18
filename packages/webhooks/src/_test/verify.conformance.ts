import { hmac } from '@noble/hashes/hmac.js'
import { sha256 } from '@noble/hashes/sha2.js'
import { describe, expect, test } from 'vite-plus/test'
import * as Core from '../core.js'
import * as Webhooks from '../index.js'
import { encode, reasonOf, request } from './utils.js'

const schemes = ['standard', 'svix', 'stripe', 'github', 'slack'] as const
const secret = 'whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw'
const nobleHmac: Core.Hmac = (key, data) => hmac(sha256, key, data)

describe('every scheme', () => {
  for (const scheme of schemes) {
    test(`${scheme}: signs and verifies bytes exactly, including a BOM and invalid UTF-8`, async () => {
      const body = new Uint8Array([0xef, 0xbb, 0xbf, 0x7b, 0x7d, 0xff, 0xfe])
      const headers = await Webhooks.sign(body, { scheme, secret })
      await Webhooks.verify(request(body, headers), { scheme, secret })
      await Webhooks.verify({ headers, body }, { scheme, secret })
      expect(
        await reasonOf(
          Webhooks.verify({ headers, body: new TextDecoder().decode(body) }, { scheme, secret }),
        ),
      ).toBe('signature')
    })

    test(`${scheme}: /core with @noble/hashes matches the WebCrypto default`, async () => {
      const timestamp = new Date()
      const id = 'msg_1'
      const headers = await Webhooks.sign('{}', { scheme, secret, timestamp, id })
      expect(await Core.sign('{}', { scheme, secret, timestamp, id, hmac: nobleHmac })).toEqual(
        headers,
      )
      const result = await Core.verify({ headers, body: '{}' }, { scheme, secret, hmac: nobleHmac })
      expect(result.body).toBe('{}')
    })

    test(`${scheme}: accepts any of several secrets, as during rotation`, async () => {
      const headers = await Webhooks.sign('{}', { scheme, secret: 'whsec_bmV3' })
      const rotating = ['whsec_b2xk', 'whsec_bmV3']
      expect(
        (await Webhooks.verify({ headers, body: '{}' }, { scheme, secret: rotating })).body,
      ).toBe('{}')
      expect(
        await reasonOf(
          Webhooks.verify({ headers, body: '{}' }, { scheme, secret: ['whsec_b2xk'] }),
        ),
      ).toBe('signature')
    })

    test(`${scheme}: rejects a body changed after signing`, async () => {
      const headers = await Webhooks.sign('{"amount":1}', { scheme, secret })
      expect(
        await reasonOf(Webhooks.verify({ headers, body: '{"amount":2}' }, { scheme, secret })),
      ).toBe('signature')
    })
  }
})

describe('verify', () => {
  test('reads the body of a Request', async () => {
    const headers = await Webhooks.sign('{"a":1}', { scheme: 'github', secret })
    const input = request('{"a":1}', headers)
    await Webhooks.verify(input, { scheme: 'github', secret })
    expect(input.bodyUsed).toBe(true)
  })

  test('accepts a Headers object', async () => {
    const headers = new Headers(await Webhooks.sign('{}', { scheme: 'stripe', secret }))
    expect(
      (await Webhooks.verify({ headers, body: '{}' }, { scheme: 'stripe', secret })).body,
    ).toBe('{}')
  })

  test('takes a synchronous or an asynchronous hmac', async () => {
    const headers = await Webhooks.sign('{}', { scheme: 'github', secret })
    const asyncHmac: Core.Hmac = async (key, data) => nobleHmac(key, data)
    for (const fn of [nobleHmac, asyncHmac]) {
      const result = await Webhooks.verify(
        { headers, body: '{}' },
        { scheme: 'github', secret, hmac: fn },
      )
      expect(result.body).toBe('{}')
    }
  })

  test('rejects a parsed body', async () => {
    const headers = await Webhooks.sign('{}', { scheme: 'stripe', secret })
    const body = JSON.parse('{}') as string
    await expect(Webhooks.verify({ headers, body }, { scheme: 'stripe', secret })).rejects.toThrow(
      TypeError,
    )
  })

  test('rejects an unknown scheme', async () => {
    const scheme = 'paypal' as Webhooks.Scheme
    await expect(Webhooks.verify({ headers: {}, body: '' }, { scheme, secret })).rejects.toThrow(
      TypeError,
    )
  })

  test('rejects a negative or NaN tolerance', async () => {
    const options = { scheme: 'github', secret } as const
    await expect(
      Webhooks.verify({ headers: {}, body: '' }, { ...options, tolerance: -1 }),
    ).rejects.toThrow(RangeError)
    await expect(
      Webhooks.verify({ headers: {}, body: '' }, { ...options, tolerance: Number.NaN }),
    ).rejects.toThrow(RangeError)
  })

  test('rejects an empty list of secrets', async () => {
    const headers = await Webhooks.sign('{}', { scheme: 'github', secret })
    await expect(
      Webhooks.verify({ headers, body: '{}' }, { scheme: 'github', secret: [] }),
    ).rejects.toThrow(TypeError)
  })

  test('accepts a timestamp exactly at the tolerance and rejects one a second past it', async () => {
    const now = new Date(1_700_000_000_000)
    for (const offset of [-300, 300]) {
      const timestamp = new Date(now.getTime() + offset * 1000)
      const headers = await Webhooks.sign('{}', { scheme: 'slack', secret, timestamp })
      await Webhooks.verify({ headers, body: '{}' }, { scheme: 'slack', secret, now })
      const late = new Date(timestamp.getTime() + Math.sign(offset) * 1000)
      const lateHeaders = await Webhooks.sign('{}', { scheme: 'slack', secret, timestamp: late })
      expect(
        await reasonOf(
          Webhooks.verify({ headers: lateHeaders, body: '{}' }, { scheme: 'slack', secret, now }),
        ),
      ).toBe('timestamp')
    }
  })

  test('checks the signature before the timestamp', async () => {
    const headers = await Webhooks.sign('{}', { scheme: 'stripe', secret, timestamp: new Date(0) })
    expect(
      await reasonOf(Webhooks.verify({ headers, body: '{"x":1}' }, { scheme: 'stripe', secret })),
    ).toBe('signature')
  })

  test('rejects a truncated Standard Webhooks signature (CVE-2024-21491)', async () => {
    const headers = await Webhooks.sign('{}', { scheme: 'standard', secret })
    const full = headers['webhook-signature']!
    for (const length of [4, 8, 20, 40]) {
      const truncated = { ...headers, 'webhook-signature': full.slice(0, 3 + length) }
      expect(
        await reasonOf(
          Webhooks.verify({ headers: truncated, body: '{}' }, { scheme: 'standard', secret }),
        ),
      ).toBe('signature')
    }
  })

  test('signs a body given as bytes the same as its text', async () => {
    const options = { scheme: 'github', secret } as const
    expect(await Webhooks.sign(encode('{"é":1}'), options)).toEqual(
      await Webhooks.sign('{"é":1}', options),
    )
  })
})
