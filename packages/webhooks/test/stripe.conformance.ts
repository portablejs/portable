import { describe, expect, test } from 'vite-plus/test'
import * as Webhooks from '@portable/webhooks'
import { encode, reasonOf, request } from './utils.js'

const payload = JSON.stringify({ id: 'evt_test_webhook', object: 'event' }, null, 2)
const secret = 'whsec_test_secret'
const scheme = Webhooks.stripe
const vector = {
  now: new Date(1700000000 * 1000),
  header: 't=1700000000,v1=4f1cd7feda9826e746b7d482c4badebb657398df1099e1046364f6196a230150',
}

const header = async (options: { timestamp?: Date; secret?: string; body?: string } = {}) =>
  (
    await Webhooks.sign(options.body ?? payload, {
      scheme,
      secret: options.secret ?? secret,
      ...(options.timestamp ? { now: options.timestamp } : {}),
    })
  )['stripe-signature']!

const verify = (
  signature: string,
  options: Partial<Webhooks.verify.Options> = {},
  body: string | Uint8Array = payload,
) =>
  Webhooks.verify(
    { headers: { 'stripe-signature': signature }, body },
    { scheme, secret, ...options },
  )

describe('stripe', () => {
  test('signs a header in t=<seconds>,v1=<hex> form', async () => {
    expect(await Webhooks.sign(payload, { scheme, secret, now: vector.now })).toEqual({
      'stripe-signature': vector.header,
    })
  })

  test('verifies a known header and returns the body', async () => {
    const result = await verify(vector.header, { now: vector.now })
    expect(JSON.parse(result.body)).toEqual({ id: 'evt_test_webhook', object: 'event' })
    expect(result.timestamp).toEqual(vector.now)
    expect(result.id).toBeUndefined()
  })

  test('verifies a body given as bytes', async () => {
    expect((await verify(await header(), {}, encode(payload))).body).toBe(payload)
  })

  test('verifies a Request', async () => {
    const headers = { 'stripe-signature': await header() }
    expect((await Webhooks.verify(request(payload, headers), { scheme, secret })).body).toBe(
      payload,
    )
  })

  test('keeps the whsec_ prefix as part of the key', async () => {
    expect(await reasonOf(verify(await header(), { secret: 'test_secret' }))).toBe('signature')
    expect(await reasonOf(verify(await header({ secret: 'test_secret' })))).toBe('signature')
  })

  test('returns a body that is not JSON, for the caller to parse', async () => {
    const body = '} I am not valid JSON; 123]['
    const result = await verify(await header({ body }), {}, body)
    expect(result.body).toBe(body)
    expect(() => JSON.parse(result.body)).toThrow(SyntaxError)
  })

  test('rejects a header that does not have the expected format', async () => {
    expect(await reasonOf(verify("I'm not even a real signature header"))).toBe('malformed-header')
    expect(await reasonOf(verify('bad_header'))).toBe('malformed-header')
  })

  test('rejects a missing or empty header', async () => {
    expect(
      await reasonOf(Webhooks.verify({ headers: {}, body: payload }, { scheme, secret })),
    ).toBe('missing-header')
    expect(await reasonOf(verify(''))).toBe('missing-header')
  })

  test('rejects a header with no v1 signature', async () => {
    expect(await reasonOf(verify((await header()).replace('v1=', 'v0=')))).toBe('signature')
  })

  test('rejects a header with no valid signature', async () => {
    const t = Math.floor(Date.now() / 1000)
    expect(await reasonOf(verify(`t=${t},v1=bad_signature`))).toBe('signature')
  })

  test('rejects a timestamp outside the tolerance of now', async () => {
    const signature = await header({ timestamp: new Date(vector.now.getTime() - 15_000) })
    expect(await reasonOf(verify(signature, { tolerance: 10_000, now: vector.now }))).toBe(
      'timestamp',
    )
  })

  test('rejects a timestamp outside the tolerance of the current time', async () => {
    const signature = await header({ timestamp: new Date(Date.now() - 15_000) })
    expect(await reasonOf(verify(signature, { tolerance: 10_000 }))).toBe('timestamp')
  })

  test('accepts a timestamp within the tolerance of the current time', async () => {
    expect((await verify(await header(), { tolerance: 10_000 })).body).toBe(payload)
  })

  test('accepts a timestamp within the tolerance of now', async () => {
    const signature = await header({ timestamp: new Date(vector.now.getTime() - 9_000) })
    expect((await verify(signature, { tolerance: 10_000, now: vector.now })).body).toBe(payload)
  })

  test('accepts a header with at least one valid signature', async () => {
    expect((await verify(`${await header()},v1=potato`)).body).toBe(payload)
    const [t, v1] = (await header()).split(',')
    expect((await verify(`${t},v1=${'0'.repeat(64)},${v1}`)).body).toBe(payload)
  })

  test('uses a five-minute tolerance by default', async () => {
    expect(await reasonOf(verify(await header({ timestamp: new Date(12345 * 1000) })))).toBe(
      'timestamp',
    )
    const recent = await header({ timestamp: new Date(Date.now() - 290_000) })
    expect((await verify(recent)).body).toBe(payload)
  })

  test('skips the timestamp check when tolerance is Infinity', async () => {
    const signature = await header({ timestamp: new Date(12345 * 1000) })
    expect((await verify(signature, { tolerance: Infinity })).body).toBe(payload)
  })

  test('rejects a timestamp in the future beyond the tolerance', async () => {
    const signature = await header({ timestamp: new Date(Date.now() + 600_000) })
    expect(await reasonOf(verify(signature))).toBe('timestamp')
  })

  test('rejects a signing secret with trailing whitespace', async () => {
    expect(await reasonOf(verify(await header(), { secret: `${secret} ` }))).toBe('signature')
  })

  test('rejects an empty secret', async () => {
    await expect(verify(await header(), { secret: '' })).rejects.toThrow(RangeError)
  })

  test('rejects a re-serialized JSON body', async () => {
    const reserialized = JSON.stringify(JSON.parse(payload))
    expect(await reasonOf(verify(await header(), {}, reserialized))).toBe('signature')
  })

  test('rejects a header with two timestamps', async () => {
    const signature = await header()
    expect(await reasonOf(verify(`t=1,${signature}`))).toBe('malformed-header')
  })

  test('rejects a timestamp with trailing characters', async () => {
    const [t, v1] = (await header()).split(',')
    expect(await reasonOf(verify(`${t}abc,${v1}`))).toBe('malformed-header')
  })
})
