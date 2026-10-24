import * as Errors from '@portable/errors';
/**
 * Thrown by `decode` when the file ends early: before `IEND`, inside a chunk, or with less image data than the image needs.
 *
 * @example
 * ```ts
 * import * as Png from '@portable/png';
 *
 * try {
 *   await Png.decode(bytes.subarray(0, 100));
 * } catch (error) {
 *   if (error instanceof Png.TruncatedError) {
 *     console.log('incomplete download');
 *   }
 * }
 * ```
 */
export class TruncatedError extends Errors.TruncatedError {
  static override readonly kind: string = 'Png.TruncatedError';
}

/**
 * Thrown when the input is malformed: a bad signature, a CRC mismatch, an invalid header, corrupt
 * image data, or (from `encode`) pixel data that doesn't match the size.
 *
 * @example
 * ```ts
 * import * as Png from '@portable/png';
 *
 * try {
 *   await Png.decode(new TextEncoder().encode('not a png'));
 * } catch (error) {
 *   if (error instanceof Png.InvalidInputError) {
 *     console.log(error.message);
 *   }
 * }
 * ```
 */
export class InvalidInputError extends Errors.InvalidInputError {
  static override readonly kind: string = 'Png.InvalidInputError';
}

/**
 * Thrown by `decode` for a valid file that uses something this package doesn't handle: an unknown
 * critical chunk, or a compression, filter or interlace method other than the ones PNG defines.
 *
 * @example
 * ```ts
 * import * as Png from '@portable/png';
 *
 * try {
 *   await Png.decode(bytes);
 * } catch (error) {
 *   if (error instanceof Png.UnsupportedError) {
 *     console.log(error.message);
 *   }
 * }
 * ```
 */
export class UnsupportedError extends Errors.UnsupportedError {
  static override readonly kind: string = 'Png.UnsupportedError';
}
