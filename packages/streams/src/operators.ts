import { abortable } from './abortable.js'

export declare namespace map {
  type Options = {
    /** Errors the stream with `signal.reason` and cancels its source when aborted. */
    signal?: AbortSignal | undefined
  }
}

/**
 * A `TransformStream` that replaces each chunk with `fn(chunk, index)`. If `fn` returns a
 * promise, the result is passed on once it resolves, and chunks stay in order.
 *
 * @example
 * ```ts
 * import * as Streams from '@portable/streams'
 * import * as Lines from '@portable/lines'
 *
 * const records = body.pipeThrough(new Lines.DecoderStream()).pipeThrough(Streams.map((line) => JSON.parse(line)))
 * ```
 */
export function map<I, O>(
  fn: (chunk: I, index: number) => O | PromiseLike<O>,
  options: map.Options = {},
): TransformStream<I, O> {
  let index = 0
  return new TransformStream<I, O>(
    abortable(
      {
        transform(chunk, controller) {
          const result = fn(chunk, index++)
          if (!isPromiseLike(result)) return controller.enqueue(result)
          return Promise.resolve(result).then((value) => controller.enqueue(value))
        },
      },
      options.signal,
    ),
  )
}

export declare namespace filter {
  type Options = {
    /** Errors the stream with `signal.reason` and cancels its source when aborted. */
    signal?: AbortSignal | undefined
  }
}

/**
 * A `TransformStream` that passes on only the chunks for which `fn(chunk, index)` returns
 * true. `fn` may return a promise.
 *
 * @example
 * ```ts
 * import * as Streams from '@portable/streams'
 *
 * lines.pipeThrough(Streams.filter((line) => line !== ''))
 * ```
 */
export function filter<T, S extends T>(
  fn: (chunk: T, index: number) => chunk is S,
  options?: filter.Options,
): TransformStream<T, S>
export function filter<T>(
  fn: (chunk: T, index: number) => boolean | PromiseLike<boolean>,
  options?: filter.Options,
): TransformStream<T, T>
export function filter<T>(
  fn: (chunk: T, index: number) => boolean | PromiseLike<boolean>,
  options: filter.Options = {},
): TransformStream<T, T> {
  let index = 0
  return new TransformStream<T, T>(
    abortable(
      {
        transform(chunk, controller) {
          const keep = fn(chunk, index++)
          if (!isPromiseLike(keep)) {
            if (keep) controller.enqueue(chunk)
            return
          }
          return Promise.resolve(keep).then((value) => {
            if (value) controller.enqueue(chunk)
          })
        },
      },
      options.signal,
    ),
  )
}

export declare namespace tap {
  type Options = {
    /** Errors the stream with `signal.reason` and cancels its source when aborted. */
    signal?: AbortSignal | undefined
  }
}

/**
 * A `TransformStream` that calls `fn(chunk, index)` for each chunk and passes the chunk on
 * unchanged. If `fn` returns a promise, the chunk waits for it.
 *
 * @example
 * ```ts
 * import * as Streams from '@portable/streams'
 *
 * let received = 0
 * body.pipeThrough(Streams.tap((chunk) => { received += chunk.byteLength }))
 * ```
 */
export function tap<T>(
  fn: (chunk: T, index: number) => void | PromiseLike<void>,
  options: tap.Options = {},
): TransformStream<T, T> {
  let index = 0
  return new TransformStream<T, T>(
    abortable(
      {
        transform(chunk, controller) {
          const result = fn(chunk, index++)
          if (!isPromiseLike(result)) return controller.enqueue(chunk)
          return Promise.resolve(result).then(() => controller.enqueue(chunk))
        },
      },
      options.signal,
    ),
  )
}

export declare namespace batch {
  type Options = {
    /** Errors the stream with `signal.reason` and cancels its source when aborted. */
    signal?: AbortSignal | undefined
  }
}

/**
 * A `TransformStream` that groups chunks into arrays of `size`. The last array holds whatever
 * is left and may be shorter.
 *
 * @example
 * ```ts
 * import * as Streams from '@portable/streams'
 *
 * await rows.pipeThrough(Streams.batch(500)).pipeTo(new WritableStream({ write: insertMany }))
 * ```
 */
export function batch<T>(size: number, options: batch.Options = {}): TransformStream<T, T[]> {
  if (!Number.isInteger(size) || size < 1)
    throw new RangeError(`batch size must be a positive integer, got ${size}.`)
  let items: T[] = []
  return new TransformStream<T, T[]>(
    abortable(
      {
        transform(chunk, controller) {
          items.push(chunk)
          if (items.length < size) return
          controller.enqueue(items)
          items = []
        },
        flush(controller) {
          if (items.length > 0) controller.enqueue(items)
        },
      },
      options.signal,
    ),
  )
}

function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    'then' in value &&
    typeof value.then === 'function'
  )
}
