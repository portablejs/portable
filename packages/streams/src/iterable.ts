type NativeFrom = <chunk>(
  iterable: Iterable<chunk | PromiseLike<chunk>> | AsyncIterable<chunk>,
) => ReadableStream<chunk>
type NativeValues<chunk> = (options: { preventCancel: boolean }) => AsyncIterableIterator<chunk>

/**
 * Creates a `ReadableStream` from an iterable or async iterable, such as an array or a
 * generator. The stream pulls one value each time its reader asks for one, so a slow reader
 * slows the generator down. Cancelling the stream calls the iterator's `return()`, which runs
 * the generator's `finally` blocks. Uses `ReadableStream.from` where the runtime has it.
 *
 * @example
 * ```ts
 * import * as Streams from '@portable/streams'
 *
 * async function* countdown() {
 *   for (let i = 3; i > 0; i--) yield `${i}\n`
 * }
 *
 * return new Response(Streams.fromIterable(countdown()).pipeThrough(new TextEncoderStream()))
 * ```
 */
export function fromIterable<chunk>(
  iterable: Iterable<chunk | PromiseLike<chunk>> | AsyncIterable<chunk>,
): ReadableStream<chunk> {
  const native: { from?: NativeFrom; prototype: unknown } = ReadableStream
  if (typeof native.from === 'function') return native.from(iterable)
  return pull(asyncIterator(iterable))
}

export declare namespace toAsyncIterable {
  type Options = {
    /** Release the stream's lock instead of cancelling it when the loop exits early. @default false */
    preventCancel?: boolean | undefined
  }
}

/**
 * Returns an async iterator over a `ReadableStream`, for `for await` loops in runtimes whose
 * streams aren't async iterable yet. Leaving the loop early with `break`, `return` or a throw
 * cancels the stream, or with `preventCancel: true` only releases its lock. Uses the
 * stream's own `values()` where the runtime has it.
 *
 * @example
 * ```ts
 * import * as Streams from '@portable/streams'
 *
 * for await (const chunk of Streams.toAsyncIterable(response.body!)) {
 *   if (done(chunk)) break // cancels the response body
 * }
 * ```
 */
export function toAsyncIterable<chunk>(
  stream: ReadableStream<chunk>,
  options: toAsyncIterable.Options = {},
): AsyncIterableIterator<chunk> {
  const { preventCancel = false } = options
  const native: { values?: NativeValues<chunk> } = stream
  if (typeof native.values === 'function') return native.values({ preventCancel })
  return iterate(stream.getReader(), preventCancel)
}

/**
 * Builds a transform from an async generator function. The function receives the input
 * chunks as an async iterable and yields output chunks, so state that spans chunks is a local
 * variable. Use the result with `pipeThrough`.
 *
 * Output is pulled, so the generator runs only as fast as the reader reads. An error thrown
 * by the generator errors the output and cancels the input. Cancelling the output ends the
 * input iterable and calls the generator's `return()`, so its `finally` blocks run.
 *
 * @example
 * ```ts
 * import * as Streams from '@portable/streams'
 *
 * const sum = Streams.transform(async function* (source: AsyncIterable<number>) {
 *   let total = 0
 *   for await (const n of source) yield (total += n)
 * })
 *
 * numbers.pipeThrough(sum)
 * ```
 */
export function transform<input, output>(
  fn: (source: AsyncIterable<input>) => AsyncIterable<output>,
  options: transform.Options = {},
): ReadableWritablePair<output, input> {
  const input = new TransformStream<input, input>()
  const reader = input.readable.getReader()
  const output = asyncIterator(fn(iterate(reader, true)))
  const stop = (reason: unknown) =>
    reader
      .cancel(reason)
      .catch(() => input.readable.cancel(reason))
      .catch(() => {})
  return { readable: pull(output, stop, options.signal), writable: input.writable }
}

export declare namespace transform {
  type Options = {
    /** Errors the output with `signal.reason`, cancels the input and ends the generator when aborted. */
    signal?: AbortSignal | undefined
  }
}

function asyncIterator<chunk>(
  iterable: Iterable<chunk | PromiseLike<chunk>> | AsyncIterable<chunk>,
): AsyncIterator<chunk> {
  if (Symbol.asyncIterator in iterable) return iterable[Symbol.asyncIterator]()
  return (async function* () {
    yield* iterable
  })()
}

function pull<chunk>(
  iterator: AsyncIterator<chunk>,
  stop?: (reason: unknown) => Promise<void>,
  signal?: AbortSignal,
): ReadableStream<chunk> {
  let aborted = false
  let abort = () => {}
  const release = () => signal?.removeEventListener('abort', abort)
  return new ReadableStream<chunk>(
    {
      start(controller) {
        if (!signal) return
        abort = () => {
          aborted = true
          controller.error(signal.reason)
          void stop?.(signal.reason)
          void Promise.resolve(iterator.return?.(signal.reason)).catch(() => {})
        }
        if (signal.aborted) return abort()
        signal.addEventListener('abort', abort, { once: true })
      },
      async pull(controller) {
        let result: IteratorResult<chunk>
        try {
          result = await iterator.next()
        } catch (error) {
          release()
          if (aborted) return
          await stop?.(error)
          throw error
        }
        if (aborted) return
        if (!result.done) return controller.enqueue(result.value)
        release()
        controller.close()
        await stop?.(undefined)
      },
      async cancel(reason) {
        release()
        await stop?.(reason)
        await iterator.return?.(reason)
      },
    },
    { highWaterMark: 0 },
  )
}

async function* iterate<chunk>(
  reader: ReadableStreamDefaultReader<chunk>,
  preventCancel: boolean,
): AsyncGenerator<chunk, undefined> {
  let finished = false
  try {
    for (;;) {
      let result: ReadableStreamReadResult<chunk>
      try {
        result = await reader.read()
      } catch (error) {
        finished = true
        throw error
      }
      if (result.done) {
        finished = true
        return undefined
      }
      yield result.value
    }
  } finally {
    if (!finished && !preventCancel) await reader.cancel()
    reader.releaseLock()
  }
}
