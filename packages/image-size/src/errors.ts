/**
 * Thrown when the bytes don't match any supported image format.
 *
 * @example
 * ```ts
 * import * as ImageSize from '@portable/image-size'
 *
 * try {
 *   ImageSize.parse(new TextEncoder().encode('hello world'))
 * } catch (error) {
 *   if (error instanceof ImageSize.UnsupportedError) console.log('not an image')
 * }
 * ```
 */
export class UnsupportedError extends Error {
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
 * import * as ImageSize from '@portable/image-size'
 *
 * const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
 * try {
 *   ImageSize.parse(png)
 * } catch (error) {
 *   if (error instanceof ImageSize.TruncatedError) console.log('need more bytes')
 * }
 * ```
 */
export class TruncatedError extends Error {
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
 * import * as ImageSize from '@portable/image-size'
 *
 * try {
 *   ImageSize.parse(new TextEncoder().encode('<svg width="10"></svg>'))
 * } catch (error) {
 *   if (error instanceof ImageSize.InvalidInputError) console.log(error.message) // 'Invalid SVG'
 * }
 * ```
 */
export class InvalidInputError extends Error {
  override name = 'ImageSize.InvalidInputError'
}
