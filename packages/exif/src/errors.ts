/** Thrown when TIFF or raw EXIF input ends before its 8-byte header. */
export class TruncatedError extends Error {
  override name = 'Exif.TruncatedError'
  constructor() {
    super('Input ended inside the TIFF header.')
  }
}

/** Thrown when EXIF data has a malformed TIFF header, or `strip` finds a malformed JPEG. */
export class InvalidInputError extends Error {
  override name = 'Exif.InvalidInputError'
}

/** Thrown when the input is not JPEG, TIFF, PNG, WebP, HEIF or raw EXIF data, or when `strip` gets a format other than JPEG, PNG or WebP. */
export class UnsupportedError extends Error {
  override name = 'Exif.UnsupportedError'
  constructor() {
    super('Unsupported format: expected JPEG, TIFF, PNG, WebP, HEIF or EXIF data.')
  }
}

/** Thrown when `parseStream` would need to hold more than `maxBytes` of the stream at once. */
export class MaxBytesError extends Error {
  override name = 'Exif.MaxBytesError'
  /** The limit that was exceeded. */
  readonly maxBytes: number
  constructor(maxBytes: number) {
    super(`Reading the EXIF data needs more than maxBytes (${maxBytes}) in memory.`)
    this.maxBytes = maxBytes
  }
}
