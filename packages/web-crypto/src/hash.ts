import type * as Bytes from '@portable/bytes'
import { run, toBufferSource } from './internal.js'

/** A hash algorithm, named as WebCrypto names it. */
export type Hash = 'SHA-1' | 'SHA-256' | 'SHA-384' | 'SHA-512'

/**
 * A function that hashes `data` with the algorithm `hash` and returns the digest or a promise of
 * it. Packages that hash take one as their `digest` option, and `WebCrypto.digest` is one.
 */
export type Digest = (hash: Hash, data: Uint8Array<ArrayBuffer>) => Uint8Array | Promise<Uint8Array>

/**
 * Computes an HMAC of `data` with `key` and `hash`, sync or async. Packages that sign with HMAC
 * take one as their `hmac` option. `WebCrypto.hmac` fits this type, and so does a wrapper around
 * `@noble/hashes`, which is sync and faster on Node.
 */
export type Hmac = (
  hash: Hash,
  key: Uint8Array<ArrayBuffer>,
  data: Uint8Array<ArrayBuffer>,
) => Uint8Array | Promise<Uint8Array>

/**
 * An incremental hash with the same methods as `sha256.create()` from `@noble/hashes`.
 * `crypto.subtle.digest` needs the whole input at once, so a package that hashes a stream takes a
 * `hasher` option, a function that returns one of these.
 */
export type Hasher = {
  update(data: Uint8Array): unknown
  digest(): Uint8Array | Promise<Uint8Array>
}

export declare namespace digest {
  type Options = {
    /** Rejects with `signal.reason` once aborted. */
    signal?: AbortSignal | undefined
  }
}

/**
 * Hashes bytes, or the UTF-8 bytes of a string, with `crypto.subtle.digest`.
 *
 * @example
 * ```ts
 * import * as WebCrypto from '@portable/web-crypto'
 *
 * const hash = await WebCrypto.digest('SHA-256', 'hello')
 * ```
 */
export function digest(
  hash: Hash,
  data: string | Bytes.Input,
  options: digest.Options = {},
): Promise<Uint8Array<ArrayBuffer>> {
  return run(
    options.signal,
    async () => new Uint8Array(await crypto.subtle.digest(hash, toBufferSource(data))),
  )
}

export declare namespace hmac {
  type Options = {
    /** Rejects with `signal.reason` once aborted. */
    signal?: AbortSignal | undefined
  }
}

/**
 * Computes an HMAC (RFC 2104) of `data` with `key`. Strings are read as UTF-8.
 *
 * @example
 * ```ts
 * import * as WebCrypto from '@portable/web-crypto'
 *
 * const signature = await WebCrypto.hmac('SHA-256', 'whsec_secret', '{"id":1}')
 * ```
 */
export function hmac(
  hash: Hash,
  key: string | Bytes.Input,
  data: string | Bytes.Input,
  options: hmac.Options = {},
): Promise<Uint8Array<ArrayBuffer>> {
  return run(options.signal, async () => {
    const raw = toBufferSource(key)
    // WebCrypto refuses empty HMAC keys. HMAC pads the key with zero bytes to the block size, so a
    // single zero byte gives the same result.
    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      raw.length === 0 ? new Uint8Array(1) : raw,
      { name: 'HMAC', hash },
      false,
      ['sign'],
    )
    return new Uint8Array(await crypto.subtle.sign('HMAC', cryptoKey, toBufferSource(data)))
  })
}

const hashLengths: Record<Hash, number> = {
  'SHA-1': 20,
  'SHA-256': 32,
  'SHA-384': 48,
  'SHA-512': 64,
}

export declare namespace hkdf {
  type Options = {
    /** Context for the derived key. @default empty */
    info?: string | Bytes.Input | undefined
    /** Bytes to derive, at most 255 times the hash length. @default the hash length */
    length?: number | undefined
    /** @default empty, which RFC 5869 treats as a string of zero bytes as long as the hash */
    salt?: string | Bytes.Input | undefined
    /** Rejects with `signal.reason` once aborted. */
    signal?: AbortSignal | undefined
  }
}

/**
 * Derives `length` bytes from `key` with HKDF (RFC 5869), extract and expand in one call.
 *
 * @example
 * ```ts
 * import * as WebCrypto from '@portable/web-crypto'
 *
 * const key = await WebCrypto.hkdf('SHA-256', sharedSecret, { info: 'my app v1', length: 32 })
 * ```
 */
export function hkdf(
  hash: Hash,
  key: string | Bytes.Input,
  options: hkdf.Options = {},
): Promise<Uint8Array<ArrayBuffer>> {
  const { info = '', length = hashLengths[hash], salt = '', signal } = options
  return run(signal, async () => {
    const cryptoKey = await crypto.subtle.importKey('raw', toBufferSource(key), 'HKDF', false, [
      'deriveBits',
    ])
    const bits = await crypto.subtle.deriveBits(
      { name: 'HKDF', hash, info: toBufferSource(info), salt: toBufferSource(salt) },
      cryptoKey,
      length * 8,
    )
    return new Uint8Array(bits)
  })
}
