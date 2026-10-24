import * as Errors from '@portable/errors'
/**
 * Thrown by `fromHex` for input of odd length or with a character that isn't a hex digit.
 *
 * @example
 * ```ts
 * import * as Bytes from '@portable/bytes'
 *
 * try {
 *   Bytes.fromHex('0g')
 * } catch (error) {
 *   if (error instanceof Bytes.InvalidInputError) {
 *     console.log(error.message)
 *   }
 * }
 * ```
 */
export class InvalidInputError extends Errors.InvalidInputError {
  static override readonly kind: string = 'Bytes.InvalidInputError'
}
