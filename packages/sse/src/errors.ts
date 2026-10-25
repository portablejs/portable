import * as Errors from '@portable/errors';

/**
 * Thrown when a line or an event's `data` grows past `maxLength`.
 *
 * @example
 * ```ts
 * import * as Sse from '@portable/sse';
 *
 * try {
 *   Sse.decode(`data: ${'x'.repeat(2000)}\n\n`, { maxLength: 1000 });
 * } catch (error) {
 *   if (error instanceof Sse.MaxLengthError) {
 *     console.log(`longer than ${error.maxLength}`);
 *   }
 * }
 * ```
 */
export class MaxLengthError extends Errors.MaxLengthError {
  static override readonly kind: string = 'Sse.MaxLengthError';
  constructor(options: Errors.MaxLengthError.Options) {
    super({
      message: `Event stream line or data exceeded maxLength of ${options.maxLength}.`,
      ...options,
    });
  }
}

/**
 * Thrown by `connect` for a response that isn't an event stream.
 *
 * @example
 * ```ts
 * import * as Sse from '@portable/sse';
 *
 * const reader = Sse.connect('https://example.com/events').getReader();
 * try {
 *   await reader.read();
 * } catch (error) {
 *   if (error instanceof Sse.ResponseError) {
 *     console.log(error.response.status);
 *   }
 * }
 * ```
 */
export class ResponseError extends Errors.ResponseError {
  static override readonly kind: string = 'Sse.ResponseError';
}

/**
 * Thrown by `encode` and `EncoderStream` for a field that can't be written.
 *
 * @example
 * ```ts
 * import * as Sse from '@portable/sse';
 *
 * try {
 *   Sse.encode({ event: 'a\nb', data: 'x' });
 * } catch (error) {
 *   if (error instanceof Sse.InvalidInputError) {
 *     console.log(error.message);
 *   }
 * }
 * ```
 */
export class InvalidInputError extends Errors.InvalidInputError {
  static override readonly kind: string = 'Sse.InvalidInputError';
}
