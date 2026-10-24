import * as Errors from '@portable/errors'
/**
 * Thrown by `parseAddresses` with `strict: true` when the input isn't a valid RFC 5322 address
 * list, and by `formatValue` and `formatAddresses` when given something that can't be
 * written in a header, such as a line break in a parameter name or an address that doesn't parse.
 *
 * @example
 * ```ts
 * import * as MimeHeaders from '@portable/mime-headers'
 *
 * try {
 *   MimeHeaders.parseAddresses('not an address', { strict: true })
 * } catch (error) {
 *   if (error instanceof MimeHeaders.InvalidInputError) console.log(error.message)
 * }
 * ```
 */
export class InvalidInputError extends Errors.InvalidInputError {
  static override readonly kind: string = 'MimeHeaders.InvalidInputError'
}

/**
 * Thrown by `parseHeaders` when the header block is longer than `maxLength`.
 *
 * @example
 * ```ts
 * import * as MimeHeaders from '@portable/mime-headers'
 *
 * try {
 *   MimeHeaders.parseHeaders(message, { maxLength: 64 * 1024 })
 * } catch (error) {
 *   if (error instanceof MimeHeaders.MaxLengthError) console.log(error.maxLength)
 * }
 * ```
 */
export class MaxLengthError extends Errors.MaxLengthError {
  static override readonly kind: string = 'MimeHeaders.MaxLengthError'
  constructor(options: Errors.MaxLengthError.Options) {
    super({ message: `The header block exceeded maxLength of ${options.maxLength}.`, ...options })
  }
}
