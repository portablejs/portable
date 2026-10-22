import * as Base64 from '@portable/base64'
import { describe, expect, test } from 'vite-plus/test'
import * as WebPush from '@portable/web-push'
import { base64url, decrypt, fromBase64url, importEcdhKeyPair, userAgent } from './utils.js'

const text = new TextDecoder()

async function roundTrip(payload: string | Uint8Array): Promise<Uint8Array> {
  const agent = await userAgent()
  return decrypt(await WebPush.encrypt({ subscription: agent.subscription, payload }), agent)
}

const agent = await userAgent()
const { p256dh, auth } = agent.subscription.keys
const notOnCurve = new Uint8Array(65)
notOnCurve[0] = 4
const compressed = agent.publicKey.slice(0, 33)
compressed[0] = 2

describe('RFC 8291 §5 and Appendix A', () => {
  const vector = {
    plaintext: 'V2hlbiBJIGdyb3cgdXAsIEkgd2FudCB0byBiZSBhIHdhdGVybWVsb24',
    asPublic:
      'BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8',
    asPrivate: 'yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw',
    uaPublic:
      'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4',
    uaPrivate: 'q1dXpw3UpT5VOmu_cf_v6ih07Aems3njxI-JWgLcM94',
    salt: 'DGv6ra1nlYgDCS1FRnbzlw',
    auth: 'BTBZMqHH6r4Tts7J_aSIgg',
    message: `DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN`,
  }

  test('encrypts the example message byte for byte', async () => {
    const keyPair = await importEcdhKeyPair(
      fromBase64url(vector.asPrivate),
      fromBase64url(vector.asPublic),
    )
    const body = await WebPush.encrypt({
      subscription: { keys: { p256dh: vector.uaPublic, auth: vector.auth } },
      payload: fromBase64url(vector.plaintext),
      keyPair,
      salt: fromBase64url(vector.salt),
    })
    expect(base64url(body)).toBe(vector.message)
  })

  test('the example message decrypts with the user agent key', async () => {
    const publicKey = fromBase64url(vector.uaPublic)
    const keyPair = await importEcdhKeyPair(fromBase64url(vector.uaPrivate), publicKey)
    const agent = { keyPair, publicKey, auth: fromBase64url(vector.auth) }
    const plaintext = await decrypt(fromBase64url(vector.message), {
      ...agent,
      subscription: { endpoint: '', keys: { p256dh: vector.uaPublic, auth: vector.auth } },
    })
    expect(text.decode(plaintext)).toBe('When I grow up, I want to be a watermelon')
  })
})

describe('encrypt', () => {
  test('a string decrypts to its UTF-8 bytes', async () => {
    expect(text.decode(await roundTrip('hello'))).toBe('hello')
  })

  test('bytes decrypt to the same bytes', async () => {
    const bytes = new Uint8Array([0, 1, 2, 0xff, 0xfe, 0])
    expect(await roundTrip(bytes)).toEqual(bytes)
  })

  test('a non-ASCII string decrypts unchanged', async () => {
    expect(text.decode(await roundTrip('😁 grüße'))).toBe('😁 grüße')
  })

  test('an empty string decrypts to an empty payload', async () => {
    expect(await roundTrip('')).toEqual(new Uint8Array())
  })

  test('writes an 86-byte header with record size 4096 and the server key', async () => {
    const agent = await userAgent()
    const body = await WebPush.encrypt({ subscription: agent.subscription, payload: 'hello' })
    expect(body.length).toBe(86 + 5 + 1 + 16)
    expect(new DataView(body.buffer).getUint32(16)).toBe(4096)
    expect(body[20]).toBe(65)
    expect(body[21]).toBe(4)
  })

  test(`accepts ${WebPush.maxPayloadBytes} bytes as one 4096-byte record`, async () => {
    const payload = crypto.getRandomValues(new Uint8Array(WebPush.maxPayloadBytes))
    const agent = await userAgent()
    const body = await WebPush.encrypt({ subscription: agent.subscription, payload })
    expect(body.length).toBe(4096)
    expect(await decrypt(body, agent)).toEqual(payload)
  })

  test('rejects a payload one byte over the limit', async () => {
    const agent = await userAgent()
    const payload = new Uint8Array(WebPush.maxPayloadBytes + 1)
    await expect(WebPush.encrypt({ subscription: agent.subscription, payload })).rejects.toThrow(
      WebPush.InvalidInputError,
    )
  })

  test('uses a new salt and server key for every message', async () => {
    const agent = await userAgent()
    const a = await WebPush.encrypt({ subscription: agent.subscription, payload: 'hello' })
    const b = await WebPush.encrypt({ subscription: agent.subscription, payload: 'hello' })
    expect(a.subarray(0, 16)).not.toEqual(b.subarray(0, 16))
    expect(a.subarray(21, 86)).not.toEqual(b.subarray(21, 86))
  })

  test('accepts standard base64 keys with padding', async () => {
    const agent = await userAgent()
    const keys = { p256dh: Base64.encode(agent.publicKey), auth: Base64.encode(agent.auth) }
    const body = await WebPush.encrypt({ subscription: { keys }, payload: 'hello' })
    expect(text.decode(await decrypt(body, agent))).toBe('hello')
  })

  test('accepts keys as bytes', async () => {
    const agent = await userAgent()
    const body = await WebPush.encrypt({
      subscription: { keys: { p256dh: agent.publicKey, auth: agent.auth } },
      payload: 'hi',
    })
    expect(text.decode(await decrypt(body, agent))).toBe('hi')
  })

  test('rejects an aborted signal with its reason', async () => {
    const agent = await userAgent()
    const reason = new Error('stop')
    await expect(
      WebPush.encrypt({
        subscription: agent.subscription,
        payload: 'hello',
        signal: AbortSignal.abort(reason),
      }),
    ).rejects.toBe(reason)
  })

  test('rejects a salt that is not 16 bytes', async () => {
    const agent = await userAgent()
    await expect(
      WebPush.encrypt({
        subscription: agent.subscription,
        payload: 'hello',
        salt: new Uint8Array(15),
      }),
    ).rejects.toThrow(RangeError)
  })

  test('rejects a payload that is not a string or bytes', async () => {
    const agent = await userAgent()
    await expect(
      WebPush.encrypt({ subscription: agent.subscription, payload: [] as never }),
    ).rejects.toThrow(TypeError)
  })

  describe('rejects malformed subscription keys', () => {
    const cases: [string, unknown][] = [
      ['no subscription keys', undefined],
      ['keys that are not an object', 'silly example'],
      ['only p256dh', { p256dh }],
      ['only auth', { auth }],
      ['p256dh as a number', { p256dh: 42, auth }],
      ['auth as a number', { p256dh, auth: 42 }],
      [
        'p256dh one byte too long',
        { p256dh: base64url(new Uint8Array([...agent.publicKey, 0])), auth },
      ],
      ['p256dh one byte too short', { p256dh: base64url(agent.publicKey.subarray(1)), auth }],
      ['p256dh not on the curve', { p256dh: base64url(notOnCurve), auth }],
      ['p256dh compressed', { p256dh: base64url(compressed), auth }],
      ['p256dh with characters outside base64', { p256dh: `${p256dh.slice(0, -4)}!@#$`, auth }],
      ['auth of 15 bytes', { p256dh, auth: base64url(agent.auth.subarray(1)) }],
      ['auth of 17 bytes', { p256dh, auth: base64url(new Uint8Array([...agent.auth, 0])) }],
      ['an empty auth', { p256dh, auth: '' }],
    ]
    test.for(cases)('%s', async ([, keys]) => {
      await expect(
        WebPush.encrypt({ subscription: { keys: keys as WebPush.Keys }, payload: 'hello' }),
      ).rejects.toThrow(WebPush.InvalidInputError)
    })
  })
})
