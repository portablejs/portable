import * as Base64 from '@portable/base64'

/**
 * A webhook signature format.
 *
 * - `'standard'`: [Standard Webhooks](https://www.standardwebhooks.com), with `webhook-id`,
 *   `webhook-timestamp` and `webhook-signature` headers.
 * - `'svix'`: Standard Webhooks with `svix-` headers, falling back to `webhook-` headers.
 * - `'stripe'`: the `stripe-signature` header.
 * - `'github'`: the `x-hub-signature-256` header. The SHA-1 `x-hub-signature` header is ignored.
 * - `'slack'`: the `x-slack-signature` and `x-slack-request-timestamp` headers.
 */
export type Scheme = 'standard' | 'svix' | 'stripe' | 'github' | 'slack'

/**
 * A signing secret as the provider shows it, or the raw key bytes.
 *
 * Standard Webhooks and Svix secrets are base64, with or without the `whsec_` prefix. Stripe,
 * GitHub and Slack secrets are used as UTF-8 text, so a Stripe `whsec_` secret keeps its prefix.
 */
export type Secret = string | Uint8Array

/**
 * Computes HMAC-SHA256. `@noble/hashes` fits as `(key, data) => hmac(sha256, key, data)`.
 *
 * @example
 * ```ts
 * import { hmac } from '@noble/hashes/hmac.js'
 * import { sha256 } from '@noble/hashes/sha2.js'
 *
 * const hmacSha256: Webhooks.Hmac = (key, data) => hmac(sha256, key, data)
 * ```
 */
export type Hmac = (
  key: Uint8Array<ArrayBuffer>,
  data: Uint8Array<ArrayBuffer>,
) => Uint8Array | Promise<Uint8Array>

/**
 * Why a webhook failed verification.
 *
 * - `'missing-header'`: a header the scheme requires is absent or empty.
 * - `'malformed-header'`: a header can't be parsed, such as a timestamp that isn't an integer.
 * - `'signature'`: no signature matches the body and any of the secrets.
 * - `'timestamp'`: the signature matches, but the timestamp is further from now than `tolerance`.
 */
export type Reason = 'missing-header' | 'malformed-header' | 'signature' | 'timestamp'

/**
 * Thrown when a webhook fails verification. Respond with a 4xx status.
 *
 * @example
 * ```ts
 * import * as Webhooks from '@portable/webhooks'
 *
 * try {
 *   await Webhooks.verify(request, { scheme: 'github', secret })
 * } catch (error) {
 *   if (error instanceof Webhooks.VerificationError) return new Response(error.reason, { status: 400 })
 *   throw error
 * }
 * ```
 */
export class VerificationError extends Error {
  override name = 'Webhooks.VerificationError'
  readonly reason: Reason

  constructor(reason: Reason, message: string) {
    super(message)
    this.reason = reason
  }
}

export declare namespace verify {
  /** A `Request`, or the headers and raw body of one. */
  type Input = Request | { headers: HeadersInit; body: string | Uint8Array }

  type Options = {
    /** The provider's signature format. */
    scheme: Scheme
    /** The signing secret. Pass several while rotating secrets; any one of them may match. */
    secret: Secret | readonly Secret[]
    /** HMAC-SHA256. */
    hmac: Hmac
    /**
     * Largest allowed difference between the signed timestamp and `now`, in seconds, in either
     * direction. `Infinity` turns the check off. GitHub signs no timestamp. @default 300
     */
    tolerance?: number | undefined
    /** The time to compare the signed timestamp with. @default new Date() */
    now?: Date | undefined
  }

  type Result = {
    /** The body as text. */
    body: string
    /** The delivery id: `webhook-id`, `svix-id` or `x-github-delivery`. Use it to drop duplicates. */
    id: string | undefined
    /** The signed timestamp. GitHub signs none. */
    timestamp: Date | undefined
  }
}

/**
 * Checks a webhook's signature and timestamp, and returns its body. A `Request`'s body is read,
 * so it can't be read again.
 *
 * @example
 * ```ts
 * import { hmac } from '@noble/hashes/hmac.js'
 * import { sha256 } from '@noble/hashes/sha2.js'
 * import * as Webhooks from '@portable/webhooks/core'
 *
 * const { body } = await Webhooks.verify(request, {
 *   scheme: 'stripe',
 *   secret: env.STRIPE_WEBHOOK_SECRET,
 *   hmac: (key, data) => hmac(sha256, key, data),
 * })
 * const event = JSON.parse(body)
 * ```
 *
 * @throws {VerificationError} When a header is missing or malformed, no signature matches, or
 * the timestamp is outside `tolerance`.
 * @throws {TypeError} When a secret is empty or not valid base64, or the body isn't a string or
 * `Uint8Array`.
 */
export async function verify(input: verify.Input, options: verify.Options): Promise<verify.Result> {
  const { scheme, hmac, tolerance = 300, now = new Date() } = options
  const format = formats[scheme]
  if (!format) throw new TypeError(`Unknown scheme ${String(scheme)}`)
  if (!(tolerance >= 0)) throw new RangeError('tolerance must be a non-negative number')
  const secrets =
    typeof options.secret === 'string' || options.secret instanceof Uint8Array
      ? [options.secret]
      : options.secret
  const keys = secrets.map((secret) => format.key(secret))
  if (keys.length === 0) throw new TypeError('No secret')

  const signed = format.read(headerReader(input.headers))
  const prefix = format.prefix(signed.stamp, signed.id ?? '')

  let content: Uint8Array<ArrayBuffer>
  let text: string | undefined
  if (typeof input.body === 'string') content = utf8.encode(prefix + (text = input.body))
  else if (input instanceof Request)
    content = concat(utf8.encode(prefix), new Uint8Array(await input.arrayBuffer()))
  else if (input.body instanceof Uint8Array) content = concat(utf8.encode(prefix), input.body)
  else throw new TypeError('body must be the raw request body as a string or Uint8Array')

  let match = false
  for (const key of keys) {
    const expected = await hmac(key, content)
    for (const signature of signed.signatures) if (equal(signature, expected)) match = true
  }
  if (!match) throw new VerificationError('signature', 'No signature matches the body')

  if (signed.timestamp !== undefined) {
    const skew = Math.abs(Math.floor(now.getTime() / 1000) - signed.timestamp)
    if (skew > tolerance)
      throw new VerificationError('timestamp', `Timestamp is ${skew} s from now`)
  }

  return {
    body: text ?? utf8Decoder.decode(content.subarray(utf8.encode(prefix).length)),
    id: signed.id,
    timestamp: signed.timestamp === undefined ? undefined : new Date(signed.timestamp * 1000),
  }
}

export declare namespace sign {
  type Options = {
    /** The provider's signature format. */
    scheme: Scheme
    /** The signing secret. */
    secret: Secret
    /** HMAC-SHA256. */
    hmac: Hmac
    /** The time to sign. Ignored for GitHub. @default new Date() */
    timestamp?: Date | undefined
    /**
     * The delivery id, for Standard Webhooks, Svix and GitHub. Standard Webhooks and Svix get a
     * random `msg_` id by default.
     */
    id?: string | undefined
  }
}

/**
 * Signs a body the way the provider does and returns the headers to send with it. Use it to test
 * a webhook handler, or to send Standard Webhooks.
 *
 * @example
 * ```ts
 * import { hmac } from '@noble/hashes/hmac.js'
 * import { sha256 } from '@noble/hashes/sha2.js'
 * import * as Webhooks from '@portable/webhooks/core'
 *
 * const body = JSON.stringify({ type: 'user.created' })
 * const headers = await Webhooks.sign(body, {
 *   scheme: 'standard',
 *   secret: 'whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw',
 *   hmac: (key, data) => hmac(sha256, key, data),
 * })
 * await fetch('https://example.com/webhooks', { method: 'POST', body, headers })
 * ```
 *
 * @throws {TypeError} When the secret is empty or not valid base64.
 */
export async function sign(
  body: string | Uint8Array,
  options: sign.Options,
): Promise<Record<string, string>> {
  const { scheme, hmac, timestamp = new Date() } = options
  const format = formats[scheme]
  if (!format) throw new TypeError(`Unknown scheme ${String(scheme)}`)
  const key = format.key(options.secret)
  const seconds = Math.floor(timestamp.getTime() / 1000)
  const id = options.id ?? (format.signsId ? randomId() : undefined)
  const prefix = format.prefix(String(seconds), id ?? '')
  const bytes = typeof body === 'string' ? utf8.encode(body) : body
  const signature = await hmac(key, concat(utf8.encode(prefix), bytes))
  return format.write(signature, seconds, id)
}

type Signed = {
  stamp: string
  signatures: readonly Uint8Array[]
  id: string | undefined
  timestamp: number | undefined
}

type Format = {
  signsId: boolean
  key: (secret: Secret) => Uint8Array<ArrayBuffer>
  read: (get: HeaderReader) => Signed
  prefix: (stamp: string, id: string) => string
  write: (
    signature: Uint8Array,
    timestamp: number,
    id: string | undefined,
  ) => Record<string, string>
}

const utf8 = new TextEncoder()
const utf8Decoder = new TextDecoder()

function textKey(secret: Secret): Uint8Array<ArrayBuffer> {
  const key = typeof secret === 'string' ? utf8.encode(secret) : new Uint8Array(secret)
  if (key.length === 0) throw new TypeError('Secret is empty')
  return key
}

function base64Key(secret: Secret): Uint8Array<ArrayBuffer> {
  if (typeof secret !== 'string') return textKey(secret)
  let key: Uint8Array
  try {
    key = Base64.decode(secret.startsWith('whsec_') ? secret.slice(6) : secret)
  } catch (error) {
    throw new TypeError('Secret is not base64', { cause: error })
  }
  return textKey(key)
}

type HeaderReader = (name: string) => string | null

function headerReader(init: HeadersInit): HeaderReader {
  if (init instanceof Headers) return (name) => init.get(name)
  const entries = Array.isArray(init) ? init : Object.entries(init)
  return (name) => {
    for (const [key, value] of entries)
      if (key.length === name.length && key.toLowerCase() === name) return value
    return null
  }
}

function required(get: HeaderReader, ...names: readonly string[]): string {
  for (const name of names) {
    const value = get(name)
    if (value) return value
  }
  throw new VerificationError('missing-header', `Missing ${names[0]} header`)
}

function seconds(value: string, header: string): number {
  if (!/^\d{1,15}$/.test(value))
    throw new VerificationError('malformed-header', `${header} is not a Unix timestamp`)
  return Number(value)
}

function standard(name: 'webhook' | 'svix'): Format {
  const names = (suffix: string) =>
    name === 'svix' ? [`svix-${suffix}`, `webhook-${suffix}`] : [`webhook-${suffix}`]
  return {
    signsId: true,
    key: base64Key,
    read(get) {
      const id = required(get, ...names('id'))
      const timestamp = required(get, ...names('timestamp'))
      const header = required(get, ...names('signature'))
      const signatures: Uint8Array[] = []
      for (const entry of header.split(' ')) {
        if (!entry.startsWith('v1,')) continue
        try {
          signatures.push(Base64.decode(entry.slice(3)))
        } catch {}
      }
      return {
        stamp: timestamp,
        signatures,
        id,
        timestamp: seconds(timestamp, `${name}-timestamp`),
      }
    },
    prefix: (stamp, id) => `${id}.${stamp}.`,
    write: (signature, timestamp, id = '') => ({
      [`${name}-id`]: id,
      [`${name}-timestamp`]: String(timestamp),
      [`${name}-signature`]: `v1,${Base64.encode(signature)}`,
    }),
  }
}

const hexSignature = /^[\da-f]{64}$/i

const formats: Record<Scheme, Format> = {
  standard: standard('webhook'),
  svix: standard('svix'),
  stripe: {
    signsId: false,
    key: textKey,
    read(get) {
      const header = required(get, 'stripe-signature')
      let timestamp: string | undefined
      const signatures: Uint8Array[] = []
      for (const item of header.split(',')) {
        const at = item.indexOf('=')
        const key = item.slice(0, at).trim()
        const value = item.slice(at + 1).trim()
        if (key === 't') {
          if (timestamp !== undefined)
            throw new VerificationError('malformed-header', 'stripe-signature has two timestamps')
          timestamp = value
        } else if (key === 'v1' && hexSignature.test(value)) signatures.push(fromHex(value))
      }
      if (timestamp === undefined)
        throw new VerificationError('malformed-header', 'stripe-signature has no timestamp')
      return {
        stamp: timestamp,
        signatures,
        id: undefined,
        timestamp: seconds(timestamp, 'stripe-signature'),
      }
    },
    prefix: (stamp) => `${stamp}.`,
    write: (signature, timestamp) => ({
      'stripe-signature': `t=${timestamp},v1=${toHex(signature)}`,
    }),
  },
  github: {
    signsId: false,
    key: textKey,
    read(get) {
      const header = required(get, 'x-hub-signature-256')
      const hex = header.startsWith('sha256=') ? header.slice(7) : ''
      if (!hexSignature.test(hex))
        throw new VerificationError('malformed-header', 'x-hub-signature-256 is not sha256=<hex>')
      return {
        stamp: '',
        signatures: [fromHex(hex)],
        id: get('x-github-delivery') ?? undefined,
        timestamp: undefined,
      }
    },
    prefix: () => '',
    write: (signature, _, id) => ({
      'x-hub-signature-256': `sha256=${toHex(signature)}`,
      ...(id === undefined ? {} : { 'x-github-delivery': id }),
    }),
  },
  slack: {
    signsId: false,
    key: textKey,
    read(get) {
      const header = required(get, 'x-slack-signature')
      const timestamp = required(get, 'x-slack-request-timestamp')
      const hex = header.startsWith('v0=') ? header.slice(3) : ''
      if (!hexSignature.test(hex))
        throw new VerificationError('malformed-header', 'x-slack-signature is not v0=<hex>')
      return {
        stamp: timestamp,
        signatures: [fromHex(hex)],
        id: undefined,
        timestamp: seconds(timestamp, 'x-slack-request-timestamp'),
      }
    },
    prefix: (stamp) => `v0:${stamp}:`,
    write: (signature, timestamp) => ({
      'x-slack-request-timestamp': String(timestamp),
      'x-slack-signature': `v0=${toHex(signature)}`,
    }),
  },
}

function concat(a: Uint8Array, b: Uint8Array): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(a.length + b.length)
  out.set(a)
  out.set(b, a.length)
  return out
}

function equal(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a[i]! ^ b[i]!
  return diff === 0
}

function fromHex(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2)
  for (let i = 0; i < out.length; i++) out[i] = (nibble(hex, i * 2) << 4) | nibble(hex, i * 2 + 1)
  return out
}

function nibble(hex: string, at: number): number {
  const code = hex.charCodeAt(at) | 0x20
  return code <= 0x39 ? code - 0x30 : code - 0x57
}

function toHex(bytes: Uint8Array): string {
  let hex = ''
  for (const byte of bytes) hex += byte.toString(16).padStart(2, '0')
  return hex
}

function randomId(): string {
  return `msg_${Base64.encode(crypto.getRandomValues(new Uint8Array(18)), { alphabet: 'base64url' })}`
}
