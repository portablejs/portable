import * as Errors from '@portable/errors'
/**
 * Thrown for a malformed DER signature, a raw signature or seed of the wrong length, or a key
 * that is not an extractable private key.
 *
 * @example
 * ```ts
 * import * as WebCrypto from '@portable/web-crypto'
 *
 * try {
 *   WebCrypto.derToRawEcdsa(new Uint8Array([0x30, 0x00]))
 * } catch (error) {
 *   if (error instanceof WebCrypto.InvalidInputError) console.log(error.message)
 * }
 * ```
 */
export class InvalidInputError extends Errors.InvalidInputError {
  static override readonly kind: string = 'WebCrypto.InvalidInputError'
}
