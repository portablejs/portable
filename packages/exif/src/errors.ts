/** Thrown when TIFF or raw EXIF input ends before its 8-byte header. */
export class TruncatedError extends Error {
  override name = 'Exif.TruncatedError'
  constructor() {
    super('Input ended inside the TIFF header.')
  }
}

/** Thrown when EXIF data has a malformed TIFF header. */
export class InvalidInputError extends Error {
  override name = 'Exif.InvalidInputError'
  constructor(reason: string) {
    super(`Invalid TIFF header: ${reason}.`)
  }
}

/** Thrown when the input is not JPEG, TIFF, PNG, WebP, HEIF or raw EXIF data. */
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
