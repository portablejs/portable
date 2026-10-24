import * as Errors from '@portable/errors'
/**
 * Thrown for malformed CSV: text between a closing quote and the next delimiter or line break, a
 * row whose field count differs from the first row's, or a repeated header name.
 *
 * @example
 * ```ts
 * import * as Csv from '@portable/csv'
 *
 * try {
 *   Csv.decode('a,b\n1,2,3\n')
 * } catch (error) {
 *   if (error instanceof Csv.InvalidInputError) {
 *     console.log(error.message)
 *   } // 'Row 2 has 3 fields, but row 1 has 2.'
 * }
 * ```
 */
export class InvalidInputError extends Errors.InvalidInputError {
  static override readonly kind: string = 'Csv.InvalidInputError'
}

/**
 * Thrown when the input ends inside a quoted field.
 *
 * @example
 * ```ts
 * import * as Csv from '@portable/csv'
 *
 * try {
 *   Csv.decode('a,"b\n')
 * } catch (error) {
 *   if (error instanceof Csv.TruncatedError) {
 *     console.log('unclosed quote')
 *   }
 * }
 * ```
 */
export class TruncatedError extends Errors.TruncatedError {
  static override readonly kind: string = 'Csv.TruncatedError'
}

/**
 * Thrown when a row is longer than `maxLength` characters.
 *
 * @example
 * ```ts
 * import * as Csv from '@portable/csv'
 *
 * try {
 *   Csv.decode('a,b\nfar too long,x\n', { maxLength: 8 })
 * } catch (error) {
 *   if (error instanceof Csv.MaxLengthError) {
 *     console.log(error.maxLength)
 *   } // 8
 * }
 * ```
 */
export class MaxLengthError extends Errors.MaxLengthError {
  static override readonly kind: string = 'Csv.MaxLengthError'
  constructor(options: Errors.MaxLengthError.Options) {
    super({ message: `Row exceeded maxLength of ${options.maxLength}.`, ...options })
  }
}
