export declare namespace abortable {
  type Options = {
    /** Errors the stream with `signal.reason` and cancels its source when aborted. */
    signal?: AbortSignal | undefined;
  };

  /** A `Transformer` that may have `cancel`, which TypeScript's DOM types don't have yet. */
  type Transformer<input, output> = globalThis.Transformer<input, output> & {
    cancel?: ((reason: unknown) => void | PromiseLike<void>) | undefined;
  };
}

/**
 * Wraps a transformer so that aborting `signal` errors its `TransformStream` with `signal.reason`.
 * Erroring the stream makes `pipeThrough` cancel the source. The listener is removed when the
 * stream ends, is cancelled, or fails because the transformer threw. Without a signal, the
 * transformer is returned unchanged.
 *
 * @example
 * ```ts
 * import * as Streams from '@portable/streams';
 *
 * class UpperCaseStream extends TransformStream<string, string> {
 *   constructor(options: { signal?: AbortSignal | undefined } = {}) {
 *     super(
 *       Streams.abortable(
 *         { transform: (chunk, controller) => controller.enqueue(chunk.toUpperCase()) },
 *         options,
 *       ),
 *     );
 *   }
 * }
 *
 * text.pipeThrough(new UpperCaseStream({ signal: AbortSignal.timeout(5000) }));
 * ```
 */
export function abortable<input, output>(
  transformer: abortable.Transformer<input, output>,
  options: abortable.Options = {},
): abortable.Transformer<input, output> {
  const { signal } = options;
  if (!signal) {
    return transformer;
  }
  let onAbort = () => {};
  const done = () => signal.removeEventListener('abort', onAbort);
  // A transformer that throws or rejects errors the stream without calling flush or cancel, so the
  // listener is removed here too.
  const fail = (error: unknown): never => {
    done();
    throw error;
  };
  const settle = (result: void | PromiseLike<void>) =>
    result === undefined ? result : Promise.resolve(result).catch(fail);
  const wrapped: abortable.Transformer<input, output> = {
    start(controller) {
      if (signal.aborted) {
        return controller.error(signal.reason);
      }
      onAbort = () => controller.error(signal.reason);
      signal.addEventListener('abort', onAbort, { once: true });
      try {
        return settle(transformer.start?.(controller));
      } catch (error) {
        return fail(error);
      }
    },
    flush(controller) {
      done();
      return transformer.flush?.(controller);
    },
    cancel(reason: unknown) {
      done();
      return transformer.cancel?.(reason);
    },
  };
  if (transformer.transform) {
    wrapped.transform = (chunk, controller) => {
      try {
        return settle(transformer.transform!(chunk, controller));
      } catch (error) {
        return fail(error);
      }
    };
  }
  return wrapped;
}
