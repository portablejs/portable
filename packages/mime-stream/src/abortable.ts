/**
 * Wraps a transformer so that aborting `signal` errors the stream with `signal.reason`. Erroring
 * the writable side makes `pipeThrough` cancel the source. The listener is removed when the
 * stream ends or is cancelled.
 */
export function abortable<I, O>(
  transformer: Cancellable<I, O>,
  signal: AbortSignal | undefined,
): Cancellable<I, O> {
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
type Cancellable<I, O> = Transformer<I, O> & {
  cancel?: ((reason: unknown) => void | PromiseLike<void>) | undefined
}
