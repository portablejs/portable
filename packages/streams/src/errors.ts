import * as Errors from '@portable/errors'

/**
 * Thrown when a stream has more bytes than `maxBytes` allows.
 *
 * @example
 * ```ts
 * import * as Streams from '@portable/streams'
 *
 * const response = await fetch('https://example.com/upload')
 * try {
 *   await Streams.toBytes(response.body!, { maxBytes: 1_000_000 })
 * } catch (error) {
 *   if (error instanceof Streams.MaxBytesError) console.log(`larger than ${error.maxBytes} bytes`)
 * }
 * ```
 */
export class MaxBytesError extends Errors.MaxBytesError {
  static override readonly kind: string = 'Streams.MaxBytesError'
  constructor(options: Errors.MaxBytesError.Options) {
    super({ message: `Stream exceeded maxBytes of ${options.maxBytes}.`, ...options })
  }
}
