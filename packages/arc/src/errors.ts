import * as Errors from '@portable/errors';
/**
 * Thrown by `seal` for a message it must not seal: one without a From field, one whose newest
 * ARC-Seal says `cv=fail` (RFC 8617 section 5.1 step 2), one that already has 50 ARC sets, or a
 * `cv=pass` seal over a chain whose sets can't be read.
 *
 * @example
 * ```ts
 * import * as Arc from '@portable/arc';
 *
 * try {
 *   headers = await Arc.seal(message, { domain, selector, privateKey, authResults, chainValidation });
 * } catch (error) {
 *   if (!(error instanceof Arc.InvalidInputError)) {
 *     throw error;
 *   }
 * }
 * ```
 */
export class InvalidInputError extends Errors.InvalidInputError {
  static override readonly kind: string = 'Arc.InvalidInputError';
}
