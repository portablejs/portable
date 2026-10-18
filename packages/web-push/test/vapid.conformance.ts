import * as Base64 from '@portable/base64'
import { describe, expect, test } from 'vite-plus/test'
import * as WebPush from '@portable/web-push'
import { fromBase64url, pushService, verifyVapid } from './utils.js'

const keys: WebPush.VapidKeys = {
  publicKey:
    'BDktD8eWXxRBejqiC_F3OwkHxonimzIBkPa7L4XflJtOnPoBLJQ7lLbCmxlLNywNTp-MF30-cKWa3k9WEkLcZEE',
  privateKey: 'sfgZehuVVExoyNAnj7Benvwt4H2RyaHyafL_A_FzTn0',
}
const vapid: WebPush.Vapid = { subject: 'mailto:ops@example.com', ...keys }

let endpoints = 0
/** A new endpoint origin for each call, so no test gets a token another test cached. */
const freshEndpoint = () => `https://push${++endpoints}.example.net/p/abc`

async function authorizationFor(
  options: Partial<WebPush.Vapid> & { endpoint?: string } = {},
): Promise<string | null> {
  const { endpoint = freshEndpoint(), ...rest } = options
  const request = await WebPush.toRequest({ endpoint }, undefined, { vapid: { ...vapid, ...rest } })
  return request.headers.get('authorization')
}

describe('generateVapidKeys', () => {
  test('returns a 65-byte public key and a 32-byte private key as base64url', async () => {
    for (let i = 0; i < 50; i++) {
      const { publicKey, privateKey } = await WebPush.generateVapidKeys()
      expect(publicKey).toMatch(/^[\w-]+$/)
      expect(privateKey).toMatch(/^[\w-]+$/)
      expect(fromBase64url(publicKey)).toHaveLength(65)
      expect(fromBase64url(publicKey)[0]).toBe(4)
      expect(fromBase64url(privateKey)).toHaveLength(32)
    }
  })

  test('returns a new key pair on every call', async () => {
    const a = await WebPush.generateVapidKeys()
    const b = await WebPush.generateVapidKeys()
    expect(a.publicKey).not.toBe(b.publicKey)
    expect(a.privateKey).not.toBe(b.privateKey)
  })

  test('the keys sign a token that verifies', async () => {
    const generated = await WebPush.generateVapidKeys()
    const jwt = await verifyVapid(await authorizationFor(generated))
    expect(jwt.publicKey).toBe(generated.publicKey)
  })

  test('rejects an aborted signal with its reason', async () => {
    const reason = new Error('stop')
    await expect(WebPush.generateVapidKeys({ signal: AbortSignal.abort(reason) })).rejects.toBe(
      reason,
    )
  })
})

describe('VAPID Authorization header', () => {
  test('the checker accepts the RFC 8292 §2.4 example', async () => {
    const jwt = await verifyVapid(
      'vapid t=eyJ0eXAiOiJKV1QiLCJhbGciOiJFUzI1NiJ9.eyJhdWQiOiJodHRwczovL3B1c2guZXhhbXBsZS5uZXQiLCJleHAiOjE0NTM1MjM3NjgsInN1YiI6Im1haWx0bzpwdXNoQGV4YW1wbGUuY29tIn0.i3CYb7t4xfxCDquptFOepC9GAu_HLGkMlMuCGSK2rpiUfnK9ojFwDXb1JrErtmysazNjjvW2L9OkSSHzvoD1oA, k=BA1Hxzyi1RUM1b5wjxsn7nGxAszw2u61m164i3MrAIxHF6YK5h4SDYic-dRuU_RCPCfA5aq9ojSwk5Y2EmClBPs',
    )
    expect(jwt.claims).toEqual({
      aud: 'https://push.example.net',
      exp: 1453523768,
      sub: 'mailto:push@example.com',
    })
  })

  test('carries an ES256 JWT for the endpoint origin and the public key', async () => {
    const before = Math.floor(Date.now() / 1000)
    const jwt = await verifyVapid(
      await authorizationFor({ endpoint: 'https://push.example.net/p/JzLQ3raZ?x=1' }),
    )
    expect(jwt.header).toEqual({ typ: 'JWT', alg: 'ES256' })
    expect(jwt.claims.aud).toBe('https://push.example.net')
    expect(jwt.claims.sub).toBe('mailto:ops@example.com')
    expect(jwt.publicKey).toBe(keys.publicKey)
    expect(jwt.claims.exp).toBeGreaterThan(before)
    expect(jwt.claims.exp).toBeLessThanOrEqual(before + 24 * 60 * 60 + 1)
  })

  test('keeps a non-default port in the audience', async () => {
    const jwt = await verifyVapid(
      await authorizationFor({ endpoint: 'https://example.com:4242/life-universe-and-everything' }),
    )
    expect(jwt.claims.aud).toBe('https://example.com:4242')
  })

  test('reuses a token for the same origin and keys, and signs a new one for another origin', async () => {
    const endpoint = freshEndpoint()
    const first = await authorizationFor({ endpoint })
    expect(await authorizationFor({ endpoint: `${endpoint}/other` })).toBe(first)
    expect(await authorizationFor()).not.toBe(first)
    expect(await authorizationFor({ endpoint, subject: 'https://example.com/contact' })).not.toBe(
      first,
    )
  })

  test.for([
    'mailto:example@example.com',
    'mailto:user@localhost',
    'https://example.com/contact',
    'https://localhost',
  ])('accepts the subject %s', async (subject) => {
    const jwt = await verifyVapid(await authorizationFor({ subject }))
    expect(jwt.claims.sub).toBe(subject)
  })

  test.for<[string, unknown]>([
    ['an empty subject', ''],
    ['a subject that is not a URL', 'Some Random String'],
    ['an http: subject', 'http://example.gov'],
    ['an ftp: subject', 'ftp://example.net'],
    ['a mailto: subject with a space', 'mailto: example@example.com'],
    ['an object subject', {}],
    ['a boolean subject', true],
  ])('rejects %s', async ([, subject]) => {
    await expect(authorizationFor({ subject: subject as string })).rejects.toThrow(TypeError)
  })

  const zeros = (length: number) =>
    Base64.encode(new Uint8Array(length), { alphabet: 'base64url', omitPadding: true })
  test.for<[string, Partial<WebPush.VapidKeys>]>([
    ['a 60-byte public key', { publicKey: zeros(60) }],
    ['a public key that is not base64url', { publicKey: 'This is invalid' }],
    ['an empty public key', { publicKey: '' }],
    ['an object public key', { publicKey: {} as string }],
    ['a boolean public key', { publicKey: true as never }],
    [
      'a public key in standard base64',
      { publicKey: Base64.encode(fromBase64url(keys.publicKey)) },
    ],
    ['a public key that is not a point', { publicKey: `BA${zeros(64).slice(2)}` }],
    ['a 31-byte private key', { privateKey: zeros(31) }],
    ['a private key that is not base64url', { privateKey: 'This is invalid' }],
    ['an empty private key', { privateKey: '' }],
    ['an object private key', { privateKey: {} as string }],
    [
      'a private key in standard base64',
      { privateKey: Base64.encode(fromBase64url(keys.privateKey)) },
    ],
  ])('rejects %s', async ([, override]) => {
    await expect(authorizationFor(override)).rejects.toThrow(TypeError)
  })

  test('rejects a missing vapid option', async () => {
    await expect(
      WebPush.toRequest({ endpoint: freshEndpoint() }, undefined, {} as WebPush.toRequest.Options),
    ).rejects.toThrow(TypeError)
  })

  test('send passes the header to the push service', async () => {
    const service = pushService()
    await WebPush.send({ endpoint: freshEndpoint() }, undefined, { vapid, fetch: service.fetch })
    const jwt = await verifyVapid(service.requests[0]!.headers.get('authorization'))
    expect(jwt.publicKey).toBe(keys.publicKey)
  })

  test('rejects a private key that belongs to another public key', async () => {
    const other = await WebPush.generateVapidKeys()
    await expect(authorizationFor({ privateKey: other.privateKey })).rejects.toThrow(TypeError)
  })
})
