import * as Errors from '@portable/errors'

/**
 * Thrown when a domain name breaks the rules of UTS #46.
 *
 * @example
 * ```ts
 * import * as Idna from '@portable/idna'
 *
 * try {
 *   Idna.toUnicode('www.xn--b.com')
 * } catch (error) {
 *   if (error instanceof Idna.InvalidInputError) console.log(error.message)
 * }
 * ```
 */
export class InvalidInputError extends Errors.InvalidInputError {
  static override readonly kind: string = 'Idna.InvalidInputError'
}
