const maxTimeout = 2 ** 31 - 1

/**
 * A debounced or throttled function. Calls that arrive while an invocation is waiting share it,
 * and each one returns a promise of that invocation's result.
 */
export type Debounced<Args extends unknown[], Result, This = unknown> = {
  (this: This, ...args: Args): Promise<Awaited<Result>>
  /**
   * Drops the waiting invocation. Calls waiting for it reject with an `AbortError` `DOMException`.
   * Later calls work as usual.
   */
  cancel(): void
  /**
   * Runs the waiting invocation now and resolves with its result. Resolves with `undefined` when
   * nothing is waiting.
   */
  flush(): Promise<Awaited<Result> | undefined>
  /** `true` while the function waits out `ms` after a call. */
  readonly pending: boolean
}

export declare namespace debounce {
  type Options = {
    /** Invoke on the first call of a burst. @default false */
    leading?: boolean | undefined
    /** Invoke `ms` after the last call of a burst, with that call's arguments. @default true */
    trailing?: boolean | undefined
    /** Longest time, in ms, that a call waits before an invocation, however often calls arrive. */
    maxWait?: number | undefined
    /** Cancels the waiting invocation, as `cancel()` does but rejecting with `signal.reason`, and disables the function. */
    signal?: AbortSignal | undefined
  }
}

/**
 * Wraps `fn` so that a burst of calls invokes it once, `ms` after the last call, with the last call's
 * arguments. Every call in the burst resolves with that invocation's result.
 *
 * @example
 * ```ts
 * import * as Timers from '@portable/timers'
 *
 * const save = Timers.debounce((text: string) => fetch('/draft', { method: 'PUT', body: text }), 500)
 * editor.addEventListener('input', () => save(editor.value))
 * const response = await save(editor.value) // the response of the save that this call shares
 * ```
 */
export function debounce<Args extends unknown[], Result, This = unknown>(
  fn: (this: This, ...args: Args) => Result,
  ms: number,
  options: debounce.Options = {},
): Debounced<Args, Result, This> {
  const { leading = false, trailing = true, maxWait, signal } = options
  if (!leading && !trailing)
    throw new RangeError('Expected `leading`, `trailing` or both to be true.')
  const wait = checkWait('ms', ms)
  const maxing = maxWait !== undefined
  const max = maxing ? Math.max(checkWait('maxWait', maxWait), wait) : 0

  let batch: Batch | undefined
  let lastCall: { args: Args; self: This } | undefined
  let lastCallTime: number | undefined
  let lastInvokeTime = 0
  let result: unknown
  let timer: ReturnType<typeof setTimeout> | undefined

  const onAbort = () => cancel(signal!.reason)

  function settle(): void {
    batch?.resolve(result)
    batch = undefined
  }

  function invoke(time: number): void {
    const { args, self } = lastCall!
    const settling = batch
    batch = undefined
    lastCall = undefined
    lastInvokeTime = time
    try {
      result = fn.apply(self, args)
    } catch (error) {
      const rejected = Promise.reject(error)
      rejected.catch(() => {})
      result = rejected
    }
    settling?.resolve(result)
  }

  function startTimer(ms: number): void {
    if (timer === undefined) signal?.addEventListener('abort', onAbort, { once: true })
    timer = setTimeout(timerExpired, ms)
  }

  function stopTimer(): void {
    clearTimeout(timer)
    timer = undefined
    signal?.removeEventListener('abort', onAbort)
  }

  function shouldInvoke(time: number): boolean {
    if (lastCallTime === undefined) return true
    const sinceCall = time - lastCallTime
    return sinceCall >= wait || sinceCall < 0 || (maxing && time - lastInvokeTime >= max)
  }

  function timerExpired(): void {
    const time = performance.now()
    if (shouldInvoke(time)) return trailingEdge()
    const waiting = wait - (time - lastCallTime!)
    startTimer(maxing ? Math.min(waiting, max - (time - lastInvokeTime)) : waiting)
  }

  function trailingEdge(): void {
    stopTimer()
    if (trailing && lastCall) invoke(performance.now())
    else {
      lastCall = undefined
      settle()
    }
    if (timer === undefined) result = undefined
  }

  function cancel(reason: unknown = new DOMException('The call was cancelled.', 'AbortError')) {
    stopTimer()
    lastInvokeTime = 0
    lastCall = lastCallTime = result = undefined
    batch?.promise.catch(() => {})
    batch?.reject(reason)
    batch = undefined
  }

  function debounced(this: This, ...args: Args): Promise<unknown> {
    if (signal?.aborted) return Promise.reject(signal.reason)
    batch ??= deferred()
    const { promise } = batch
    const time = performance.now()
    const invoking = shouldInvoke(time)
    lastCall = { args, self: this }
    lastCallTime = time
    if (invoking && timer === undefined) {
      lastInvokeTime = time
      startTimer(wait)
      if (leading) invoke(time)
    } else if (invoking && maxing) {
      clearTimeout(timer)
      startTimer(wait)
      invoke(time)
    } else if (timer === undefined) startTimer(wait)
    if (!trailing) settle()
    return promise
  }

  return Object.defineProperties(debounced, {
    cancel: { value: () => cancel() },
    flush: {
      value: () => {
        if (timer === undefined) return Promise.resolve(undefined)
        batch ??= deferred()
        const { promise } = batch
        trailingEdge()
        return promise
      },
    },
    pending: { get: () => timer !== undefined },
  }) as unknown as Debounced<Args, Result, This>
}

type Batch = {
  promise: Promise<unknown>
  resolve: (value: unknown) => void
  reject: (reason: unknown) => void
}

function deferred(): Batch {
  let resolve!: Batch['resolve']
  let reject!: Batch['reject']
  const promise = new Promise<unknown>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

function checkWait(name: string, ms: number): number {
  if (!(ms <= maxTimeout))
    throw new RangeError(`Expected \`${name}\` to be a number up to ${maxTimeout}.`)
  return Math.max(0, ms)
}
