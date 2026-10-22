import * as Errors from '@portable/errors'
/**
 * Thrown when a header block grows past `maxHeaderBytes`. The count includes the empty line that
 * ends the block.
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
export class MaxHeaderBytesError extends Errors.BaseError {
  static override readonly kind: string = 'MimeStream.MaxHeaderBytesError'
  /** The limit that was exceeded. */
  readonly maxHeaderBytes: number
  constructor(options: ErrorOptions & { maxHeaderBytes: number }) {
    const { maxHeaderBytes, ...rest } = options
    super(`Header block exceeded maxHeaderBytes of ${maxHeaderBytes}.`, rest)
    this.maxHeaderBytes = maxHeaderBytes
  }
}

/**
 * Thrown when a line that matches a boundary grows past `maxBoundaryLineBytes`, which happens only
 * when that much whitespace follows the boundary.
 *
 * @example
 * ```ts
 * import * as MimeStream from '@portable/mime-stream'
 *
 * const stream = body.pipeThrough(new MimeStream.DecoderStream({ maxBoundaryLineBytes: 200 }))
 * // A read rejects with MimeStream.MaxBoundaryLineBytesError on '--boundary' plus 200 spaces.
 * ```
 */
export class MaxBoundaryLineBytesError extends Errors.BaseError {
  static override readonly kind: string = 'MimeStream.MaxBoundaryLineBytesError'
  /** The limit that was exceeded. */
  readonly maxBoundaryLineBytes: number
  constructor(options: ErrorOptions & { maxBoundaryLineBytes: number }) {
    const { maxBoundaryLineBytes, ...rest } = options
    super(`Boundary line exceeded maxBoundaryLineBytes of ${maxBoundaryLineBytes}.`, rest)
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
export class MaxPartsError extends Errors.BaseError {
  static override readonly kind: string = 'MimeStream.MaxPartsError'
  /** The limit that was exceeded. */
  readonly maxParts: number
  constructor(options: ErrorOptions & { maxParts: number }) {
    const { maxParts, ...rest } = options
    super(`Message exceeded maxParts of ${maxParts}.`, rest)
    this.maxParts = maxParts
  }
}
