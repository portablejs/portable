import * as Base64 from '@portable/base64'
import * as Bytes from '@portable/bytes'
import { InvalidInputError, MaxBytesError, UnsupportedError } from './errors.js'

type Digest = 'SHA-1' | 'SHA-256' | 'SHA-512'

const defaultIterations = 600_000
const defaultMaxBytes = 4096
const saltLength = 16
const hashLength = 32

const digests = new Map<string, Digest>([
  ['pbkdf2', 'SHA-1'],
  ['pbkdf2-sha256', 'SHA-256'],
  ['pbkdf2-sha512', 'SHA-512'],
])

export declare namespace hash {
  type Options = {
    /**
     * PBKDF2 iterations. Cloudflare Workers rejects more than 100,000.
     * @default 600000
     */
    iterations?: number | undefined
    /** Longest password accepted, in UTF-8 bytes after NFC normalization. @default 4096 */
    maxBytes?: number | undefined
    /**
     * Rejects the returned promise with `signal.reason` when aborted. WebCrypto can't stop a
     * derivation that has started, so the derivation finishes in the background and its result is
     * dropped.
     */
    signal?: AbortSignal | undefined
  }
}

/**
 * Hashes a password with PBKDF2-HMAC-SHA256 and a random 16-byte salt, and returns a 32-byte hash
 * in PHC string format. A string password is normalized to NFC and encoded as UTF-8, and bytes
 * are hashed as they are.
 *
 * @example
 * ```ts
 * import * as Password from '@portable/password'
 *
 * await Password.hash('correct horse battery staple')
 * // '$pbkdf2-sha256$i=600000$ZmFrZXNhbHRmYWtlc2FsdA$...'
 * await Password.hash(password, { iterations: 100_000 }) // the most Cloudflare Workers accepts
 * ```
 *
 * @throws {MaxBytesError} When the password is longer than `maxBytes`.
 */
export async function hash(
  password: string | Uint8Array,
  options: hash.Options = {},
): Promise<string> {
  const { iterations = defaultIterations, maxBytes = defaultMaxBytes, signal } = options
  checkIterations(iterations)
  const salt = crypto.getRandomValues(new Uint8Array(saltLength))
  const bytes = toBytes(password, maxBytes)
  const derived = await abortable(
    () => derive(bytes, salt, iterations, 'SHA-256', hashLength),
    signal,
  )
  const b64 = (bytes: Uint8Array) => Base64.encode(bytes, { omitPadding: true })
  return `$pbkdf2-sha256$i=${iterations}$${b64(salt)}$${b64(derived)}`
}

export declare namespace verify {
  type Options = {
    /** Longest password accepted, in UTF-8 bytes after NFC normalization. @default 4096 */
    maxBytes?: number | undefined
    /**
     * Rejects the returned promise with `signal.reason` when aborted. WebCrypto can't stop a
     * derivation that has started, so the derivation finishes in the background and its result is
     * dropped.
     */
    signal?: AbortSignal | undefined
  }
}

/**
 * Checks a password against a stored PBKDF2 hash and compares the result in constant time.
 * Reads the PHC format that `hash` writes (`$pbkdf2-sha256$i=600000$...`) and passlib's
 * `pbkdf2_sha1`, `pbkdf2_sha256` and `pbkdf2_sha512` format (`$pbkdf2-sha256$29000$...`).
 *
 * @example
 * ```ts
 * import * as Password from '@portable/password'
 *
 * const stored = await Password.hash('hunter2')
 * await Password.verify('hunter2', stored) // true
 * await Password.verify('hunter3', stored) // false
 * ```
 *
 * @throws {InvalidInputError} When `stored` is not a well-formed PBKDF2 hash.
 * @throws {UnsupportedError} When `stored` is another algorithm's hash, such as `$argon2id$...`.
 * @throws {MaxBytesError} When the password is longer than `maxBytes`.
 */
export async function verify(
  password: string | Uint8Array,
  stored: string,
  options: verify.Options = {},
): Promise<boolean> {
  const { maxBytes = defaultMaxBytes, signal } = options
  const parsed = parse(stored)
  const bytes = toBytes(password, maxBytes)
  const { salt, iterations, digest } = parsed
  const derived = await abortable(
    () => derive(bytes, salt, iterations, digest, parsed.hash.length),
    signal,
  )
  return Bytes.timingSafeEqual(derived, parsed.hash)
}

export declare namespace needsRehash {
  type Options = {
    /** Iterations a current hash has at least. @default 600000 */
    iterations?: number | undefined
  }
}

/**
 * Returns `true` when a stored hash is weaker than what `hash` writes with the same `iterations`:
 * fewer iterations, a digest other than SHA-256, a salt shorter than 16 bytes, or a hash shorter
 * than 32 bytes. Call it after a successful `verify` and store a new `hash` of the password when
 * it returns `true`.
 *
 * @example
 * ```ts
 * import * as Password from '@portable/password'
 *
 * if (await Password.verify(password, user.hash)) {
 *   if (Password.needsRehash(user.hash)) await saveHash(user, await Password.hash(password))
 * }
 * ```
 *
 * @throws {InvalidInputError} When `stored` is not a well-formed PBKDF2 hash.
 * @throws {UnsupportedError} When `stored` is another algorithm's hash.
 */
export function needsRehash(stored: string, options: needsRehash.Options = {}): boolean {
  const { iterations = defaultIterations } = options
  checkIterations(iterations)
  const parsed = parse(stored)
  return (
    parsed.digest !== 'SHA-256' ||
    parsed.iterations < iterations ||
    parsed.salt.length < saltLength ||
    parsed.hash.length < hashLength
  )
}

type Parsed = {
  digest: Digest
  iterations: number
  salt: Uint8Array<ArrayBuffer>
  hash: Uint8Array
}

const otherAlgorithm = /^\$[a-z0-9-]{1,32}\$/
const passlibRounds = /^[1-9]\d{0,9}$/
const phcParams = /^i=([1-9]\d{0,9})(?:,l=([1-9]\d{0,9}))?$/
const salt64 = /^[A-Za-z0-9+/.]*$/
const hash64 = /^[A-Za-z0-9+/.]+$/

function parse(stored: string): Parsed {
  const fields = stored.split('$')
  const digest = digests.get(fields[1] ?? '')
  if (!digest) {
    if (otherAlgorithm.test(stored))
      throw new UnsupportedError(
        `Not a PBKDF2 hash: ${stored.slice(0, stored.indexOf('$', 1) + 1)}`,
      )
    throw new InvalidInputError(
      'Expected a hash in the form $pbkdf2-sha256$i=<iterations>$<salt>$<hash>.',
    )
  }
  const [empty, , params = '', salt = '', checksum = ''] = fields
  if (fields.length !== 5 || empty !== '')
    throw new InvalidInputError('Expected 4 fields separated by "$".')

  const phc = phcParams.exec(params)
  const rounds = phc ? phc[1]! : passlibRounds.test(params) ? params : undefined
  if (rounds === undefined || Number(rounds) > 0xffffffff)
    throw new InvalidInputError(`Invalid iterations "${params}".`)
  if (!salt64.test(salt) || !hash64.test(checksum))
    throw new InvalidInputError('Salt and hash must be unpadded base64.')

  const parsed = {
    digest,
    iterations: Number(rounds),
    salt: new Uint8Array(decode(salt)),
    hash: decode(checksum),
  }
  if (phc?.[2] !== undefined && Number(phc[2]) !== parsed.hash.length)
    throw new InvalidInputError(`Hash is ${parsed.hash.length} bytes, but l=${phc[2]}.`)
  return parsed
}

function decode(text: string): Uint8Array {
  try {
    return Base64.decode(text.replaceAll('.', '+'))
  } catch (error) {
    throw new InvalidInputError(`Invalid base64 "${text}".`, { cause: error })
  }
}

const encoder = new TextEncoder()

function toBytes(password: string | Uint8Array, maxBytes: number): Uint8Array<ArrayBuffer> {
  if (!(maxBytes >= 0))
    throw new RangeError(`maxBytes must be a non-negative number, got ${maxBytes}.`)
  const bytes =
    typeof password === 'string'
      ? encoder.encode(password.normalize('NFC'))
      : new Uint8Array(password)
  if (bytes.length > maxBytes) throw new MaxBytesError({ maxBytes })
  return bytes
}

function checkIterations(iterations: number): void {
  if (!Number.isInteger(iterations) || iterations < 1 || iterations > 0xffffffff)
    throw new RangeError(`iterations must be an integer from 1 to 2^32 - 1, got ${iterations}.`)
}

async function derive(
  password: Uint8Array<ArrayBuffer>,
  salt: Uint8Array<ArrayBuffer>,
  iterations: number,
  digest: Digest,
  length: number,
): Promise<Uint8Array> {
  // WebKit's PBKDF2 rejects an empty password or salt. HMAC pads its key with zero bytes, so an
  // empty password derives the same bits as a single zero byte.
  if (password.length === 0) password = new Uint8Array(1)
  if (salt.length === 0) return deriveWithHmac(password, iterations, digest, length)
  const key = await crypto.subtle.importKey('raw', password, 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: digest, salt, iterations },
    key,
    length * 8,
  )
  return new Uint8Array(bits)
}

/** PBKDF2 from RFC 8018 with an empty salt, computed with one HMAC call per iteration. */
async function deriveWithHmac(
  password: Uint8Array<ArrayBuffer>,
  iterations: number,
  digest: Digest,
  length: number,
): Promise<Uint8Array> {
  const hmac = { name: 'HMAC', hash: digest }
  const key = await crypto.subtle.importKey('raw', password, hmac, false, ['sign'])
  const out = new Uint8Array(length)
  for (let block = 1, offset = 0; offset < length; block++) {
    let u = new Uint8Array(
      await crypto.subtle.sign(
        hmac,
        key,
        new Uint8Array([block >>> 24, block >>> 16, block >>> 8, block]),
      ),
    )
    const t = u.slice()
    for (let i = 1; i < iterations; i++) {
      u = new Uint8Array(await crypto.subtle.sign(hmac, key, u))
      for (let j = 0; j < t.length; j++) t[j]! ^= u[j]!
    }
    out.set(t.subarray(0, length - offset), offset)
    offset += t.length
  }
  return out
}

function abortable<T>(start: () => Promise<T>, signal: AbortSignal | undefined): Promise<T> {
  if (!signal) return start()
  signal.throwIfAborted()
  return new Promise((resolve, reject) => {
    const onAbort = () => reject(signal.reason)
    signal.addEventListener('abort', onAbort, { once: true })
    start()
      .then(resolve, reject)
      .finally(() => signal.removeEventListener('abort', onAbort))
  })
}
