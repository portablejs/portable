/**
 * Thrown for a malformed DER signature, a raw signature or seed of the wrong length, or a key
 * that has no public half.
 *
 * @example
 * ```ts
 * import * as Crypto from '@portable/crypto'
 *
 * try {
 *   Crypto.derToRawEcdsa(new Uint8Array([0x30, 0x00]))
 * } catch (error) {
 *   if (error instanceof Crypto.InvalidInputError) console.log(error.message)
 * }
 * ```
 */
export class InvalidInputError extends Error {
  override name = 'Crypto.InvalidInputError'
}
