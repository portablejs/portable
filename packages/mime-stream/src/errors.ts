/**
 * Thrown when a header block grows past `maxHeaderBytes`. The block is counted with the empty line
 * that ends it.
 *
 * @example
 * ```ts
 * import * as MimeStream from '@portable/mime-stream'
 *
 * try {
 *   await MimeStream.splitHeaders(response.body!, { maxHeaderBytes: 64 * 1024 })
 * } catch (error) {
 *   if (error instanceof MimeStream.MaxHeaderBytesError) console.log(error.maxHeaderBytes)
 * }
 * ```
 */
export class MaxHeaderBytesError extends Error {
  override name = 'MimeStream.MaxHeaderBytesError'
  /** The limit that was exceeded. */
  readonly maxHeaderBytes: number
  constructor(maxHeaderBytes: number) {
    super(`Header block exceeded maxHeaderBytes of ${maxHeaderBytes}.`)
    this.maxHeaderBytes = maxHeaderBytes
  }
}

/**
 * Thrown when a line that matches a boundary grows past `maxBoundaryLineBytes`, which only happens
 * when the boundary is followed by that much whitespace.
 *
 * @example
 * ```ts
 * import * as MimeStream from '@portable/mime-stream'
 *
 * const stream = body.pipeThrough(new MimeStream.DecoderStream({ maxBoundaryLineBytes: 200 }))
 * // A read rejects with MimeStream.MaxBoundaryLineBytesError on '--boundary' plus 200 spaces.
 * ```
 */
export class MaxBoundaryLineBytesError extends Error {
  override name = 'MimeStream.MaxBoundaryLineBytesError'
  /** The limit that was exceeded. */
  readonly maxBoundaryLineBytes: number
  constructor(maxBoundaryLineBytes: number) {
    super(`Boundary line exceeded maxBoundaryLineBytes of ${maxBoundaryLineBytes}.`)
    this.maxBoundaryLineBytes = maxBoundaryLineBytes
  }
}

/**
 * Thrown when a message has more than `maxParts` parts, counting the root.
 *
 * @example
 * ```ts
 * import * as MimeStream from '@portable/mime-stream'
 *
 * const stream = body.pipeThrough(new MimeStream.DecoderStream({ maxParts: 100 }))
 * // A read rejects with MimeStream.MaxPartsError on the 101st part.
 * ```
 */
export class MaxPartsError extends Error {
  override name = 'MimeStream.MaxPartsError'
  /** The limit that was exceeded. */
  readonly maxParts: number
  constructor(maxParts: number) {
    super(`Message exceeded maxParts of ${maxParts}.`)
    this.maxParts = maxParts
  }
}
