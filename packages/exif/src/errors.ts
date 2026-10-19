/**
 * Thrown when TIFF or raw EXIF input ends before its 8-byte header.
 *
 * @example
 * ```ts
 * import * as Exif from '@portable/exif'
 *
 * try {
 *   Exif.parse(new Uint8Array([0x49, 0x49, 0x2a, 0x00]))
 * } catch (error) {
 *   if (error instanceof Exif.TruncatedError) console.log(error.message)
 * }
 * ```
 */
export class TruncatedError extends Error {
  override name = 'Exif.TruncatedError'
  constructor() {
    super('Input ended inside the TIFF header.')
  }
}

/**
 * Thrown when EXIF data has a malformed TIFF header, or `strip` finds a malformed JPEG.
 *
 * @example
 * ```ts
 * import * as Exif from '@portable/exif'
 *
 * try {
 *   Exif.parse(photo)
 * } catch (error) {
 *   if (error instanceof Exif.InvalidInputError) console.log('corrupt EXIF data')
 * }
 * ```
 */
export class InvalidInputError extends Error {
  override name = 'Exif.InvalidInputError'
}

/**
 * Thrown when the input is not JPEG, TIFF, PNG, WebP, HEIF or raw EXIF data, or when `strip` gets a
 * format other than JPEG, PNG or WebP.
 *
 * @example
 * ```ts
 * import * as Exif from '@portable/exif'
 *
 * try {
 *   Exif.parse(new TextEncoder().encode('GIF89a'))
 * } catch (error) {
 *   if (error instanceof Exif.UnsupportedError) console.log(error.message)
 * }
 * ```
 */
export class UnsupportedError extends Error {
  override name = 'Exif.UnsupportedError'
  constructor() {
    super('Unsupported format: expected JPEG, TIFF, PNG, WebP, HEIF or EXIF data.')
  }
}

/**
 * Thrown when `parseStream` would need to hold more than `maxBytes` of the stream at once.
 *
 * @example
 * ```ts
 * import * as Exif from '@portable/exif'
 *
 * const response = await fetch('https://example.com/photo.jpg')
 * try {
 *   await Exif.parseStream(response.body!, { maxBytes: 1_000_000 })
 * } catch (error) {
 *   if (error instanceof Exif.MaxBytesError) console.log(`needs more than ${error.maxBytes} bytes`)
 * }
 * ```
 */
export class MaxBytesError extends Error {
  override name = 'Exif.MaxBytesError'
  /** The limit that was exceeded. */
  readonly maxBytes: number
  constructor(maxBytes: number) {
    super(`Reading the EXIF data needs more than maxBytes (${maxBytes}) in memory.`)
    this.maxBytes = maxBytes
  }
}
