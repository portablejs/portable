/** Anything the collectors and combinators read from: a `ReadableStream`, an async iterable or an iterable. */
export type Source<T> = ReadableStream<T> | AsyncIterable<T> | Iterable<T>

export function isReadableStream(value: unknown): value is ReadableStream<unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    'getReader' in value &&
    typeof value.getReader === 'function'
  )
}

export function assertSource(source: unknown): void {
  if (
    typeof source === 'object' &&
    source !== null &&
    (Symbol.asyncIterator in source || Symbol.iterator in source || isReadableStream(source))
  )
    return
  throw new TypeError('The source must be a ReadableStream, an async iterable or an iterable.')
}

export async function forEach<T>(source: Source<T>, onChunk: (chunk: T) => void): Promise<void> {
  assertSource(source)
  if (!isReadableStream(source)) {
    for await (const chunk of source) onChunk(chunk)
    return
  }
  const reader = source.getReader()
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) return
      try {
        onChunk(value)
      } catch (error) {
        await reader.cancel(error).catch(() => {})
        throw error
      }
    }
  } finally {
    reader.releaseLock()
  }
}
