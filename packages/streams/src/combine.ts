import { MaxBytesError, byteLength } from './bytes.js'
import { fromIterable } from './iterable.js'
import { type Source, assertSource, isReadableStream } from './source.js'

/**
 * Joins sources end to end: every chunk of the first source, then every chunk of the next.
 * A source is read only once the one before it has ended. An error in any source errors the
 * output and cancels the sources not yet read, and cancelling the output cancels them all.
 *
 * @example
 * ```ts
 * import * as Streams from '@portable/streams'
 *
 * const body = Streams.concat([header], file.stream(), [footer])
 * ```
 */
export function concat<T>(...sources: readonly Source<T>[]): ReadableStream<T> {
  const streams = sources.map(toStream)
  let index = 0
  let reader: ReadableStreamDefaultReader<T> | undefined
  const cancelRest = (reason: unknown) =>
    Promise.all(streams.slice(index + 1).map((stream) => stream.cancel(reason).catch(() => {})))
  return new ReadableStream<T>(
    {
      async pull(controller) {
        for (; index < streams.length; index++) {
          reader ??= streams[index]!.getReader()
          let result: ReadableStreamReadResult<T>
          try {
            result = await reader.read()
          } catch (error) {
            await cancelRest(error)
            throw error
          }
          if (!result.done) return controller.enqueue(result.value)
          reader.releaseLock()
          reader = undefined
        }
        controller.close()
      },
      async cancel(reason) {
        await Promise.all([
          reader ? reader.cancel(reason) : streams[index]?.cancel(reason),
          cancelRest(reason),
        ])
      },
    },
    { highWaterMark: 0 },
  )
}

/**
 * Interleaves sources: reads all of them at once and passes each chunk on as it arrives. The
 * output ends when every source has ended. An error in any source errors the output and
 * cancels the others, and cancelling the output cancels them all.
 *
 * @example
 * ```ts
 * import * as Streams from '@portable/streams'
 *
 * const events = Streams.merge(serverA.body!, serverB.body!)
 * ```
 */
export function merge<T>(...sources: readonly Source<T>[]): ReadableStream<T> {
  const readers = new Set(sources.map((source) => toStream(source).getReader()))
  const idle = new Set(readers)
  let wake: (() => void) | undefined
  let finished = false
  const cancelAll = (reason: unknown) =>
    Promise.all([...readers].map((reader) => reader.cancel(reason).catch(() => {})))

  const read = (
    reader: ReadableStreamDefaultReader<T>,
    controller: ReadableStreamDefaultController<T>,
  ) => {
    idle.delete(reader)
    reader.read().then(
      (result) => {
        if (finished) return
        if (result.done) {
          readers.delete(reader)
          if (readers.size === 0) {
            finished = true
            controller.close()
          }
        } else {
          controller.enqueue(result.value)
          idle.add(reader)
        }
        wake?.()
      },
      (error: unknown) => {
        if (finished) return
        finished = true
        readers.delete(reader)
        controller.error(error)
        void cancelAll(error)
        wake?.()
      },
    )
  }

  return new ReadableStream<T>(
    {
      start(controller) {
        if (readers.size === 0) {
          finished = true
          controller.close()
        }
      },
      pull(controller) {
        for (const reader of idle) read(reader, controller)
        return new Promise((resolve) => {
          wake = resolve
        })
      },
      async cancel(reason) {
        finished = true
        await cancelAll(reason)
      },
    },
    { highWaterMark: 0 },
  )
}

/**
 * A `TransformStream` that passes chunks through unchanged and fails with `MaxBytesError`
 * once more than `maxBytes` bytes have passed. The chunk that crosses the limit is not
 * passed on, and the source is cancelled. String chunks count as their UTF-8 length.
 *
 * @example
 * ```ts
 * import * as Streams from '@portable/streams'
 *
 * await request.body!.pipeThrough(Streams.limitBytes(1_000_000)).pipeTo(upload)
 * ```
 */
export function limitBytes<T extends Uint8Array | string>(maxBytes: number): TransformStream<T, T> {
  let length = 0
  return new TransformStream<T, T>({
    transform(chunk, controller) {
      length += byteLength(chunk)
      if (length > maxBytes) throw new MaxBytesError(maxBytes)
      controller.enqueue(chunk)
    },
  })
}

function toStream<T>(source: Source<T>): ReadableStream<T> {
  assertSource(source)
  return isReadableStream(source) ? source : fromIterable(source)
}
