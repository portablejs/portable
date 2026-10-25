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

/**
 * Thrown by `decode` and `decodeSync` when the image has more pixels (`width * height`) than
 * `maxPixels`. The check runs on the `IHDR` chunk, before any image data is decompressed or
 * allocated.
 *
 * @example
 * ```ts
 * import * as Png from '@portable/png';
 *
 * try {
 *   await Png.decode(upload, { maxPixels: 50_000_000 });
 * } catch (error) {
 *   if (error instanceof Png.MaxPixelsError) {
 *     return new Response('Image too large', { status: 413 });
 *   }
 *   throw error;
 * }
 * ```
 */
export class MaxPixelsError extends Errors.BaseError {
  static override readonly kind: string = 'Png.MaxPixelsError';
  /** The `maxPixels` limit that the image exceeded. */
  readonly maxPixels: number;
  constructor(options: ErrorOptions & { maxPixels: number }) {
    const { maxPixels, ...rest } = options;
    super(`Image exceeded maxPixels of ${maxPixels}.`, rest);
    this.maxPixels = maxPixels;
  }
}
