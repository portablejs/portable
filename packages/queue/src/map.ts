import { checkLimit, isThenable } from './create.js'

export declare namespace map {
  type Options = {
    /** The most calls of `fn` that run at once: a positive integer or `Infinity`. @default Infinity */
    concurrency?: number | undefined
    /** Rejects with `signal.reason`, aborts the `signal` passed to `fn` and stops reading `input`. */
    signal?: AbortSignal | undefined
    /**
     * With `true`, the first error rejects at once, aborts the `signal` passed to `fn` and stops
     * reading `input`. With `false`, every item is mapped, and then the errors reject as one
     * `AggregateError`, in input order.
     * @default true
     */
    stopOnError?: boolean | undefined
  }

  /** The second argument of `fn`. */
  type Context = {
    /** The item's position in `input`. */
    index: number
    /** Aborts when `options.signal` aborts, or when another item fails and `stopOnError` is `true`. */
    signal: AbortSignal
  }
}

/**
 * Calls `fn` on every item of `input`, at most `concurrency` at once, and resolves with the results
 * in input order. `input` can be an async iterable, which is read one item at a time as slots free
 * up. Items are passed to `fn` as they are, without awaiting them.
 *
 * @example
 * ```ts
 * import * as Queue from '@portable/queue'
 *
 * const pages = await Queue.map(
 *   urls,
 *   async (url, { signal }) => (await fetch(url, { signal })).text(),
 *   { concurrency: 4 },
 * )
 * ```
 */
export function map<T, R>(
  input: Iterable<T> | AsyncIterable<T>,
  fn: (item: T, context: map.Context) => R | PromiseLike<R>,
  options: map.Options = {},
): Promise<R[]> {
  const { signal, stopOnError = true } = options
  const concurrency = checkLimit('concurrency', options.concurrency ?? Infinity)
  if (typeof fn !== 'function') throw new TypeError('Expected `fn` to be a function.')

  return new Promise<R[]>((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason)

    const results: R[] = []
    const errors: { index: number; error: unknown }[] = []
    const controller = new AbortController()
    let iterator: Iterator<T> | AsyncIterator<T>
    let isAsync: boolean
    let index = 0
    let running = 0
    let done = false
    let pulling = false
    let settled = false

    try {
      const asyncMethod = (input as AsyncIterable<T>)[Symbol.asyncIterator]
      isAsync = typeof asyncMethod === 'function'
      iterator = isAsync
        ? (input as AsyncIterable<T>)[Symbol.asyncIterator]()
        : (input as Iterable<T>)[Symbol.iterator]()
    } catch (error) {
      return reject(error)
    }

    const onAbort = () => fail(signal!.reason, true)
    signal?.addEventListener('abort', onAbort, { once: true })

    function fail(error: unknown, close: boolean) {
      if (settled) return
      settled = true
      signal?.removeEventListener('abort', onAbort)
      controller.abort(error)
      if (close && !done) {
        done = true
        try {
          const closing = iterator.return?.()
          if (isThenable(closing)) closing.then(undefined, () => {})
        } catch {}
      }
      reject(error)
    }

    function next() {
      while (!settled && !done && !pulling && running < concurrency) {
        if (isAsync) {
          pulling = true
          let result: Promise<IteratorResult<T>>
          try {
            result = Promise.resolve((iterator as AsyncIterator<T>).next())
          } catch (error) {
            done = true
            return fail(error, false)
          }
          result.then(
            (item) => {
              pulling = false
              if (settled) return
              if (item.done) done = true
              else start(item.value)
              next()
            },
            (error: unknown) => {
              pulling = false
              done = true
              fail(error, false)
            },
          )
          return
        }
        let item: IteratorResult<T>
        try {
          item = (iterator as Iterator<T>).next()
        } catch (error) {
          done = true
          return fail(error, false)
        }
        if (item.done) done = true
        else start(item.value)
      }
      if (done && running === 0 && !pulling && !settled) {
        settled = true
        signal?.removeEventListener('abort', onAbort)
        if (errors.length > 0)
          reject(new AggregateError(sortedErrors(errors), 'Some items failed to map.'))
        else resolve(results)
      }
    }

    function start(item: T) {
      const i = index++
      running++
      let result: R | PromiseLike<R>
      try {
        result = fn(item, { index: i, signal: controller.signal })
      } catch (error) {
        running--
        if (stopOnError) fail(error, true)
        else errors.push({ index: i, error })
        return
      }
      if (isThenable(result))
        result.then(
          (value) => {
            results[i] = value
            running--
            next()
          },
          (error: unknown) => {
            running--
            if (stopOnError) return fail(error, true)
            errors.push({ index: i, error })
            next()
          },
        )
      else {
        results[i] = result
        running--
      }
    }

    next()
  })
}

function sortedErrors(errors: { index: number; error: unknown }[]): unknown[] {
  return errors.sort((a, b) => a.index - b.index).map(({ error }) => error)
}
