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
