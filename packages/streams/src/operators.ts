/**
 * A `TransformStream` that replaces each chunk with `fn(chunk, index)`. If `fn` returns a
 * promise, the result is passed on once it resolves, and chunks stay in order.
 *
 * @example
 * ```ts
 * import { map } from '@portable/streams'
 * import { LineStream } from '@portable/lines'
 *
 * const records = body.pipeThrough(new LineStream()).pipeThrough(map((line) => JSON.parse(line)))
 * ```
 */
export function map<I, O>(
  fn: (chunk: I, index: number) => O | PromiseLike<O>,
): TransformStream<I, O> {
  let index = 0
  return new TransformStream<I, O>({
    transform(chunk, controller) {
      const result = fn(chunk, index++)
      if (!isPromiseLike(result)) return controller.enqueue(result)
      return Promise.resolve(result).then((value) => controller.enqueue(value))
    },
  })
}

/**
 * A `TransformStream` that passes on only the chunks for which `fn(chunk, index)` returns
 * true. `fn` may return a promise.
 *
 * @example
 * ```ts
 * import { filter } from '@portable/streams'
 *
 * lines.pipeThrough(filter((line) => line !== ''))
 * ```
 */
export function filter<T, S extends T>(
  fn: (chunk: T, index: number) => chunk is S,
): TransformStream<T, S>
export function filter<T>(
  fn: (chunk: T, index: number) => boolean | PromiseLike<boolean>,
): TransformStream<T, T>
export function filter<T>(
  fn: (chunk: T, index: number) => boolean | PromiseLike<boolean>,
): TransformStream<T, T> {
  let index = 0
  return new TransformStream<T, T>({
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
  })
}

/**
 * A `TransformStream` that calls `fn(chunk, index)` for each chunk and passes the chunk on
 * unchanged. If `fn` returns a promise, the chunk waits for it.
 *
 * @example
 * ```ts
 * import { tap } from '@portable/streams'
 *
 * let received = 0
 * body.pipeThrough(tap((chunk) => { received += chunk.byteLength }))
 * ```
 */
export function tap<T>(
  fn: (chunk: T, index: number) => void | PromiseLike<void>,
): TransformStream<T, T> {
  let index = 0
  return new TransformStream<T, T>({
    transform(chunk, controller) {
      const result = fn(chunk, index++)
      if (!isPromiseLike(result)) return controller.enqueue(chunk)
      return Promise.resolve(result).then(() => controller.enqueue(chunk))
    },
  })
}

/**
 * A `TransformStream` that groups chunks into arrays of `size`. The last array holds whatever
 * is left and may be shorter.
 *
 * @example
 * ```ts
 * import { batch } from '@portable/streams'
 *
 * await rows.pipeThrough(batch(500)).pipeTo(new WritableStream({ write: insertMany }))
 * ```
 */
export function batch<T>(size: number): TransformStream<T, T[]> {
  if (!Number.isInteger(size) || size < 1)
    throw new RangeError(`batch size must be a positive integer, got ${size}.`)
  let items: T[] = []
  return new TransformStream<T, T[]>({
    transform(chunk, controller) {
      items.push(chunk)
      if (items.length < size) return
      controller.enqueue(items)
      items = []
    },
    flush(controller) {
      if (items.length > 0) controller.enqueue(items)
    },
  })
}

function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    'then' in value &&
    typeof value.then === 'function'
  )
}
