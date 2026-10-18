import { sha1 } from '@noble/hashes/legacy.js'
import { sha256 } from '@noble/hashes/sha2.js'
import * as Core from './core.js'

export type { Credentials, Digest, HashAlgorithm, SignatureMethod, Token } from './core.js'
export { InvalidInputError, UnsupportedError } from './errors.js'

const digest: Core.Digest = (algorithm, data) => (algorithm === 'SHA-1' ? sha1(data) : sha256(data))

type WithDefaultDigest<options> = options extends unknown
  ? Omit<options, 'digest'> & {
      /** Hashes for HMAC and `oauth_body_hash`. @default `@noble/hashes` SHA-1 and SHA-256 */
      digest?: Core.Digest | undefined
    }
  : never

export declare namespace authorization {
  type Options = WithDefaultDigest<Core.authorization.Options>
}

export declare namespace sign {
  type Options = WithDefaultDigest<Core.sign.Options>
}

/**
 * Signs a request and returns the value for its `Authorization` header. The request is not
 * changed: a form body is read from a clone. Use it with HTTP clients that don't take a `Request`.
 *
 * @example
 * ```ts
 * import * as OAuth1 from '@portable/oauth1'
 *
 * const header = await OAuth1.authorization(new Request('https://api.example.com/items'), {
 *   consumer: { key: 'dpf43f3p2l4k3l03', secret: 'kd94hf93k423kf44' },
 *   token: { key: 'nnch734d00sl2jdk', secret: 'pfkkdhi9sl3r4s00' },
 * })
 * // 'OAuth oauth_consumer_key="dpf43f3p2l4k3l03", oauth_nonce="…", oauth_signature="…", …'
 * ```
 *
 * @throws {UnsupportedError} For an unknown `signatureMethod`.
 * @throws {InvalidInputError} For an RSA private key that can't be used.
 */
export function authorization(request: Request, options: authorization.Options): Promise<string> {
  return Core.authorization(request, {
    ...options,
    digest: options.digest ?? digest,
  } as Core.authorization.Options)
}

/**
 * Signs a request and returns a new `Request` that carries the signature in its `Authorization`
 * header, or in its URL with `placement: 'query'`. Like `new Request(request)`, it uses up the
 * body of the original request.
 *
 * @example
 * ```ts
 * import * as OAuth1 from '@portable/oauth1'
 *
 * const request = new Request('https://api.example.com/statuses', {
 *   method: 'POST',
 *   body: new URLSearchParams({ status: 'Hello' }),
 * })
 * const response = await fetch(
 *   await OAuth1.sign(request, {
 *     consumer: { key: 'dpf43f3p2l4k3l03', secret: 'kd94hf93k423kf44' },
 *     token: { key: 'nnch734d00sl2jdk', secret: 'pfkkdhi9sl3r4s00' },
 *   }),
 * )
 * ```
 *
 * @throws {UnsupportedError} For an unknown `signatureMethod`.
 * @throws {InvalidInputError} For an RSA private key that can't be used.
 */
export function sign(request: Request, options: sign.Options): Promise<Request> {
  return Core.sign(request, { ...options, digest: options.digest ?? digest } as Core.sign.Options)
}
