import * as Errors from '@portable/errors'
/**
 * Thrown when the input isn't valid JSON. The message gives the offset of the first bad
 * character.
 *
 * @example
 * ```ts
 * import * as JsonStream from '@portable/json-stream'
 * import * as Streams from '@portable/streams'
 *
 * try {
 *   await Streams.toArray(body.pipeThrough(new JsonStream.DecoderStream()))
 * } catch (error) {
 *   if (error instanceof JsonStream.InvalidInputError) return new Response('Bad JSON', { status: 400 })
 *   throw error
 * }
 * ```
 */
export class InvalidInputError extends Errors.InvalidInputError {
  static override readonly kind: string = 'JsonStream.InvalidInputError'
}

/**
 * Thrown when the input ends inside a JSON value, such as a response body cut off mid-document.
 *
 * @example
 * ```ts
 * import * as JsonStream from '@portable/json-stream'
 * import * as Streams from '@portable/streams'
 *
 * try {
 *   await Streams.toArray(body.pipeThrough(new JsonStream.DecoderStream()))
 * } catch (error) {
 *   if (error instanceof JsonStream.TruncatedError) console.log('connection dropped')
 * }
 * ```
 */
export class TruncatedError extends Errors.TruncatedError {
  static override readonly kind: string = 'JsonStream.TruncatedError'
  constructor(message: string = 'JSON input ended inside a value.', options?: ErrorOptions) {
    super(message, options)
  }
}
