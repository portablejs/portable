import * as Bytes from '@portable/bytes'
import type { Hmac } from '@portable/web-crypto'
import { VerificationError } from './errors.js'
import { utf8 } from './internal.js'
import { race, readBody } from './race.js'
import { type Scheme, standard } from './schemes.js'

/**
 * A signing secret as the sender shows it, or the raw key bytes. The scheme's `key` reads a
 * string as base64 for Standard Webhooks and as UTF-8 text for the others.
 */
export type Secret = string | Uint8Array

export declare namespace verify {
  /** A `Request`, or the headers and raw body of one. */
  type Input = Request | { headers: HeadersInit; body: string | Uint8Array }

  type Options = {
    /** How the sender signs. @default Webhooks.standard */
    scheme?: Scheme | undefined
    /** The signing secret. Pass several while rotating secrets. Any one of them may match. */
    secret: Secret | readonly Secret[]
    /**
     * Computes the HMAC, called with `'SHA-256'`. `@noble/hashes` is sync and about 7 times faster
     * on Node. @default `crypto.subtle` HMAC
     */
    hmac?: Hmac | undefined
    /**
     * Largest allowed difference between the signed timestamp and `now`, in milliseconds, in
     * either direction. Timestamps are whole seconds, so the difference is too. `Infinity` turns
     * the check off. The check is skipped when the scheme reads no timestamp.
     * @default 300000 (five minutes)
     */
    tolerance?: number | undefined
    /** The time to compare the signed timestamp with. @default new Date() */
    now?: Date | undefined
    /**
     * The longest body `verify` reads from a `Request`, in bytes. A longer body throws
     * `MaxBytesError`. @default Infinity
     */
    maxBytes?: number | undefined
    /** Rejects with `signal.reason` when aborted. */
    signal?: AbortSignal | undefined
  }

  type ReturnType = {
    /** The body as text. */
    body: string
    /** The delivery id, such as `webhook-id` or `x-github-delivery`. Use it to drop duplicates. */
    id: string | undefined
    /** The signed timestamp, if the scheme has one. */
    timestamp: Date | undefined
  }
}

/**
 * Checks a webhook's signature and timestamp, and returns its body. A `Request`'s body is read,
 * so it can't be read again.
 *
 * @example
 * ```ts
 * import * as Webhooks from '@portable/webhooks'
 *
 * export default {
 *   async fetch(request: Request, env: { STRIPE_WEBHOOK_SECRET: string }) {
 *     const { body } = await Webhooks.verify(request, {
 *       scheme: Webhooks.stripe,
 *       secret: env.STRIPE_WEBHOOK_SECRET,
 *     })
 *     const event = JSON.parse(body)
 *     return new Response(null, { status: 204 })
 *   },
 * }
 * ```
 *
 * @throws {VerificationError} When a header is missing or malformed, no signature matches, or
 * the timestamp is outside `tolerance`.
 * @throws {RangeError} When a secret is empty or not valid base64.
 * @throws {TypeError} When the scheme isn't a scheme object, or the body isn't a string or
 * `Uint8Array`.
 */
export async function verify(
  input: verify.Input,
  options: verify.Options,
): Promise<verify.ReturnType> {
  const {
    scheme = standard,
    hmac = hmacSha256,
    tolerance = 300_000,
    now = new Date(),
    maxBytes = Infinity,
    signal,
  } = options
  signal?.throwIfAborted()
  checkScheme(scheme)
  if (!(tolerance >= 0)) throw new RangeError('tolerance must be a non-negative number')
  if (!(maxBytes >= 0)) throw new RangeError('maxBytes must be a non-negative number')
  const secrets =
    typeof options.secret === 'string' || options.secret instanceof Uint8Array
      ? [options.secret]
      : options.secret
  const keys = secrets.map((secret) => keyOf(scheme, secret))
  if (keys.length === 0) throw new RangeError('No secret')

  const signed = scheme.parse(
    input.headers instanceof Headers ? input.headers : new Headers(input.headers),
  )
  const { id, timestamp } = signed
  if (timestamp !== undefined && Number.isNaN(timestamp.getTime()))
    throw new VerificationError({
      code: 'malformed-header',
      message: 'Timestamp is not a valid time',
    })

  let body: Uint8Array
  let text: string | undefined
  if (typeof input.body === 'string') body = utf8.encode((text = input.body))
  else if (input instanceof Request) body = await readBody(input, maxBytes, signal)
  else if (input.body instanceof Uint8Array) body = input.body
  else throw new TypeError('body must be the raw request body as a string or Uint8Array')

  const content = bytes(scheme.payload({ id, timestamp, body }))
  let match = false
  for (const key of keys) {
    const expected = await race(hmac('SHA-256', key, content), signal)
    for (const signature of signed.signatures)
      if (Bytes.timingSafeEqual(signature, expected)) match = true
  }
  if (!match)
    throw new VerificationError({ code: 'signature', message: 'No signature matches the body' })

  if (timestamp !== undefined) {
    const skew = Math.abs(Math.floor(now.getTime() / 1000) - Math.floor(timestamp.getTime() / 1000))
    if (skew * 1000 > tolerance)
      throw new VerificationError({
        code: 'timestamp',
        message: `Timestamp is ${skew} s from now`,
      })
  }

  return { body: text ?? utf8Decoder.decode(body), id, timestamp }
}

export declare namespace sign {
  type Options = {
    /** How the sender signs. @default Webhooks.standard */
    scheme?: Scheme | undefined
    /** The signing secret. */
    secret: Secret
    /**
     * Computes the HMAC, called with `'SHA-256'`. `@noble/hashes` is sync and about 7 times faster
     * on Node. @default `crypto.subtle` HMAC
     */
    hmac?: Hmac | undefined
    /** The time to sign. Schemes without a timestamp ignore it. @default new Date() */
    now?: Date | undefined
    /** The delivery id. Schemes without an id ignore it. @default crypto.randomUUID() */
    id?: string | undefined
    /** Rejects with `signal.reason` when aborted. */
    signal?: AbortSignal | undefined
  }
}

/**
 * Signs a body the way the sender does and returns the headers to send with it. Use it to test
 * a webhook handler, or to send Standard Webhooks.
 *
 * @example
 * ```ts
 * import * as Webhooks from '@portable/webhooks'
 *
 * const body = JSON.stringify({ type: 'user.created' })
 * const headers = await Webhooks.sign(body, { secret: 'whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw' })
 * await fetch('https://example.com/webhooks', { method: 'POST', body, headers })
 * ```
 *
 * @throws {RangeError} When the secret is empty or not valid base64.
 * @throws {TypeError} When the scheme isn't a scheme object.
 */
export async function sign(
  body: string | Uint8Array,
  options: sign.Options,
): Promise<Record<string, string>> {
  const {
    scheme = standard,
    hmac = hmacSha256,
    now: timestamp = new Date(),
    id = crypto.randomUUID(),
    signal,
  } = options
  signal?.throwIfAborted()
  checkScheme(scheme)
  const key = keyOf(scheme, options.secret)
  const bytesOfBody = typeof body === 'string' ? utf8.encode(body) : body
  const content = bytes(scheme.payload({ id, timestamp, body: bytesOfBody }))
  const signature = await race(hmac('SHA-256', key, content), signal)
  return scheme.headers({ signature, id, timestamp })
}

function checkScheme(scheme: Scheme): void {
  if (typeof scheme?.parse !== 'function' || typeof scheme.payload !== 'function')
    throw new TypeError('scheme must be a Webhooks.Scheme, such as Webhooks.stripe')
}

function keyOf(scheme: Scheme, secret: Secret): Uint8Array<ArrayBuffer> {
  const key =
    typeof secret !== 'string' ? secret : scheme.key ? scheme.key(secret) : utf8.encode(secret)
  if (key.length === 0) throw new RangeError('Secret is empty')
  return new Uint8Array(key)
}

function bytes(content: Uint8Array | string): Uint8Array<ArrayBuffer> {
  if (typeof content === 'string') return utf8.encode(content)
  return content.buffer instanceof ArrayBuffer
    ? (content as Uint8Array<ArrayBuffer>)
    : new Uint8Array(content)
}

async function hmacSha256(
  _hash: 'SHA-256',
  key: Uint8Array<ArrayBuffer>,
  data: Uint8Array<ArrayBuffer>,
): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.sign('HMAC', await importKey(key), data))
}

// importKey takes two thirds of the time of an HMAC on Node, and a server verifies every webhook
// with the same one or two secrets.
const cryptoKeys = new Map<string, Promise<CryptoKey>>()

function importKey(key: Uint8Array<ArrayBuffer>): Promise<CryptoKey> {
  const id = key.length <= 256 ? String.fromCharCode(...key) : undefined
  const cached = id === undefined ? undefined : cryptoKeys.get(id)
  if (cached) return cached
  const cryptoKey = crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, [
    'sign',
  ])
  if (id !== undefined) {
    if (cryptoKeys.size >= 16) cryptoKeys.clear()
    cryptoKeys.set(id, cryptoKey)
  }
  return cryptoKey
}

const utf8Decoder = new TextDecoder()
