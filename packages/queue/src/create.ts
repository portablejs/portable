/** What a task receives when it starts. */
export type Context = {
  /** Aborts when the task's `signal` or the queue's `signal` aborts. */
  signal: AbortSignal
}

/** A function the queue calls when a slot is free. It can return a value or a promise. */
export type Task<T> = (context: Context) => T | PromiseLike<T>

/** A queue made by `create`. */
export type Queue = {
  /**
   * Adds a task and resolves or rejects with its result. Rejects with the abort reason when
   * `options.signal` or the queue's `signal` aborts, and with an `AbortError` `DOMException` when
   * `clear()` removes the task before it starts.
   */
  add: <T>(task: Task<T>, options?: Queue.AddOptions) => Promise<T>
  /** Resolves when no task is waiting or running. It never rejects. */
  idle: () => Promise<void>
  /** Stops starting tasks. Running tasks continue. */
  pause: () => void
  /** Starts tasks again after `pause()`. */
  resume: () => void
  /** Removes every waiting task and rejects its promise with an `AbortError`. Running tasks continue. */
  clear: () => void
  /** The number of tasks waiting to start. */
  readonly size: number
  /** The number of tasks running. */
  readonly pending: number
  /** Whether `pause()` was called without a `resume()` after it. */
  readonly paused: boolean
  /** The most tasks that run at once. Raising it starts waiting tasks at once. */
  concurrency: number
}

export declare namespace Queue {
  type AddOptions = {
    /** Tasks with a higher priority start first. Tasks with equal priority start in the order they were added. @default 0 */
    priority?: number | undefined
    /**
     * Removes the task if it is still waiting, and aborts the task's `signal` if it is running.
     * Either way, the promise from `add` rejects with `signal.reason` at once. A running task keeps
     * its slot until it settles.
     */
    signal?: AbortSignal | undefined
  }
}

export declare namespace create {
  type Options = {
    /** The most tasks that run at once: a positive integer or `Infinity`. @default Infinity */
    concurrency?: number | undefined
    /** The most tasks that start in any `interval` milliseconds. Needs `interval`. @default Infinity */
    intervalCap?: number | undefined
    /** The length of the sliding window for `intervalCap`, in milliseconds. `0` turns rate limiting off. @default 0 */
    interval?: number | undefined
    /** Rejects every waiting and running task with `signal.reason`, and every task added later. */
    signal?: AbortSignal | undefined
  }
}

type Entry = {
  task: Task<unknown>
  priority: number
  context: Context
  ownSignal: AbortSignal | undefined
  resolve: (value: unknown) => void
  reject: (reason: unknown) => void
  onAbort: (() => void) | undefined
  state: State
  begin: () => void
  promise: Promise<unknown>
}

type State = 'waiting' | 'running' | 'settled'

const neverAborted = new AbortController().signal
const noop = () => {}
const maxDelay = 2 ** 31 - 1

/**
 * Creates a queue that runs at most `concurrency` tasks at once, in priority order, optionally
 * starting no more than `intervalCap` tasks in any `interval` milliseconds.
 *
 * @example
 * ```ts
 * import * as Queue from '@portable/queue'
 *
 * const queue = Queue.create({ concurrency: 4 })
 * const responses = await Promise.all(
 *   urls.map((url) => queue.add(({ signal }) => fetch(url, { signal }))),
 * )
 * ```
 */
export function create(options: create.Options = {}): Queue {
  const { interval = 0, intervalCap = Infinity, signal: queueSignal } = options
  let concurrency = checkLimit('concurrency', options.concurrency ?? Infinity)
  checkLimit('intervalCap', intervalCap)
  if (!(interval >= 0 && interval < Infinity))
    throw new RangeError('Expected `interval` to be a finite number from 0 up.')
  const rateLimited = interval > 0 && intervalCap !== Infinity

  let waiting: (Entry | undefined)[] = []
  let head = 0
  let size = 0
  let pending = 0
  let paused = false
  let idleWaiters: (() => void)[] = []
  const starts: number[] = []
  let timer: ReturnType<typeof setTimeout> | undefined

  queueSignal?.addEventListener('abort', () => removeWaiting(queueSignal.reason), { once: true })

  function enqueue(entry: Entry) {
    const last = waiting[waiting.length - 1]
    if (last === undefined || last.priority >= entry.priority) {
      waiting.push(entry)
      return
    }
    let low = head
    let high = waiting.length - 1
    while (low < high) {
      const middle = (low + high) >>> 1
      if (waiting[middle]!.priority >= entry.priority) low = middle + 1
      else high = middle
    }
    waiting.splice(low, 0, entry)
  }

  function peek(): Entry | undefined {
    while (head < waiting.length) {
      const entry = waiting[head]!
      if (entry.state === 'waiting') return entry
      waiting[head++] = undefined
    }
    if (head > 0) {
      waiting = []
      head = 0
    }
    return undefined
  }

  function takeStart(): boolean {
    const now = performance.now()
    while (starts.length > 0 && now - starts[0]! >= interval) starts.shift()
    if (starts.length < intervalCap) {
      starts.push(now)
      return true
    }
    timer ??= setTimeout(
      () => {
        timer = undefined
        drain()
      },
      Math.min(starts[0]! + interval - now, maxDelay),
    )
    return false
  }

  function drain() {
    while (!paused && pending < concurrency) {
      const entry = peek()
      if (entry === undefined || (rateLimited && !takeStart())) break
      waiting[head++] = undefined
      size--
      if (head >= 1024 && head * 2 >= waiting.length) {
        waiting = waiting.slice(head)
        head = 0
      }
      start(entry)
    }
    if (size === 0 && pending === 0 && idleWaiters.length > 0) {
      const resolvers = idleWaiters
      idleWaiters = []
      for (const resolve of resolvers) resolve()
    }
  }

  function start(entry: Entry) {
    pending++
    entry.state = 'running'
    if (entry.onAbort) entry.ownSignal!.removeEventListener('abort', entry.onAbort)
    const { signal } = entry.context
    if (signal !== neverAborted) {
      entry.onAbort = () => {
        if (entry.state !== 'running') return
        entry.state = 'settled'
        entry.reject(signal.reason)
      }
      signal.addEventListener('abort', entry.onAbort, { once: true })
    }
    entry.begin()
  }

  function run(entry: Entry) {
    if (entry.state !== 'running') return finish(entry)
    let result: unknown
    try {
      result = entry.task(entry.context)
    } catch (error) {
      return finish(entry, error, true)
    }
    if (isThenable(result))
      result.then(
        (value) => finish(entry, value, false),
        (error: unknown) => finish(entry, error, true),
      )
    else finish(entry, result, false)
  }

  function finish(entry: Entry, value?: unknown, failed?: boolean) {
    pending--
    if (entry.onAbort) entry.context.signal.removeEventListener('abort', entry.onAbort)
    if (entry.state === 'running') {
      entry.state = 'settled'
      if (failed) entry.reject(value)
      else entry.resolve(value)
    }
    drain()
  }

  function removeWaiting(reason: unknown) {
    const entries = waiting
    const from = head
    waiting = []
    head = 0
    size = 0
    if (timer !== undefined) {
      clearTimeout(timer)
      timer = undefined
    }
    for (let i = from; i < entries.length; i++) {
      const entry = entries[i]!
      if (entry.state !== 'waiting') continue
      if (entry.onAbort) entry.ownSignal!.removeEventListener('abort', entry.onAbort)
      discard(entry, reason)
    }
    drain()
  }

  function discard(entry: Entry, reason: unknown) {
    entry.state = 'settled'
    entry.promise.catch(noop)
    entry.reject(reason)
  }

  return {
    add<T>(task: Task<T>, addOptions: Queue.AddOptions = {}): Promise<T> {
      const { priority = 0, signal } = addOptions
      if (typeof priority !== 'number' || Number.isNaN(priority))
        throw new RangeError('Expected `priority` to be a number.')
      if (queueSignal?.aborted) return Promise.reject(queueSignal.reason)
      if (signal?.aborted) return Promise.reject(signal.reason)
      const entry: Entry = {
        task,
        priority,
        context: { signal: combine(queueSignal, signal) },
        ownSignal: signal,
        resolve: noop,
        reject: noop,
        onAbort: undefined,
        state: 'waiting',
        begin: noop,
        promise: undefined!,
      }
      const promise = new Promise<T>((resolve, reject) => {
        entry.resolve = resolve as (value: unknown) => void
        entry.reject = reject
      })
      entry.promise = promise
      // Chaining here, not in `start`, runs the task in the async context of its `add` call.
      void new Promise<void>((begin) => (entry.begin = begin)).then(() => run(entry))
      if (signal) {
        entry.onAbort = () => {
          if (entry.state !== 'waiting') return
          size--
          discard(entry, signal.reason)
          drain()
        }
        signal.addEventListener('abort', entry.onAbort, { once: true })
      }
      enqueue(entry)
      size++
      drain()
      return promise
    },
    idle() {
      if (size === 0 && pending === 0) return Promise.resolve()
      return new Promise((resolve) => idleWaiters.push(resolve))
    },
    pause() {
      paused = true
    },
    resume() {
      paused = false
      drain()
    },
    clear() {
      removeWaiting(new DOMException('The task was removed by clear().', 'AbortError'))
    },
    get size() {
      return size
    },
    get pending() {
      return pending
    },
    get paused() {
      return paused
    },
    get concurrency() {
      return concurrency
    },
    set concurrency(value: number) {
      concurrency = checkLimit('concurrency', value)
      drain()
    },
  }
}

/**
 * Returns a function that runs the tasks passed to it, at most `concurrency` at once. It is the
 * `add` method of a new queue; use `create` to also read its size or clear it.
 *
 * @example
 * ```ts
 * import * as Queue from '@portable/queue'
 *
 * const limit = Queue.limit(2)
 * const pages = await Promise.all(urls.map((url) => limit(() => fetch(url).then((r) => r.text()))))
 * ```
 */
export function limit(concurrency: number): Queue['add'] {
  return create({ concurrency }).add
}

export function checkLimit(name: string, value: number): number {
  if (!(value === Infinity || (Number.isInteger(value) && value >= 1)))
    throw new RangeError(`Expected \`${name}\` to be a positive integer or Infinity, got ${value}.`)
  return value
}

function combine(a: AbortSignal | undefined, b: AbortSignal | undefined): AbortSignal {
  if (a && b) return AbortSignal.any([a, b])
  return a ?? b ?? neverAborted
}

export function isThenable(value: unknown): value is PromiseLike<unknown> {
  return typeof (value as { then?: unknown } | null | undefined)?.then === 'function'
}
