/**
 * Thrown by `parseAddresses` with `strict: true` when the input isn't a valid RFC 5322 address
 * list, and by `formatValue` and `formatAddresses` when given something a header can't carry,
 * such as a line break in a parameter name or an address that doesn't parse.
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
export class InvalidInputError extends Error {
  override name = 'MimeHeaders.InvalidInputError'
}
