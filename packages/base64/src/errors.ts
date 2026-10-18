/**
 * Thrown in `'loose'` and `'strict'` mode for a character outside the alphabet, misplaced padding,
 * or, in `'strict'` mode, non-zero bits before the padding.
 *
 * @example
 * ```ts
 * import * as Base64 from '@portable/base64'
 *
 * try {
 *   Base64.decode('YW*j')
 * } catch (error) {
 *   if (error instanceof Base64.InvalidInputError) console.log(error.message)
 * }
 * ```
 */
export class InvalidInputError extends Error {
  override name = 'Base64.InvalidInputError'
}

/**
 * Thrown in `'loose'` and `'strict'` mode when the input ends inside a group of four characters
 * that can't be completed: one leftover character, a single `=` where two are needed, or, in
 * `'strict'` mode, missing padding.
 *
 * @example
 * ```ts
 * import * as Base64 from '@portable/base64'
 *
 * try {
 *   Base64.decode('YWJjZ')
 * } catch (error) {
 *   if (error instanceof Base64.TruncatedError) console.log('incomplete base64')
 * }
 * ```
 */
export class TruncatedError extends Error {
  override name = 'Base64.TruncatedError'
}
