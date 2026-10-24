import { hmac } from '@noble/hashes/hmac.js'
import { sha256 } from '@noble/hashes/sha2.js'
import { describe, expect, test } from 'vite-plus/test'
import * as Webhooks from '@portable/webhooks'
import { encode, codeOf, request } from './utils.js'

const schemes = Object.entries({
  standard: Webhooks.standard,
  stripe: Webhooks.stripe,
  github: Webhooks.github,
  slack: Webhooks.slack,
})
const secret = 'whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw'
const nobleHmac = ((_hash, key, data) => hmac(sha256, key, data)) satisfies Webhooks.Hmac

describe('every scheme', () => {
  for (const [name, scheme] of schemes) {
    test(`${name}: signs and verifies bytes exactly, including a BOM and invalid UTF-8`, async () => {
      const body = new Uint8Array([0xef, 0xbb, 0xbf, 0x7b, 0x7d, 0xff, 0xfe])
      const headers = await Webhooks.sign(body, { scheme, secret })
      await Webhooks.verify(request(body, headers), { scheme, secret })
      await Webhooks.verify({ headers, body }, { scheme, secret })
      expect(
        await codeOf(
          Webhooks.verify({ headers, body: new TextDecoder().decode(body) }, { scheme, secret }),
        ),
      ).toBe('signature')
    })

    test(`${name}: an @noble/hashes hmac signs as the WebCrypto default does`, async () => {
      const timestamp = new Date()
      const id = 'msg_1'
      const secrets = [secret, new Uint8Array(65).fill(7), new Uint8Array(300).fill(9)]
      for (const key of secrets) {
        const headers = await Webhooks.sign('{}', { scheme, secret: key, now: timestamp, id })
        expect(
          await Webhooks.sign('{}', { scheme, secret: key, now: timestamp, id, hmac: nobleHmac }),
        ).toEqual(headers)
        const result = await Webhooks.verify(
          { headers, body: '{}' },
          { scheme, secret: key, hmac: nobleHmac },
        )
        expect(result.body).toBe('{}')
      }
    })

    test(`${name}: accepts any of several secrets, as during rotation`, async () => {
      const headers = await Webhooks.sign('{}', { scheme, secret: 'whsec_bmV3' })
      const rotating = ['whsec_b2xk', 'whsec_bmV3']
      expect(
        (await Webhooks.verify({ headers, body: '{}' }, { scheme, secret: rotating })).body,
      ).toBe('{}')
      expect(
        await codeOf(Webhooks.verify({ headers, body: '{}' }, { scheme, secret: ['whsec_b2xk'] })),
      ).toBe('signature')
    })

    test(`${name}: rejects a body changed after signing`, async () => {
      const headers = await Webhooks.sign('{"amount":1}', { scheme, secret })
      expect(
        await codeOf(Webhooks.verify({ headers, body: '{"amount":2}' }, { scheme, secret })),
      ).toBe('signature')
    })
  }
})

describe('verify', () => {
  test('reads the body of a Request', async () => {
    const headers = await Webhooks.sign('{"a":1}', { scheme: Webhooks.github, secret })
    const input = request('{"a":1}', headers)
    await Webhooks.verify(input, { scheme: Webhooks.github, secret })
    expect(input.bodyUsed).toBe(true)
  })

  test('accepts a Headers object', async () => {
    const headers = new Headers(await Webhooks.sign('{}', { scheme: Webhooks.stripe, secret }))
    expect(
      (await Webhooks.verify({ headers, body: '{}' }, { scheme: Webhooks.stripe, secret })).body,
    ).toBe('{}')
  })

  test('takes a synchronous or an asynchronous hmac', async () => {
    const headers = await Webhooks.sign('{}', { scheme: Webhooks.github, secret })
    const asyncHmac = (async (hash, key, data) =>
      nobleHmac(hash, key, data)) satisfies Webhooks.Hmac
    for (const fn of [nobleHmac, asyncHmac]) {
      const result = await Webhooks.verify(
        { headers, body: '{}' },
        { scheme: Webhooks.github, secret, hmac: fn },
      )
      expect(result.body).toBe('{}')
    }
  })

  test('rejects a parsed body', async () => {
    const headers = await Webhooks.sign('{}', { scheme: Webhooks.stripe, secret })
    const body = JSON.parse('{}') as string
    await expect(
      Webhooks.verify({ headers, body }, { scheme: Webhooks.stripe, secret }),
    ).rejects.toThrow(TypeError)
  })

  test('rejects an unknown scheme', async () => {
    const scheme = 'paypal' as unknown as Webhooks.Scheme
    await expect(Webhooks.verify({ headers: {}, body: '' }, { scheme, secret })).rejects.toThrow(
      TypeError,
    )
  })

  test('rejects a negative or NaN tolerance', async () => {
    const options = { scheme: Webhooks.github, secret } as const
    await expect(
      Webhooks.verify({ headers: {}, body: '' }, { ...options, tolerance: -1 }),
    ).rejects.toThrow(RangeError)
    await expect(
      Webhooks.verify({ headers: {}, body: '' }, { ...options, tolerance: Number.NaN }),
    ).rejects.toThrow(RangeError)
  })

  test('rejects an empty list of secrets', async () => {
    const headers = await Webhooks.sign('{}', { scheme: Webhooks.github, secret })
    await expect(
      Webhooks.verify({ headers, body: '{}' }, { scheme: Webhooks.github, secret: [] }),
    ).rejects.toThrow(RangeError)
  })

  test('accepts a timestamp exactly at the tolerance and rejects one a second past it', async () => {
    const now = new Date(1_700_000_000_000)
    for (const offset of [-300, 300]) {
      const timestamp = new Date(now.getTime() + offset * 1000)
      const headers = await Webhooks.sign('{}', { scheme: Webhooks.slack, secret, now: timestamp })
      await Webhooks.verify({ headers, body: '{}' }, { scheme: Webhooks.slack, secret, now })
      const late = new Date(timestamp.getTime() + Math.sign(offset) * 1000)
      const lateHeaders = await Webhooks.sign('{}', {
        scheme: Webhooks.slack,
        secret,
        now: late,
      })
      expect(
        await codeOf(
          Webhooks.verify(
            { headers: lateHeaders, body: '{}' },
            { scheme: Webhooks.slack, secret, now },
          ),
        ),
      ).toBe('timestamp')
    }
  })

  test('accepts only the same second when tolerance is 0', async () => {
    const now = new Date(1_700_000_000_500)
    const options = { scheme: Webhooks.stripe, secret, tolerance: 0, now } as const
    const same = await Webhooks.sign('{}', { scheme: Webhooks.stripe, secret, now })
    expect((await Webhooks.verify({ headers: same, body: '{}' }, options)).body).toBe('{}')
    const timestamp = new Date(now.getTime() - 1000)
    const before = await Webhooks.sign('{}', { scheme: Webhooks.stripe, secret, now: timestamp })
    expect(await codeOf(Webhooks.verify({ headers: before, body: '{}' }, options))).toBe(
      'timestamp',
    )
  })

  test('checks the signature before the timestamp', async () => {
    const headers = await Webhooks.sign('{}', {
      scheme: Webhooks.stripe,
      secret,
      now: new Date(0),
    })
    expect(
      await codeOf(
        Webhooks.verify({ headers, body: '{"x":1}' }, { scheme: Webhooks.stripe, secret }),
      ),
    ).toBe('signature')
  })

  test('rejects a truncated Standard Webhooks signature (CVE-2024-21491)', async () => {
    const headers = await Webhooks.sign('{}', { scheme: Webhooks.standard, secret })
    const full = headers['webhook-signature']!
    for (const length of [4, 8, 20, 40]) {
      const truncated = { ...headers, 'webhook-signature': full.slice(0, 3 + length) }
      expect(
        await codeOf(
          Webhooks.verify(
            { headers: truncated, body: '{}' },
            { scheme: Webhooks.standard, secret },
          ),
        ),
      ).toBe('signature')
    }
  })

  test('keeps verifying correctly across many different secrets', async () => {
    const secrets = Array.from({ length: 40 }, (_, i) => `secret-${i}`)
    for (const [i, each] of secrets.entries()) {
      const headers = await Webhooks.sign('{}', { scheme: Webhooks.github, secret: each })
      const options = { scheme: Webhooks.github, secret: each } as const
      expect((await Webhooks.verify({ headers, body: '{}' }, options)).body).toBe('{}')
      const other = { scheme: Webhooks.github, secret: secrets[(i + 1) % secrets.length]! } as const
      expect(await codeOf(Webhooks.verify({ headers, body: '{}' }, other))).toBe('signature')
    }
  })

  test('signs a body given as bytes the same as its text', async () => {
    const options = { scheme: Webhooks.github, secret, id: 'd-1' } as const
    expect(await Webhooks.sign(encode('{"é":1}'), options)).toEqual(
      await Webhooks.sign('{"é":1}', options),
    )
  })
})

describe('a scheme written by the caller', () => {
  const utf8 = new TextEncoder()
  const seconds = (date: Date) => String(Math.floor(date.getTime() / 1000))
  const toHex = (bytes: Uint8Array) =>
    Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')

  // Acme sends `acme-timestamp: <seconds>` and `acme-signature: <hex>`, the HMAC-SHA256 of
  // `{timestamp}.{body}`.
  const acme = {
    parse(headers) {
      const signature = headers.get('acme-signature')
      const timestamp = headers.get('acme-timestamp')
      if (!signature || !timestamp)
        throw new Webhooks.VerificationError({
          code: 'missing-header',
          message: 'Missing Acme headers',
        })
      if (!/^[\da-f]{64}$/.test(signature) || !/^\d+$/.test(timestamp))
        throw new Webhooks.VerificationError({
          code: 'malformed-header',
          message: 'Malformed Acme headers',
        })
      return {
        signatures: [Uint8Array.from(signature.match(/../g)!, (byte) => parseInt(byte, 16))],
        timestamp: new Date(Number(timestamp) * 1000),
      }
    },
    payload: ({ timestamp, body }) =>
      new Uint8Array([...utf8.encode(`${seconds(timestamp!)}.`), ...body]),
    headers: ({ signature, timestamp }) => ({
      'acme-timestamp': seconds(timestamp),
      'acme-signature': toHex(signature),
    }),
  } satisfies Webhooks.Scheme

  test('signs and verifies with the shared checks', async () => {
    const timestamp = new Date(1_700_000_000_000)
    const headers = await Webhooks.sign('{"a":1}', { scheme: acme, secret, now: timestamp })
    expect(Object.keys(headers)).toEqual(['acme-timestamp', 'acme-signature'])
    const options = { scheme: acme, secret, now: timestamp }
    expect((await Webhooks.verify({ headers, body: '{"a":1}' }, options)).body).toBe('{"a":1}')
    expect(await codeOf(Webhooks.verify({ headers, body: '{"a":2}' }, options))).toBe('signature')
    expect(
      await codeOf(Webhooks.verify({ headers, body: '{"a":1}' }, { scheme: acme, secret })),
    ).toBe('timestamp')
    expect(await codeOf(Webhooks.verify({ headers: {}, body: '' }, options))).toBe('missing-header')
  })
})
