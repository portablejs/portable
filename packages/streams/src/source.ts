/** Anything the collectors and combinators read from: a `ReadableStream`, an async iterable, or an iterable. */
export type Source<chunk> = ReadableStream<chunk> | AsyncIterable<chunk> | Iterable<chunk>;

export function isReadableStream(value: unknown): value is ReadableStream<unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    'getReader' in value &&
    typeof value.getReader === 'function'
  );
}

export function assertSource(source: unknown): void {
  if (
    typeof source === 'object' &&
    source !== null &&
    (Symbol.asyncIterator in source || Symbol.iterator in source || isReadableStream(source))
  ) {
    return;
  }
  throw new TypeError('The source must be a ReadableStream, an async iterable or an iterable.');
}

export async function forEach<value>(
  source: Source<value>,
  onChunk: (chunk: value) => void,
  signal?: AbortSignal,
): Promise<void> {
  assertSource(source);
  if (!isReadableStream(source)) {
    return forEachIterable(source, onChunk, signal);
  }
  const reader = source.getReader();
  const onAbort = () => void reader.cancel(signal!.reason).catch(() => {});
  if (signal?.aborted) {
    onAbort();
  }
  signal?.addEventListener('abort', onAbort, { once: true });
  try {
    for (;;) {
      const { done, value } = await reader.read();
      signal?.throwIfAborted();
      if (done) {
        return;
      }
      try {
        onChunk(value);
      } catch (error) {
        await reader.cancel(error).catch(() => {});
        throw error;
      }
    }
  } finally {
    signal?.removeEventListener('abort', onAbort);
    reader.releaseLock();
  }
}

async function forEachIterable<chunk>(
  source: AsyncIterable<chunk> | Iterable<chunk>,
  onChunk: (chunk: chunk) => void,
  signal: AbortSignal | undefined,
): Promise<void> {
  if (!signal) {
    for await (const chunk of source) {
      onChunk(chunk);
    }
    return;
  }
  const iterator =
    Symbol.asyncIterator in source ? source[Symbol.asyncIterator]() : source[Symbol.iterator]();
  let onAbort = () => {};
  const aborted = new Promise<never>((_, reject) => {
    onAbort = () => reject(signal.reason);
  });
  aborted.catch(() => {});
  signal.addEventListener('abort', onAbort, { once: true });
  let done = false;
  try {
    while (!done) {
      signal.throwIfAborted();
      const result = await Promise.race([iterator.next(), aborted]);
      done = result.done === true;
      if (!done) {
        onChunk(await Promise.race([result.value, aborted]));
      }
    }
  } finally {
    signal.removeEventListener('abort', onAbort);
    if (!done) {
      void Promise.resolve(iterator.return?.()).catch(() => {});
    }
  }
}
