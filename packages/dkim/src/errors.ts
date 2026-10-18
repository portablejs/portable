/**
 * Thrown by `sign` for a message it can't sign: one without a From field, which RFC 6376
 * section 5.4 requires every signature to cover.
 *
 * @example
 * ```ts
 * import * as Dkim from '@portable/dkim'
 *
 * try {
 *   await Dkim.sign('Subject: hi\r\n\r\nbody\r\n', { domain, selector, privateKey })
 * } catch (error) {
 *   if (error instanceof Dkim.InvalidInputError) console.log(error.message)
 * }
 * ```
 */
export class InvalidInputError extends Error {
  override name = 'Dkim.InvalidInputError'
}
