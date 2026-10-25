import * as Errors from '@portable/errors';

/**
 * Thrown when a line grows past `maxLength` and `overflow` is `'error'`.
 *
 * @example
 * ```ts
 * import * as Lines from '@portable/lines';
 * import * as Streams from '@portable/streams';
 *
 * const lines = response.body!.pipeThrough(new Lines.DecoderStream({ maxLength: 10_000 }));
 * try {
 *   for await (const line of Streams.toAsyncIterable(lines)) {
 *     console.log(line);
 *   }
 * } catch (error) {
 *   if (error instanceof Lines.MaxLengthError) {
 *     console.log(`a line exceeded ${error.maxLength}`);
 *   }
 * }
 * ```
 */
export class MaxLengthError extends Errors.MaxLengthError {
  static override readonly kind: string = 'Lines.MaxLengthError';
  constructor(options: Errors.MaxLengthError.Options) {
    super({ message: `Line exceeded maxLength of ${options.maxLength}.`, ...options });
  }
}
