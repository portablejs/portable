import * as Errors from '@portable/errors';
/**
 * Thrown when a line isn't valid JSON. The message gives the line number, and `cause` holds the
 * `SyntaxError` from `JSON.parse`.
 *
 * @example
 * ```ts
 * import * as Jsonl from '@portable/jsonl';
 * import * as Streams from '@portable/streams';
 *
 * try {
 *   await Streams.toArray(body.pipeThrough(new Jsonl.DecoderStream()));
 * } catch (error) {
 *   if (error instanceof Jsonl.InvalidInputError) {
 *     return new Response('Bad NDJSON', { status: 400 });
 *   }
 *   throw error;
 * }
 * ```
 */
export class InvalidInputError extends Errors.InvalidInputError {
  static override readonly kind: string = 'Jsonl.InvalidInputError';
}

/**
 * Thrown when a line grows past `maxLength`, before it is parsed.
 *
 * @example
 * ```ts
 * import * as Jsonl from '@portable/jsonl';
 * import * as Streams from '@portable/streams';
 *
 * try {
 *   await Streams.toArray(body.pipeThrough(new Jsonl.DecoderStream({ maxLength: 1_000_000 })));
 * } catch (error) {
 *   if (error instanceof Jsonl.MaxLengthError) {
 *     return new Response(null, { status: 413 });
 *   }
 *   throw error;
 * }
 * ```
 */
export class MaxLengthError extends Errors.MaxLengthError {
  static override readonly kind: string = 'Jsonl.MaxLengthError';
  constructor(options: Errors.MaxLengthError.Options) {
    super({ message: `Line exceeded maxLength of ${options.maxLength}.`, ...options });
  }
}

/**
 * Thrown when a value doesn't pass the `schema` option. The message gives the line number, and
 * `issues` holds the issues from the schema.
 *
 * @example
 * ```ts
 * import * as Jsonl from '@portable/jsonl';
 * import * as Streams from '@portable/streams';
 * import * as z from 'zod';
 *
 * const Post = z.object({ id: z.number(), text: z.string() });
 * try {
 *   await Streams.toArray(body.pipeThrough(new Jsonl.DecoderStream({ schema: Post })));
 * } catch (error) {
 *   if (error instanceof Jsonl.SchemaError) {
 *     return Response.json(error.issues, { status: 400 });
 *   }
 *   throw error;
 * }
 * ```
 */
export class SchemaError extends Errors.SchemaError {
  static override readonly kind: string = 'Jsonl.SchemaError';
}
