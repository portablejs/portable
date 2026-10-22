import * as Errors from '@portable/errors'
/**
 * Thrown when a line isn't valid JSON. The message gives the line number, and `cause` holds the
 * `SyntaxError` from `JSON.parse`.
 *
 * @example
 * ```ts
 * import * as Jsonl from '@portable/jsonl'
 * import * as Streams from '@portable/streams'
 *
 * try {
 *   await Streams.toArray(body.pipeThrough(new Jsonl.DecoderStream()))
 * } catch (error) {
 *   if (error instanceof Jsonl.InvalidInputError) return new Response('Bad NDJSON', { status: 400 })
 *   throw error
 * }
 * ```
 */
export class InvalidInputError extends Errors.InvalidInputError {
  static override readonly kind: string = 'Jsonl.InvalidInputError'
}
