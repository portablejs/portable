/** Thrown when compressed input ends before the end of the compressed stream. */
export class TruncatedError extends Error {
  override name = 'Compress.TruncatedError'
  constructor(options?: ErrorOptions) {
    super('Compressed input ended early.', options)
  }
}

/** Thrown when compressed input is malformed, fails its checksum, or has data after its end. */
export class InvalidInputError extends Error {
  override name = 'Compress.InvalidInputError'
  constructor(options?: ErrorOptions) {
    super('Compressed input is invalid.', options)
  }
}

/** Thrown when decompressed output grows past `maxBytes`. */
export class MaxBytesError extends Error {
  override name = 'Compress.MaxBytesError'
  /** The limit that was exceeded. */
  readonly maxBytes: number
  constructor(maxBytes: number) {
    super(`Decompressed output exceeded maxBytes of ${maxBytes}.`)
    this.maxBytes = maxBytes
  }
}

// Runtimes report every decompression failure as a TypeError. Node adds a zlib `code`;
// Chromium fails the write for bad data and the close for missing data.
export function classify(error: unknown, closing: boolean): Error {
  const code =
    typeof error === 'object' && error !== null && 'code' in error ? error.code : undefined
  const truncated = typeof code === 'string' ? code === 'Z_BUF_ERROR' : closing
  return truncated ? new TruncatedError({ cause: error }) : new InvalidInputError({ cause: error })
}
