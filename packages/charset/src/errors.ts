import * as Errors from '@portable/errors';
/**
 * Thrown by `load` when it doesn't know the label or can't encode its charset, and by `encode`
 * and `EncoderStream` when `unmappable` is `'error'` and the text has a character the charset
 * can't represent.
 *
 * @example
 * ```ts
 * import * as Charset from '@portable/charset';
 * import { windows1251 } from '@portable/charset/single-byte';
 *
 * try {
 *   Charset.encode('日本', windows1251, { unmappable: 'error' });
 * } catch (error) {
 *   error instanceof Charset.UnsupportedError; // true
 * }
 * ```
 */
export class UnsupportedError extends Errors.UnsupportedError {
  static override readonly kind: string = 'Charset.UnsupportedError';
}
