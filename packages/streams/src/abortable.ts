export declare namespace abortable {
  type Options = {
    /** Errors the stream with `signal.reason` and cancels its source when aborted. */
    signal?: AbortSignal | undefined
  }

  /** A `Transformer` that may have `cancel`, which TypeScript's DOM types don't have yet. */
  type Transformer<input, output> = globalThis.Transformer<input, output> & {
    cancel?: ((reason: unknown) => void | PromiseLike<void>) | undefined
  }
}

/**
 * Wraps a transformer so that aborting `signal` errors its `TransformStream` with `signal.reason`.
 * Erroring the stream makes `pipeThrough` cancel the source. The listener is removed when the
 * stream ends or is cancelled. Without a signal, the transformer is returned unchanged.
 *
 * @example
 * ```ts
 * import * as Streams from '@portable/streams'
 *
 * class UpperCaseStream extends TransformStream<string, string> {
 *   constructor(options: { signal?: AbortSignal | undefined } = {}) {
 *     super(
 *       Streams.abortable(
 *         { transform: (chunk, controller) => controller.enqueue(chunk.toUpperCase()) },
 *         options,
 *       ),
 *     )
 *   }
 * }
 *
 * text.pipeThrough(new UpperCaseStream({ signal: AbortSignal.timeout(5000) }))
 * ```
 */
export function abortable<input, output>(
  transformer: abortable.Transformer<input, output>,
  options: abortable.Options = {},
): abortable.Transformer<input, output> {
  const { signal } = options
  if (!signal) {
    return transformer
  }
  let onAbort = () => {}
  const done = () => signal.removeEventListener('abort', onAbort)
  return {
    ...transformer,
    start(controller) {
      if (signal.aborted) {
        return controller.error(signal.reason)
      }
      onAbort = () => controller.error(signal.reason)
      signal.addEventListener('abort', onAbort, { once: true })
      return transformer.start?.(controller)
    },
    flush(controller) {
      done()
      return transformer.flush?.(controller)
    },
    cancel(reason: unknown) {
      done()
      return transformer.cancel?.(reason)
    },
  }
}
