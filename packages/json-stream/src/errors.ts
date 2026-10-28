import * as Errors from '@portable/errors';
/**
 * Thrown when the input isn't valid JSON. The message gives the offset of the first bad
 * character, or, for an error inside a matched value, the offset where that value starts.
 *
 * @example
 * ```ts
 * import * as JsonStream from '@portable/json-stream';
 * import * as Streams from '@portable/streams';
 *
 * try {
 *   await Streams.toArray(body.pipeThrough(new JsonStream.DecoderStream()));
 * } catch (error) {
 *   if (error instanceof JsonStream.InvalidInputError) {
 *     return new Response('Bad JSON', { status: 400 });
 *   }
 *   throw error;
 * }
 * ```
 */
export class InvalidInputError extends Errors.InvalidInputError {
  static override readonly kind: string = 'JsonStream.InvalidInputError';
}

/**
 * Thrown when the input ends inside a JSON value, such as a response body cut off mid-document.
 *
 * @example
 * ```ts
 * import * as JsonStream from '@portable/json-stream';
 * import * as Streams from '@portable/streams';
 *
 * try {
 *   await Streams.toArray(body.pipeThrough(new JsonStream.DecoderStream()));
 * } catch (error) {
 *   if (error instanceof JsonStream.TruncatedError) {
 *     console.log('connection dropped');
 *   }
 * }
 * ```
 */
export class TruncatedError extends Errors.TruncatedError {
  static override readonly kind: string = 'JsonStream.TruncatedError';
  constructor(message: string = 'JSON input ended inside a value.', options?: ErrorOptions) {
    super(message, options);
  }
}

/**
 * Thrown when a value at one of the `paths` grows past `maxLength`.
 *
 * @example
 * ```ts
 * import * as JsonStream from '@portable/json-stream';
 * import * as Streams from '@portable/streams';
 *
 * const matches = body.pipeThrough(
 *   new JsonStream.DecoderStream({ paths: ['$.rows[*]'], maxLength: 100_000 }),
 * );
 * try {
 *   await Streams.toArray(matches);
 * } catch (error) {
 *   if (error instanceof JsonStream.MaxLengthError) {
 *     return new Response(null, { status: 413 });
 *   }
 *   throw error;
 * }
 * ```
 */
export class MaxLengthError extends Errors.MaxLengthError {
  static override readonly kind: string = 'JsonStream.MaxLengthError';
  constructor(options: Errors.MaxLengthError.Options) {
    super({ message: `A value exceeded maxLength of ${options.maxLength}.`, ...options });
  }
}

/**
 * Thrown when a matched value doesn't pass the `schema` option. The message gives the value's
 * path, and `issues` holds the issues from the schema.
 *
 * @example
 * ```ts
 * import * as JsonStream from '@portable/json-stream';
 * import * as Streams from '@portable/streams';
 * import * as z from 'zod';
 *
 * const Row = z.object({ id: z.string() });
 * try {
 *   await Streams.toArray(
 *     body.pipeThrough(new JsonStream.DecoderStream({ paths: ['$.rows[*]'], schema: Row })),
 *   );
 * } catch (error) {
 *   if (error instanceof JsonStream.SchemaError) {
 *     return Response.json(error.issues, { status: 400 });
 *   }
 *   throw error;
 * }
 * ```
 */
export class SchemaError extends Errors.SchemaError {
  static override readonly kind: string = 'JsonStream.SchemaError';
}
