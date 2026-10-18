/**
 * Thrown when the RSA private key can't be used: a PEM string that isn't an unencrypted
 * `PRIVATE KEY` or `RSA PRIVATE KEY` block, or a `CryptoKey` that isn't an RSASSA-PKCS1-v1_5
 * key with SHA-1.
 *
 * @example
 * ```ts
 * import * as OAuth1 from '@portable/oauth1'
 *
 * try {
 *   await OAuth1.authorization(request, {
 *     signatureMethod: 'RSA-SHA1',
 *     consumer: { key: 'dpf43f3p2l4k3l03', privateKey: 'not a key' },
 *   })
 * } catch (error) {
 *   if (error instanceof OAuth1.InvalidInputError) console.log(error.message)
 * }
 * ```
 */
export class InvalidInputError extends Error {
  override name = 'OAuth1.InvalidInputError'
}

/**
 * Thrown for a `signatureMethod` other than `'HMAC-SHA1'`, `'HMAC-SHA256'`, `'RSA-SHA1'` and
 * `'PLAINTEXT'`.
 *
 * @example
 * ```ts
 * import * as OAuth1 from '@portable/oauth1'
 *
 * try {
 *   await OAuth1.authorization(request, { signatureMethod: 'RSA-SHA256' as never, consumer })
 * } catch (error) {
 *   if (error instanceof OAuth1.UnsupportedError) console.log(error.message)
 * }
 * ```
 */
export class UnsupportedError extends Error {
  override name = 'OAuth1.UnsupportedError'
}
