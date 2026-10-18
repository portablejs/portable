export function errorOnAbort(
  signal: AbortSignal | undefined,
  controller: TransformStreamDefaultController<unknown>,
): () => void {
  if (!signal) return () => {}
  const onAbort = () => controller.error(signal.reason)
  if (signal.aborted) onAbort()
  else signal.addEventListener('abort', onAbort, { once: true })
  return () => signal.removeEventListener('abort', onAbort)
}
