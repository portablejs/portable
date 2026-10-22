import * as Base64 from '@portable/base64'

/** A VAPID key pair as base64url strings, in the format the web-push package uses. */
export type VapidKeys = {
  /** The uncompressed P-256 public key (65 bytes). Browsers take it as `applicationServerKey`. */
  publicKey: string
  /** The P-256 private key (32 bytes). Keep it secret. */
  privateKey: string
}

/** How the application server identifies itself to push services (RFC 8292). */
export type Vapid = VapidKeys & {
  /**
   * A `mailto:` or `https:` URL the push service can use to contact you. Apple rejects an
   * `https://localhost` subject.
   */
  subject: string
}

export declare namespace generateVapidKeys {
  type Options = {
    /** Cancels the key generation. It rejects with `signal.reason`. */
    signal?: AbortSignal | undefined
  }
}

/**
 * Generates a VAPID key pair. Generate it once, store the private key as a secret, and give the
 * public key to browsers as `applicationServerKey` when they subscribe.
 *
 * @example
 * ```ts
 * import * as WebPush from '@portable/web-push'
 *
 * const { publicKey, privateKey } = await WebPush.generateVapidKeys()
 * ```
 */
export async function generateVapidKeys(
  options: generateVapidKeys.Options = {},
): Promise<VapidKeys> {
  const { signal } = options
  signal?.throwIfAborted()
  const pair = await crypto.subtle.generateKey(ecdsa, true, ['sign'])
  const [publicKey, jwk] = await Promise.all([
    crypto.subtle.exportKey('raw', pair.publicKey),
    crypto.subtle.exportKey('jwk', pair.privateKey),
  ])
  signal?.throwIfAborted()
  return { publicKey: base64url(new Uint8Array(publicKey)), privateKey: jwk.d! }
}

/**
 * Returns the `Authorization` header value for a push to `audience`, the endpoint's origin. A
 * token is reused for an hour, because Apple rejects a sender that signs new tokens more often.
 */
export function authorization(audience: string, vapid: Vapid, date: Date): Promise<string> {
  if (!vapid) throw new TypeError('vapid is required')
  const { subject, publicKey, privateKey } = vapid
  checkSubject(subject)
  const now = Math.floor(date.getTime() / 1000)
  if (!Number.isFinite(now)) throw new RangeError('`now` must be a valid Date.')
  const id = `${audience} ${subject} ${publicKey} ${privateKey}`
  const cached = tokens.get(id)
  if (cached && now >= cached.issued && now - cached.issued < 60 * 60) return cached.header
  const header = sign(audience, vapid, now + 12 * 60 * 60)
  header.catch(() => tokens.delete(id))
  tokens.delete(id)
  if (tokens.size >= 64) tokens.delete(tokens.keys().next().value!)
  tokens.set(id, { issued: now, header })
  return header
}

async function sign(audience: string, vapid: Vapid, exp: number): Promise<string> {
  const key = await signingKey(vapid)
  const claims = { aud: audience, exp, sub: vapid.subject }
  const input = `${jwtHeader}.${base64url(utf8.encode(JSON.stringify(claims)))}`
  const signature = await crypto.subtle.sign(ecdsaSha256, key, utf8.encode(input))
  return `vapid t=${input}.${base64url(new Uint8Array(signature))}, k=${vapid.publicKey}`
}

function checkSubject(subject: unknown): asserts subject is string {
  if (typeof subject !== 'string') throw new TypeError('vapid.subject must be a string')
  if (/\s/.test(subject)) throw new RangeError('vapid.subject must not contain spaces')
  const url = URL.parse(subject)
  if (url?.protocol !== 'mailto:' && url?.protocol !== 'https:')
    throw new RangeError(`vapid.subject must be a mailto: or https: URL, not ${subject}`)
}

function signingKey(vapid: Vapid): Promise<CryptoKey> {
  const { publicKey, privateKey } = vapid
  const id = `${publicKey} ${privateKey}`
  let key = keys.get(id)
  if (key) return key
  key = importSigningKey(publicKey, privateKey)
  key.catch(() => keys.delete(id))
  if (keys.size >= 16) keys.delete(keys.keys().next().value!)
  keys.set(id, key)
  return key
}

async function importSigningKey(publicKey: unknown, privateKey: unknown): Promise<CryptoKey> {
  const point = readVapidKey(publicKey, 'publicKey', 65)
  if (point[0] !== 4) throw new RangeError('vapid.publicKey must be an uncompressed P-256 key')
  const d = readVapidKey(privateKey, 'privateKey', 32)
  const jwk = {
    kty: 'EC',
    crv: 'P-256',
    x: base64url(point.subarray(1, 33)),
    y: base64url(point.subarray(33)),
    d: base64url(d),
  }
  let key: CryptoKey
  let matches: boolean
  try {
    key = await crypto.subtle.importKey('jwk', jwk, ecdsa, false, ['sign'])
    // Firefox imports a JWK whose `d` doesn't belong to its `x` and `y`, so a test signature
    // checks that the keys are a pair.
    const verifier = await crypto.subtle.importKey('raw', new Uint8Array(point), ecdsa, false, [
      'verify',
    ])
    const signature = await crypto.subtle.sign(ecdsaSha256, key, new Uint8Array())
    matches = await crypto.subtle.verify(ecdsaSha256, verifier, signature, new Uint8Array())
  } catch (cause) {
    throw new RangeError('vapid.publicKey and vapid.privateKey are not a P-256 key pair', { cause })
  }
  if (!matches)
    throw new RangeError('vapid.publicKey and vapid.privateKey are not a P-256 key pair')
  return key
}

function readVapidKey(key: unknown, name: string, length: number): Uint8Array {
  if (typeof key !== 'string') throw new TypeError(`vapid.${name} must be a string`)
  if (!/^[\w-]+$/.test(key)) throw new RangeError(`vapid.${name} must be base64url without padding`)
  const bytes = Base64.decode(key, { alphabet: 'base64url' })
  if (bytes.length !== length) throw new RangeError(`vapid.${name} must be ${length} bytes`)
  return bytes
}

const base64url = (bytes: Uint8Array): string =>
  Base64.encode(bytes, { alphabet: 'base64url', omitPadding: true })

const utf8 = new TextEncoder()
const ecdsa = { name: 'ECDSA', namedCurve: 'P-256' }
const ecdsaSha256 = { name: 'ECDSA', hash: 'SHA-256' }
const jwtHeader = base64url(utf8.encode('{"typ":"JWT","alg":"ES256"}'))
const keys = new Map<string, Promise<CryptoKey>>()
const tokens = new Map<string, { issued: number; header: Promise<string> }>()
