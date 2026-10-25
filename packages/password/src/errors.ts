import * as Errors from '@portable/errors';
/**
 * Thrown by `verify` and `needsRehash` for a stored hash that is malformed: a PBKDF2 hash in PHC
 * or passlib format with a missing field or a bad value, or a string that names no algorithm.
 *
 * @example
 * ```ts
 * import * as Password from '@portable/password';
 *
 * try {
 *   await Password.verify(password, '$pbkdf2-sha256$i=0$...');
 * } catch (error) {
 *   if (error instanceof Password.InvalidInputError) {
 *     console.log('malformed hash');
 *   }
 * }
 * ```
 */
export class InvalidInputError extends Errors.InvalidInputError {
  static override readonly kind: string = 'Password.InvalidInputError';
}

/**
 * Thrown by `hash` and `verify` when the password is longer than `maxBytes` in UTF-8.
 *
 * @example
 * ```ts
 * import * as Password from '@portable/password';
 *
 * try {
 *   await Password.hash('x'.repeat(5000));
 * } catch (error) {
 *   if (error instanceof Password.MaxBytesError) {
 *     console.log(`limit is ${error.maxBytes} bytes`);
 *   }
 * }
 * ```
 */
export class MaxBytesError extends Errors.MaxBytesError {
  static override readonly kind: string = 'Password.MaxBytesError';
  constructor(options: Errors.MaxBytesError.Options) {
    super({ message: `Password exceeded maxBytes of ${options.maxBytes}.`, ...options });
  }
}

/**
 * Thrown by `verify` and `needsRehash` for a hash from another algorithm, such as bcrypt
 * (`$2b$...`), scrypt or Argon2 (`$argon2id$...`). WebCrypto can't compute those, so verify them
 * with another library while you migrate.
 *
 * @example
 * ```ts
 * import * as Password from '@portable/password';
 *
 * try {
 *   return await Password.verify(password, stored);
 * } catch (error) {
 *   if (error instanceof Password.UnsupportedError) {
 *     return verifyLegacy(password, stored);
 *   }
 *   throw error;
 * }
 * ```
 */
export class UnsupportedError extends Errors.UnsupportedError {
  static override readonly kind: string = 'Password.UnsupportedError';
}
