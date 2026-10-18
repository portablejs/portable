/**
 * Thrown by `verify` and `needsRehash` for a stored hash that is not a PBKDF2 hash in PHC or
 * passlib format.
 *
 * @example
 * ```ts
 * import * as Password from '@portable/password'
 *
 * try {
 *   await Password.verify(password, '$2b$12$...')
 * } catch (error) {
 *   if (error instanceof Password.InvalidInputError) console.log('not a PBKDF2 hash')
 * }
 * ```
 */
export class InvalidInputError extends Error {
  override name = 'Password.InvalidInputError'
}

/**
 * Thrown by `hash` and `verify` when the password is longer than `maxBytes` in UTF-8.
 *
 * @example
 * ```ts
 * import * as Password from '@portable/password'
 *
 * try {
 *   await Password.hash('x'.repeat(5000))
 * } catch (error) {
 *   if (error instanceof Password.MaxBytesError) console.log(`limit is ${error.maxBytes} bytes`)
 * }
 * ```
 */
export class MaxBytesError extends Error {
  override name = 'Password.MaxBytesError'
  /** The limit that was exceeded. */
  readonly maxBytes: number
  constructor(maxBytes: number) {
    super(`Password exceeded maxBytes of ${maxBytes}.`)
    this.maxBytes = maxBytes
  }
}

/**
 * Thrown by `verify` and `needsRehash` for a hash from another algorithm, such as bcrypt
 * (`$2b$...`), scrypt or Argon2 (`$argon2id$...`). WebCrypto can't compute those, so verify them
 * with another library while you migrate.
 *
 * @example
 * ```ts
 * import * as Password from '@portable/password'
 *
 * try {
 *   return await Password.verify(password, stored)
 * } catch (error) {
 *   if (error instanceof Password.UnsupportedError) return verifyLegacy(password, stored)
 *   throw error
 * }
 * ```
 */
export class UnsupportedError extends Error {
  override name = 'Password.UnsupportedError'
}
