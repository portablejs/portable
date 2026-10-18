/**
 * Thrown when a line isn't valid JSON. The message gives the line number, and `cause` holds the
 * `SyntaxError` from `JSON.parse`.
 *
 * @example
 * ```ts
 * import * as Ndjson from '@portable/ndjson'
 * import * as Streams from '@portable/streams'
 *
 * try {
 *   await Streams.toArray(body.pipeThrough(new Ndjson.DecoderStream()))
 * } catch (error) {
 *   if (error instanceof Ndjson.InvalidInputError) return new Response('Bad NDJSON', { status: 400 })
 *   throw error
 * }
 * ```
 */
export class InvalidInputError extends TypeError {
  override name = 'Ndjson.InvalidInputError'
}
