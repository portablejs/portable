import * as Base64 from '@portable/base64'

const subtle = crypto.subtle
const utf8 = new TextEncoder()
const ecdh = { name: 'ECDH', namedCurve: 'P-256' }

export const base64url = (bytes: Uint8Array): string =>
  Base64.encode(bytes, { alphabet: 'base64url', omitPadding: true })

export const fromBase64url = (text: string): Uint8Array<ArrayBuffer> =>
  new Uint8Array(Base64.decode(text.replace(/\s/g, ''), { alphabet: 'base64url' }))

/** A browser's side of a push subscription: the key pair and auth secret it keeps. */
export type UserAgent = {
  keyPair: CryptoKeyPair
  publicKey: Uint8Array<ArrayBuffer>
  auth: Uint8Array<ArrayBuffer>
  subscription: { endpoint: string; keys: { p256dh: string; auth: string } }
}

export async function userAgent(
  endpoint = 'https://push.example.net/push/JzLQ3raZJfFBR0aqvOMsLrt54w4rJUsV',
): Promise<UserAgent> {
  const keyPair = await subtle.generateKey(ecdh, true, ['deriveBits'])
  const publicKey = new Uint8Array(await subtle.exportKey('raw', keyPair.publicKey))
  const auth = crypto.getRandomValues(new Uint8Array(16))
  return {
    keyPair,
    publicKey,
    auth,
    subscription: { endpoint, keys: { p256dh: base64url(publicKey), auth: base64url(auth) } },
  }
}

/** Imports a raw P-256 private key and its public key as an ECDH key pair. */
export async function importEcdhKeyPair(
  privateKey: Uint8Array,
  publicKey: Uint8Array,
): Promise<CryptoKeyPair> {
  const jwk = {
    kty: 'EC',
    crv: 'P-256',
    x: base64url(publicKey.subarray(1, 33)),
    y: base64url(publicKey.subarray(33)),
  }
  return {
    privateKey: await subtle.importKey('jwk', { ...jwk, d: base64url(privateKey) }, ecdh, true, [
      'deriveBits',
    ]),
    publicKey: await subtle.importKey('jwk', jwk, ecdh, true, []),
  }
}

/** Decrypts an aes128gcm push message body as a browser does (RFC 8291 §3.4, RFC 8188 §2). */
export async function decrypt(body: Uint8Array, agent: UserAgent): Promise<Uint8Array> {
  const view = new DataView(body.buffer, body.byteOffset, body.byteLength)
  const salt = body.slice(0, 16)
  const recordSize = view.getUint32(16)
  const idLength = body[20]!
  const serverPublic = body.slice(21, 21 + idLength)
  const records = body.subarray(21 + idLength)
  if (records.length > recordSize) {
    throw new Error('More than one record')
  }

  const serverKey = await subtle.importKey('raw', serverPublic, ecdh, false, [])
  const secret = await subtle.deriveBits(
    { name: 'ECDH', public: serverKey },
    agent.keyPair.privateKey,
    256,
  )
  const keyInfo = concat(utf8.encode('WebPush: info\0'), agent.publicKey, serverPublic)
  const ikm = await hkdf(secret, agent.auth, keyInfo, 256)
  const cek = await hkdf(ikm, salt, utf8.encode('Content-Encoding: aes128gcm\0'), 128)
  const nonce = await hkdf(ikm, salt, utf8.encode('Content-Encoding: nonce\0'), 96)
  const key = await subtle.importKey('raw', cek, 'AES-GCM', false, ['decrypt'])
  const padded = new Uint8Array(
    await subtle.decrypt({ name: 'AES-GCM', iv: nonce }, key, records.slice()),
  )
  const end = padded.findLastIndex((byte) => byte !== 0)
  if (padded[end] !== 2) {
    throw new Error('Missing padding delimiter')
  }
  return padded.subarray(0, end)
}

async function hkdf(
  ikm: ArrayBuffer,
  salt: Uint8Array<ArrayBuffer>,
  info: Uint8Array<ArrayBuffer>,
  bits: number,
): Promise<ArrayBuffer> {
  const key = await subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits'])
  return subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, key, bits)
}

function concat(...parts: Uint8Array[]): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(parts.reduce((length, part) => length + part.length, 0))
  let offset = 0
  for (const part of parts) {
    out.set(part, offset)
    offset += part.length
  }
  return out
}

export type Jwt = {
  header: Record<string, unknown>
  claims: { aud: string; exp: number; sub: string }
  publicKey: string
}

/**
 * Reads a `vapid t=…, k=…` Authorization header and checks the JWT's ES256 signature against `k`,
 * as a push service does (RFC 8292 §3).
 */
export async function verifyVapid(authorization: string | null): Promise<Jwt> {
  const match = /^vapid t=([\w-]+)\.([\w-]+)\.([\w-]+), k=([\w-]+)$/.exec(authorization ?? '')
  if (!match) {
    throw new Error(`Not a vapid Authorization header: ${authorization}`)
  }
  const [, header, claims, signature, k] = match as unknown as [
    string,
    string,
    string,
    string,
    string,
  ]
  const key = await subtle.importKey(
    'raw',
    fromBase64url(k),
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['verify'],
  )
  const valid = await subtle.verify(
    { name: 'ECDSA', hash: 'SHA-256' },
    key,
    fromBase64url(signature),
    utf8.encode(`${header}.${claims}`),
  )
  if (!valid) {
    throw new Error('Bad JWT signature')
  }
  const json = (part: string) => JSON.parse(new TextDecoder().decode(fromBase64url(part)))
  return { header: json(header), claims: json(claims), publicKey: k }
}

/** A `fetch` that records each request and answers with `status`. */
export function pushService(status = 201, body = '') {
  const requests: Request[] = []
  const fetch = async (request: Request): Promise<Response> => {
    requests.push(request)
    return new Response(status === 204 ? null : body, { status })
  }
  return { requests, fetch }
}
