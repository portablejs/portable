import { describe, expect, test } from 'vite-plus/test'
import * as Webhooks from '@portable/webhooks'
import { encode, reasonOf, request } from './utils.js'

const id = 'msg_p5jXN8AQM9LWM0D4loKWxJek'
const payload = '{"test": 2432232314}'
const secret = 'MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw'
const vector = {
  timestamp: new Date(1614265330 * 1000),
  signature: 'v1,g0hM9SsE+OTPJTGt/tmIKtSyZlE3uFJELVlNIOLJ1OE=',
}

for (const [scheme, prefix] of [
  ['standard', 'webhook'],
  ['svix', 'svix'],
] as const) {
  describe(`${scheme}`, () => {
    async function headers(
      options: { timestamp?: Date; body?: string } = {},
    ): Promise<Record<string, string>> {
      return Webhooks.sign(options.body ?? payload, { scheme, secret, id, ...options })
    }

    const verify = (
      headers: Record<string, string>,
      options: Partial<Webhooks.verify.Options> = {},
      body: string | Uint8Array = payload,
    ) => Webhooks.verify({ headers, body }, { scheme, secret, ...options })

    test('signs the published test vector', async () => {
      expect(
        await Webhooks.sign(payload, {
          scheme,
          secret: `whsec_${secret}`,
          id,
          timestamp: vector.timestamp,
        }),
      ).toEqual({
        [`${prefix}-id`]: id,
        [`${prefix}-timestamp`]: '1614265330',
        [`${prefix}-signature`]: vector.signature,
      })
    })

    test('verifies a valid signature and returns the body', async () => {
      const now = new Date()
      const result = await verify(await headers({ timestamp: now }))
      expect(result.body).toBe(payload)
      expect(JSON.parse(result.body)).toEqual({ test: 2432232314 })
      expect(result.id).toBe(id)
      expect(result.timestamp?.getTime()).toBe(Math.floor(now.getTime() / 1000) * 1000)
    })

    test('verifies the published test vector', async () => {
      const result = await verify(
        {
          [`${prefix}-id`]: id,
          [`${prefix}-timestamp`]: '1614265330',
          [`${prefix}-signature`]: vector.signature,
        },
        { now: vector.timestamp },
      )
      expect(result.body).toBe(payload)
    })

    test('works with and without the whsec_ prefix', async () => {
      const signed = await headers()
      expect((await verify(signed, { secret })).body).toBe(payload)
      expect((await verify(signed, { secret: `whsec_${secret}` })).body).toBe(payload)
    })

    test('reads header names in any case', async () => {
      const signed = Object.fromEntries(
        Object.entries(await headers()).map(([name, value]) => [name.toUpperCase(), value]),
      )
      expect((await verify(signed)).body).toBe(payload)
    })

    for (const header of ['id', 'timestamp', 'signature']) {
      test(`rejects a missing ${header} header`, async () => {
        const signed = await headers()
        delete signed[`${prefix}-${header}`]
        expect(await reasonOf(verify(signed))).toBe('missing-header')
      })
    }

    test('rejects a timestamp that is not a number', async () => {
      expect(
        await reasonOf(verify({ ...(await headers()), [`${prefix}-timestamp`]: 'hello' })),
      ).toBe('malformed-header')
    })

    test('rejects an invalid signature', async () => {
      expect(
        await reasonOf(
          verify({ ...(await headers()), [`${prefix}-signature`]: 'v1,dawfeoifkpqwoekfpqoekf' }),
        ),
      ).toBe('signature')
    })

    test('rejects a partial signature', async () => {
      const signed = await headers()
      const signature = signed[`${prefix}-signature`]!
      expect(
        await reasonOf(verify({ ...signed, [`${prefix}-signature`]: signature.slice(0, 8) })),
      ).toBe('signature')
      expect(await reasonOf(verify({ ...signed, [`${prefix}-signature`]: 'v1,' }))).toBe(
        'signature',
      )
    })

    test('rejects a timestamp older than the tolerance', async () => {
      const signed = await headers({ timestamp: new Date(Date.now() - 301_000) })
      expect(await reasonOf(verify(signed))).toBe('timestamp')
    })

    test('rejects a timestamp newer than the tolerance', async () => {
      const signed = await headers({ timestamp: new Date(Date.now() + 301_000) })
      expect(await reasonOf(verify(signed))).toBe('timestamp')
    })

    test('accepts any one valid signature among several', async () => {
      const signed = await headers()
      signed[`${prefix}-signature`] = [
        'v1,Ceo5qEr07ixe2NLpvHk3FH9bwy/WavXrAFQ/9tdO6mc=',
        'v2,Ceo5qEr07ixe2NLpvHk3FH9bwy/WavXrAFQ/9tdO6mc=',
        signed[`${prefix}-signature`],
        'v1,Ceo5qEr07ixe2NLpvHk3FH9bwy/WavXrAFQ/9tdO6mc=',
      ].join(' ')
      expect((await verify(signed)).body).toBe(payload)
    })

    test('ignores signatures of other versions', async () => {
      const signed = await headers()
      signed[`${prefix}-signature`] = signed[`${prefix}-signature`]!.replace('v1,', 'v1a,')
      expect(await reasonOf(verify(signed))).toBe('signature')
    })

    test('returns an empty body', async () => {
      expect((await verify(await headers({ body: '' }), {}, '')).body).toBe('')
    })

    test('rejects an empty secret', async () => {
      await expect(verify(await headers(), { secret: '' })).rejects.toThrow(TypeError)
      await expect(verify(await headers(), { secret: 'whsec_' })).rejects.toThrow(TypeError)
      await expect(Webhooks.sign(payload, { scheme, secret: '' })).rejects.toThrow(TypeError)
    })

    test('rejects a secret that is not base64', async () => {
      await expect(verify(await headers(), { secret: 'whsec_not*base64' })).rejects.toThrow(
        TypeError,
      )
    })

    test('takes a raw key as bytes', async () => {
      const key = encode('raw key bytes')
      const signed = await Webhooks.sign(payload, { scheme, secret: key })
      expect((await verify(signed, { secret: key })).body).toBe(payload)
    })

    test('gives each signed message a different id by default', async () => {
      const a = await Webhooks.sign(payload, { scheme, secret })
      const b = await Webhooks.sign(payload, { scheme, secret })
      expect(a[`${prefix}-id`]).toMatch(/^msg_[\w-]+$/)
      expect(a[`${prefix}-id`]).not.toBe(b[`${prefix}-id`])
    })

    test('verifies a Request', async () => {
      const signed = await headers()
      expect((await Webhooks.verify(request(payload, signed), { scheme, secret })).body).toBe(
        payload,
      )
    })
  })
}

describe('svix', () => {
  test('falls back to webhook- headers', async () => {
    const headers = await Webhooks.sign(payload, { scheme: 'standard', secret })
    const result = await Webhooks.verify({ headers, body: payload }, { scheme: 'svix', secret })
    expect(result.body).toBe(payload)
  })

  test('prefers svix- headers over webhook- headers', async () => {
    const headers = {
      ...(await Webhooks.sign(payload, { scheme: 'svix', secret })),
      'webhook-signature': 'v1,Ceo5qEr07ixe2NLpvHk3FH9bwy/WavXrAFQ/9tdO6mc=',
    }
    const result = await Webhooks.verify({ headers, body: payload }, { scheme: 'svix', secret })
    expect(result.body).toBe(payload)
  })
})

describe('standard', () => {
  test('ignores svix- headers', async () => {
    const headers = await Webhooks.sign(payload, { scheme: 'svix', secret })
    expect(
      await reasonOf(Webhooks.verify({ headers, body: payload }, { scheme: 'standard', secret })),
    ).toBe('missing-header')
  })
})
