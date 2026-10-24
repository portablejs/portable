import * as Errors from '@portable/errors';
/**
 * Thrown when the bytes don't match any supported image format.
 *
 * @example
 * ```ts
 * import * as ImageSize from '@portable/image-size';
 *
 * try {
 *   ImageSize.parse(new TextEncoder().encode('hello world'));
 * } catch (error) {
 *   if (error instanceof ImageSize.UnsupportedError) {
 *     console.log('not an image');
 *   }
 * }
 * ```
 */
export class UnsupportedError extends Errors.UnsupportedError {
  static override readonly kind: string = 'ImageSize.UnsupportedError';
  constructor(message: string = 'Unsupported image type.', options?: ErrorOptions) {
    super(message, options);
  }
}

/**
 * Thrown when the input ends before the bytes that hold the dimensions.
 *
 * @example
 * ```ts
 * import * as ImageSize from '@portable/image-size';
 *
 * const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
 * try {
 *   ImageSize.parse(png);
 * } catch (error) {
 *   if (error instanceof ImageSize.TruncatedError) {
 *     console.log('need more bytes');
 *   }
 * }
 * ```
 */
export class TruncatedError extends Errors.TruncatedError {
  static override readonly kind: string = 'ImageSize.TruncatedError';
  constructor(message: string = 'Image data ended before its dimensions.', options?: ErrorOptions) {
    super(message, options);
  }
}

/**
 * Thrown when the input starts like a supported format but its header is malformed.
 *
 * @example
 * ```ts
 * import * as ImageSize from '@portable/image-size';
 *
 * try {
 *   ImageSize.parse(new TextEncoder().encode('<svg width="10"></svg>'));
 * } catch (error) {
 *   if (error instanceof ImageSize.InvalidInputError) {
 *     console.log(error.message);
 *   } // 'Invalid SVG'
 * }
 * ```
 */
export class InvalidInputError extends Errors.InvalidInputError {
  static override readonly kind: string = 'ImageSize.InvalidInputError';
}

/**
 * Thrown by `parseStream` when it has read `maxBytes` and the dimensions still aren't in them.
 * Raise `maxBytes`, or treat the image as too large to measure.
 *
 * @example
 * ```ts
 * import * as ImageSize from '@portable/image-size';
 *
 * try {
 *   await ImageSize.parseStream(response.body!, { maxBytes: 64 * 1024 });
 * } catch (error) {
 *   if (error instanceof ImageSize.MaxBytesError) {
 *     console.log(`no size in ${error.maxBytes} bytes`);
 *   }
 * }
 * ```
 */
export class MaxBytesError extends Errors.MaxBytesError {
  static override readonly kind: string = 'ImageSize.MaxBytesError';
  constructor(options: Errors.MaxBytesError.Options) {
    super({
      message: `Image dimensions not found in the first ${options.maxBytes} bytes.`,
      ...options,
    });
  }
}
