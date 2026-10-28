import * as Errors from '@portable/errors';

/**
 * Thrown when a stream has more bytes than `maxBytes` allows.
 *
 * @example
 * ```ts
 * import * as Streams from '@portable/streams';
 *
 * const response = await fetch('https://example.com/upload');
 * try {
 *   await Streams.toBytes(response.body!, { maxBytes: 1_000_000 });
 * } catch (error) {
 *   if (error instanceof Streams.MaxBytesError) {
 *     console.log(`larger than ${error.maxBytes} bytes`);
 *   }
 * }
 * ```
 */
export class MaxBytesError extends Errors.MaxBytesError {
  static override readonly kind: string = 'Streams.MaxBytesError';
  constructor(options: Errors.MaxBytesError.Options) {
    super({ message: `Stream exceeded maxBytes of ${options.maxBytes}.`, ...options });
  }
}

/**
 * Thrown by `toJson` when the parsed value doesn't pass the `schema` option. `issues` holds the
 * issues from the schema.
 *
 * @example
 * ```ts
 * import * as Streams from '@portable/streams';
 * import * as z from 'zod';
 *
 * const User = z.object({ name: z.string() });
 * try {
 *   const user = await Streams.toJson(request.body!, { schema: User, maxBytes: 100_000 });
 * } catch (error) {
 *   if (error instanceof Streams.SchemaError) {
 *     return Response.json(error.issues, { status: 400 });
 *   }
 *   throw error;
 * }
 * ```
 */
export class SchemaError extends Errors.SchemaError {
  static override readonly kind: string = 'Streams.SchemaError';
}
