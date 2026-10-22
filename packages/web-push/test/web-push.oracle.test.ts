import crypto from 'node:crypto'
import ece from 'http_ece'
import { afterEach, describe, expect, test, vi } from 'vite-plus/test'
import webPush from 'web-push'
import * as WebPush from '@portable/web-push'
import { base64url, decrypt, importEcdhKeyPair, userAgent, verifyVapid } from './utils.js'

afterEach(() => {
  vi.restoreAllMocks()
})

/**
 * Runs web-push's `encrypt` with its server key and salt fixed, by stubbing the `createECDH` and
 * `randomBytes` calls it makes, and returns the body.
 */
function upstreamEncrypt(
  keys: { p256dh: string; auth: string },
  payload: string | Buffer,
  serverPrivateKey: Buffer,
  salt: Buffer,
): Buffer {
  const createECDH = crypto.createECDH
  vi.spyOn(crypto, 'createECDH').mockImplementation((curve) => {
    const ecdh = createECDH(curve)
    ecdh.generateKeys = (() => {
      ecdh.setPrivateKey(serverPrivateKey)
      return ecdh.getPublicKey()
    }) as typeof ecdh.generateKeys
    return ecdh
  })
  vi.spyOn(crypto, 'randomBytes').mockImplementation((() => salt) as never)
  const { cipherText } = webPush.encrypt(keys.p256dh, keys.auth, payload, 'aes128gcm')
  vi.restoreAllMocks()
  return cipherText
}

async function serverKey() {
  const ecdh = crypto.createECDH('prime256v1')
  ecdh.generateKeys()
  const privateKey = ecdh.getPrivateKey()
  return {
    privateKey,
    keyPair: await importEcdhKeyPair(privateKey, ecdh.getPublicKey()),
  }
}

function randomLength(): number {
  const lengths = [0, 1, 15, 16, 17, 100, 1000, 3992, WebPush.maxPayloadBytes]
  return Math.random() < 0.5
    ? lengths[Math.floor(Math.random() * lengths.length)]!
    : Math.floor(Math.random() * (WebPush.maxPayloadBytes + 1))
}

describe('encrypt matches web-push byte for byte', () => {
  test('on 200 random payloads, keys and salts', async () => {
    for (let i = 0; i < 200; i++) {
      const agent = await userAgent()
      const server = await serverKey()
      const salt = crypto.randomBytes(16)
      const payload = crypto.randomBytes(randomLength())
      const ours = await WebPush.encrypt({
        subscription: agent.subscription,
        payload,
        keyPair: server.keyPair,
        salt,
      })
      const upstream = upstreamEncrypt(agent.subscription.keys, payload, server.privateKey, salt)
      expect(base64url(ours)).toBe(base64url(upstream))
    }
  })

  test.for(['hello', '', '😁 grüße', 'x'.repeat(3000)])('on the string %j', async (payload) => {
    const agent = await userAgent()
    const server = await serverKey()
    const salt = crypto.randomBytes(16)
    const ours = await WebPush.encrypt({
      subscription: agent.subscription,
      payload,
      keyPair: server.keyPair,
      salt,
    })
    expect(Buffer.from(ours)).toEqual(
      upstreamEncrypt(agent.subscription.keys, payload, server.privateKey, salt),
    )
  })
})

describe('web-push and http_ece read our output', () => {
  test('http_ece decrypts what encrypt writes', async () => {
    const ecdh = crypto.createECDH('prime256v1')
    const publicKey = ecdh.generateKeys()
    const auth = crypto.randomBytes(16)
    const payload = crypto.randomBytes(500)
    const body = await WebPush.encrypt({
      subscription: {
        keys: { p256dh: publicKey.toString('base64url'), auth: auth.toString('base64url') },
      },
      payload,
    })
    const decrypted = ece.decrypt(Buffer.from(body), {
      version: 'aes128gcm',
      privateKey: ecdh,
      authSecret: auth.toString('base64url'),
    })
    expect(decrypted).toEqual(payload)
  })

  test('our decrypt helper reads what web-push writes', async () => {
    const agent = await userAgent()
    const { cipherText } = webPush.encrypt(
      agent.subscription.keys.p256dh,
      agent.subscription.keys.auth,
      'hello',
      'aes128gcm',
    )
    expect(new TextDecoder().decode(await decrypt(cipherText, agent))).toBe('hello')
  })

  test('web-push signs with keys from generateVapidKeys, and we sign with its keys', async () => {
    const ours = await WebPush.generateVapidKeys()
    const upstream = webPush.generateVAPIDKeys()
    const endpoint = 'https://fcm.googleapis.com:8443/fcm/send/abc'
    const theirs = webPush.getVapidHeaders(
      new URL(endpoint).origin,
      'mailto:ops@example.com',
      ours.publicKey,
      ours.privateKey,
      'aes128gcm',
    )
    const request = await WebPush.toRequest({
      subscription: { endpoint },
      vapid: { subject: 'mailto:ops@example.com', ...upstream },
    })
    const a = await verifyVapid(theirs.Authorization)
    const b = await verifyVapid(request.headers.get('authorization'))
    expect(a.publicKey).toBe(ours.publicKey)
    expect(b.publicKey).toBe(upstream.publicKey)
    expect(a.header).toEqual(b.header)
    expect({ ...a.claims, exp: 0 }).toEqual({ ...b.claims, exp: 0 })
    expect(Math.abs(a.claims.exp - b.claims.exp)).toBeLessThan(5)
  })
})

describe('toRequest matches generateRequestDetails', () => {
  test('in method, endpoint and headers', async () => {
    const agent = await userAgent('https://updates.push.services.mozilla.com/wpush/v2/gAAAAA')
    const vapid = { subject: 'https://example.com/contact', ...(await WebPush.generateVapidKeys()) }
    for (const options of [{}, { ttl: 0 }, { ttl: 60, urgency: 'high' as const, topic: 'news' }]) {
      const theirs = webPush.generateRequestDetails(agent.subscription, 'hello', {
        vapidDetails: vapid,
        ...('ttl' in options ? { TTL: options.ttl } : {}),
        ...('urgency' in options ? { urgency: options.urgency, topic: options.topic } : {}),
      })
      const ours = await WebPush.toRequest({
        subscription: agent.subscription,
        payload: 'hello',
        vapid,
        ...options,
      })
      expect(ours.method).toBe(theirs.method)
      expect(ours.url).toBe(theirs.endpoint)
      const headers = Object.fromEntries(
        Object.entries(theirs.headers).map(([name, value]) => [name.toLowerCase(), String(value)]),
      )
      expect(ours.headers.get('ttl')).toBe(headers.ttl)
      expect(ours.headers.get('content-encoding')).toBe(headers['content-encoding'])
      expect(ours.headers.get('content-type')).toBe(headers['content-type'])
      expect(ours.headers.get('topic')).toBe(headers.topic ?? null)
      expect(ours.headers.get('urgency') ?? 'normal').toBe(headers.urgency)
      expect((await ours.arrayBuffer()).byteLength).toBe(Number(headers['content-length']))
    }
  })
})
