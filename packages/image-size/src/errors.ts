/**
 * Thrown when the bytes don't match any supported image format.
 *
 * @example
 * ```ts
 * import { imageSize, UnsupportedError } from '@portable/image-size'
 *
 * try {
 *   imageSize(new TextEncoder().encode('hello'))
 * } catch (error) {
 *   if (error instanceof UnsupportedError) console.log('not an image')
 * }
 * ```
 */
export class UnsupportedError extends TypeError {
  override name = 'ImageSize.UnsupportedError'
  constructor() {
    super('Unsupported image type.')
  }
}

/**
 * Thrown when the input ends before the bytes that hold the dimensions.
 *
 * @example
 * ```ts
 * import { imageSize, TruncatedError } from '@portable/image-size'
 *
 * const png = new Uint8Array(await (await fetch('https://example.com/a.png')).arrayBuffer())
 * try {
 *   imageSize(png.subarray(0, 12))
 * } catch (error) {
 *   if (error instanceof TruncatedError) console.log('need more bytes')
 * }
 * ```
 */
export class TruncatedError extends TypeError {
  override name = 'ImageSize.TruncatedError'
  constructor() {
    super('Image data ended before its dimensions.')
  }
}

/**
 * Thrown when the input starts like a supported format but its header is malformed.
 *
 * @example
 * ```ts
 * import { imageSize, InvalidInputError } from '@portable/image-size'
 *
 * try {
 *   imageSize(new TextEncoder().encode('<svg width="10"></svg>'))
 * } catch (error) {
 *   if (error instanceof InvalidInputError) console.log(error.message) // 'Invalid SVG'
 * }
 * ```
 */
export class InvalidInputError extends TypeError {
  override name = 'ImageSize.InvalidInputError'
}
