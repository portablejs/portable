/**
 * Thrown by `encode` and `envelope` when the message holds something a mail header can't carry
 * as given: an address that isn't one addr-spec, a header name outside printable ASCII, a
 * header the package writes itself, or a content type that isn't `type/subtype`.
 *
 * @example
 * ```ts
 * import * as Mail from '@portable/mail'
 *
 * try {
 *   Mail.encode({ to: 'not an address', text: 'Hello' })
 * } catch (error) {
 *   if (error instanceof Mail.InvalidInputError) console.log(error.message)
 * }
 * ```
 */
export class InvalidInputError extends Error {
  override name = 'Mail.InvalidInputError'
}
