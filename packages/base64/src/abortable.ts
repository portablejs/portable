/**
 * Wraps a transformer so that aborting `signal` errors the stream with `signal.reason`. Erroring
 * the writable side makes `pipeThrough` cancel the source. The listener is removed when the
 * stream ends or is cancelled.
 */
export function abortable<input, output>(
  transformer: Cancellable<input, output>,
  signal: AbortSignal | undefined,
): Cancellable<input, output> {
  if (!signal) return transformer
  let onAbort = () => {}
  const done = () => signal.removeEventListener('abort', onAbort)
  return {
    ...transformer,
    start(controller) {
      if (signal.aborted) return controller.error(signal.reason)
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

// TypeScript's DOM types don't have Transformer.cancel yet. Runtimes without it never call it.
type Cancellable<input, output> = Transformer<input, output> & {
  cancel?: ((reason: unknown) => void | PromiseLike<void>) | undefined
}
