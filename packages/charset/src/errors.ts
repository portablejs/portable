/**
 * Thrown by `load` for a label that names no charset this package can encode, and by `encode`
 * and `EncoderStream` when `unmappable` is `'error'` and the text has a character the charset
 * can't represent.
 *
 * @example
 * ```ts
 * import * as Charset from '@portable/charset'
 * import { windows1251 } from '@portable/charset/single-byte'
 *
 * try {
 *   Charset.encode('日本', windows1251, { unmappable: 'error' })
 * } catch (error) {
 *   error instanceof Charset.UnsupportedError // true
 * }
 * ```
 */
export class UnsupportedError extends Error {
  override name = 'Charset.UnsupportedError'
}
