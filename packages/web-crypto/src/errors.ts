import * as Errors from '@portable/errors';
/**
 * Thrown for a malformed DER signature, a raw signature or seed of the wrong length, a key that
 * is not an extractable private key, or a PEM key that doesn't decode or doesn't import for the
 * algorithm.
 *
 * @example
 * ```ts
 * import * as WebCrypto from '@portable/web-crypto';
 *
 * try {
 *   WebCrypto.derToRawEcdsa(new Uint8Array([0x30, 0x00]));
 * } catch (error) {
 *   if (error instanceof WebCrypto.InvalidInputError) {
 *     console.log(error.message);
 *   }
 * }
 * ```
 */
export class InvalidInputError extends Errors.InvalidInputError {
  static override readonly kind: string = 'WebCrypto.InvalidInputError';
}

/**
 * Thrown by `importPem` when the PEM block is valid but of a kind it doesn't import, such as an
 * `EC PRIVATE KEY`, a certificate or an encrypted key.
 *
 * @example
 * ```ts
 * import * as WebCrypto from '@portable/web-crypto';
 *
 * try {
 *   await WebCrypto.importPem({ name: 'ECDSA', namedCurve: 'P-256' }, pem);
 * } catch (error) {
 *   if (error instanceof WebCrypto.UnsupportedError) {
 *     console.log('Convert the key to PKCS #8 with `openssl pkcs8 -topk8 -nocrypt`.');
 *   }
 * }
 * ```
 */
export class UnsupportedError extends Errors.UnsupportedError {
  static override readonly kind: string = 'WebCrypto.UnsupportedError';
}
