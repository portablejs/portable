import * as Errors from '@portable/errors';
/**
 * Thrown for text that isn't an IP address or CIDR block in the strict notation `parse` and
 * `parseCidr` accept, and by `fromBytes` for a length other than 4 or 16.
 *
 * @example
 * ```ts
 * import * as Ip from '@portable/ip';
 *
 * try {
 *   Ip.parse('0x7f.1');
 * } catch (error) {
 *   if (error instanceof Ip.InvalidInputError) {
 *     console.log('not an IP address');
 *   }
 * }
 * ```
 */
export class InvalidInputError extends Errors.InvalidInputError {
  static override readonly kind: string = 'Ip.InvalidInputError';
}
