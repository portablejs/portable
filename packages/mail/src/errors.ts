import * as Errors from '@portable/errors';
/**
 * Thrown by `encodeStream` and `envelope` when part of the message can't be written in a mail
 * header as given: an address that isn't one addr-spec, a header name outside printable ASCII, a
 * header the package writes itself, a content type that isn't `type/subtype` or is `multipart/*`,
 * or an invalid `Date`. `envelope` also throws it for a message without a `From` or `Sender`
 * address.
 *
 * @example
 * ```ts
 * import * as Mail from '@portable/mail';
 *
 * try {
 *   Mail.encodeStream({ to: 'not an address', text: 'Hello' });
 * } catch (error) {
 *   if (error instanceof Mail.InvalidInputError) {
 *     console.log(error.message);
 *   }
 * }
 * ```
 */
export class InvalidInputError extends Errors.InvalidInputError {
  static override readonly kind: string = 'Mail.InvalidInputError';
}
