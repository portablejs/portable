import { type AsyncDisposeMethod, withAsyncDispose } from '@portable/errors/internal';

/** What a task receives when it starts. */
export type Context = {
  /** Aborts when the task's `signal` or the queue's `signal` aborts. */
  signal: AbortSignal;
};

/** A function the queue calls when a slot is free. It can return a value or a promise. */
export type Task<value> = (context: Context) => value | PromiseLike<value>;

/**
 * A queue made by `create`. Where the runtime has `Symbol.asyncDispose`,
 * `[Symbol.asyncDispose]()` does what aborting the queue's `signal` does, with an `AbortError`
 * `DOMException`, and resolves once running tasks have settled, so
 * `await using queue = Queue.create()` leaves no task running after the scope ends.
 */
export type Queue = AsyncDisposeMethod & {
  /**
   * Adds a task and resolves or rejects with its result. Rejects with the abort reason when
   * `options.signal` or the queue's `signal` aborts, and with an `AbortError` `DOMException` when
   * `clear()` removes the task before it starts.
   */
  add: <value>(task: Task<value>, options?: Queue.AddOptions) => Promise<value>;
  /** Resolves when no task is waiting or running. It never rejects. */
  idle: () => Promise<void>;
  /** Stops starting tasks. Running tasks continue. */
  pause: () => void;
  /** Starts tasks again after `pause()`. */
  resume: () => void;
  /** Removes every waiting task and rejects its promise with an `AbortError`. Running tasks continue. */
  clear: () => void;
  /** The number of tasks waiting to start. */
  readonly size: number;
  /** The number of tasks running. */
  readonly pending: number;
  /** Whether `pause()` was called without a `resume()` after it. */
  readonly paused: boolean;
  /** The most tasks that run at once. Raising it starts waiting tasks at once. */
  concurrency: number;
};

export declare namespace Queue {
  type AddOptions = {
    /** Tasks with a higher priority start first. Tasks with equal priority start in the order they were added. @default 0 */
    priority?: number | undefined;
    /**
     * Removes the task if it is still waiting, and aborts the task's `signal` if it is running.
     * Either way, the promise from `add` rejects with `signal.reason` at once. A running task keeps
     * its slot until it settles.
     */
    signal?: AbortSignal | undefined;
  };
}

export declare namespace create {
  type Options = {
    /** The most tasks that run at once: a positive integer or `Infinity`. @default Infinity */
    concurrency?: number | undefined;
    /** The most tasks that start in any `interval` milliseconds. Needs `interval`. @default Infinity */
    intervalCap?: number | undefined;
    /** The length of the sliding window for `intervalCap`, in milliseconds. `0` turns rate limiting off. @default 0 */
    interval?: number | undefined;
    /** Rejects every waiting and running task with `signal.reason`, and every task added later. */
    signal?: AbortSignal | undefined;
  };
}

type Entry = {
  task: Task<unknown>;
  priority: number;
  context: Context;
  watched: AbortSignal | undefined;
  resolve: (value: unknown) => void;
  reject: (reason: unknown) => void;
  state: State;
  begin: () => void;
  promise: Promise<unknown>;
};

type State = 'waiting' | 'running' | 'settled';

const noop = () => {};
const maxDelay = 2 ** 31 - 1;

/**
 * Creates a queue that runs at most `concurrency` tasks at once, in priority order, optionally
 * starting no more than `intervalCap` tasks in any `interval` milliseconds.
 *
 * @example
 * ```ts
 * import * as Queue from '@portable/queue';
 *
 * const queue = Queue.create({ concurrency: 4 });
 * const responses = await Promise.all(
 *   urls.map((url) => queue.add(({ signal }) => fetch(url, { signal }))),
 * );
 * ```
 */
export function create(options: create.Options = {}): Queue {
  const { interval = 0, intervalCap = Infinity, signal } = options;
  let concurrency = assertLimit('concurrency', options.concurrency ?? Infinity);
  assertLimit('intervalCap', intervalCap);
  if (!(interval >= 0 && interval < Infinity)) {
    throw new RangeError('Expected `interval` to be a finite number from 0 up.');
  }
  const rateLimited = interval > 0 && intervalCap !== Infinity;

  let waiting: (Entry | undefined)[] = [];
  let head = 0;
  let size = 0;
  let pending = 0;
  let paused = false;
  let idleWaiters: (() => void)[] = [];
  const starts: number[] = [];
  let timer: ReturnType<typeof setTimeout> | undefined;
  const watchers = new Map<AbortSignal, { entries: Set<Entry>; listener: () => void }>();

  const disposer = new AbortController();
  const queueSignal = signal ? AbortSignal.any([signal, disposer.signal]) : disposer.signal;
  const running = new Set<Entry>();
  queueSignal.addEventListener(
    'abort',
    () => {
      removeWaiting(queueSignal.reason);
      for (const entry of running) {
        if (entry.state === 'running') {
          entry.state = 'settled';
          entry.reject(queueSignal.reason);
        }
      }
    },
    { once: true },
  );

  function watch(entry: Entry, signal: AbortSignal | undefined) {
    if (entry.watched === signal) {
      return;
    }
    if (entry.watched) {
      unwatch(entry);
    }
    entry.watched = signal;
    if (!signal) {
      return;
    }
    let watcher = watchers.get(signal);
    if (!watcher) {
      const entries = new Set<Entry>();
      const listener = () => {
        watchers.delete(signal);
        for (const entry of entries) {
          entry.watched = undefined;
          if (entry.state === 'waiting') {
            size--;
            discard(entry, signal.reason);
          } else if (entry.state === 'running') {
            entry.state = 'settled';
            entry.reject(signal.reason);
          }
        }
        drain();
      };
      watcher = { entries, listener };
      watchers.set(signal, watcher);
      signal.addEventListener('abort', listener, { once: true });
    }
    watcher.entries.add(entry);
  }

  function unwatch(entry: Entry) {
    const signal = entry.watched!;
    entry.watched = undefined;
    const watcher = watchers.get(signal);
    if (!watcher) {
      return;
    }
    watcher.entries.delete(entry);
    if (watcher.entries.size > 0) {
      return;
    }
    watchers.delete(signal);
    signal.removeEventListener('abort', watcher.listener);
  }

  function enqueue(entry: Entry) {
    const last = waiting[waiting.length - 1];
    if (last === undefined || last.priority >= entry.priority) {
      waiting.push(entry);
      return;
    }
    let low = head;
    let high = waiting.length - 1;
    while (low < high) {
      const middle = (low + high) >>> 1;
      if (waiting[middle]!.priority >= entry.priority) {
        low = middle + 1;
      } else {
        high = middle;
      }
    }
    waiting.splice(low, 0, entry);
  }

  function peek(): Entry | undefined {
    while (head < waiting.length) {
      const entry = waiting[head]!;
      if (entry.state === 'waiting') {
        return entry;
      }
      waiting[head++] = undefined;
    }
    if (head > 0) {
      waiting = [];
      head = 0;
    }
    return undefined;
  }

  function takeStart(): boolean {
    const now = performance.now();
    while (starts.length > 0 && now - starts[0]! >= interval) {
      starts.shift();
    }
    if (starts.length < intervalCap) {
      starts.push(now);
      return true;
    }
    timer ??= setTimeout(
      () => {
        timer = undefined;
        drain();
      },
      Math.min(starts[0]! + interval - now, maxDelay),
    );
    return false;
  }

  function drain() {
    while (!paused && pending < concurrency) {
      const entry = peek();
      if (entry === undefined || (rateLimited && !takeStart())) {
        break;
      }
      waiting[head++] = undefined;
      size--;
      if (head >= 1024 && head * 2 >= waiting.length) {
        waiting = waiting.slice(head);
        head = 0;
      }
      start(entry);
    }
    if (size === 0 && pending === 0 && idleWaiters.length > 0) {
      const resolvers = idleWaiters;
      idleWaiters = [];
      for (const resolve of resolvers) {
        resolve();
      }
    }
  }

  function start(entry: Entry) {
    pending++;
    entry.state = 'running';
    running.add(entry);
    entry.begin();
  }

  function run(entry: Entry) {
    if (entry.state !== 'running') {
      return finish(entry);
    }
    let result: unknown;
    try {
      result = entry.task(entry.context);
    } catch (error) {
      return finish(entry, error, true);
    }
    if (isThenable(result)) {
      result.then(
        (value) => finish(entry, value, false),
        (error: unknown) => finish(entry, error, true),
      );
    } else {
      finish(entry, result, false);
    }
  }

  function finish(entry: Entry, value?: unknown, failed?: boolean) {
    pending--;
    running.delete(entry);
    if (entry.watched) {
      unwatch(entry);
    }
    if (entry.state === 'running') {
      entry.state = 'settled';
      if (failed) {
        entry.reject(value);
      } else {
        entry.resolve(value);
      }
    }
    drain();
  }

  function removeWaiting(reason: unknown) {
    const entries = waiting;
    const from = head;
    waiting = [];
    head = 0;
    size = 0;
    if (timer !== undefined) {
      clearTimeout(timer);
      timer = undefined;
    }
    for (let i = from; i < entries.length; i++) {
      const entry = entries[i]!;
      if (entry.state !== 'waiting') {
        continue;
      }
      if (entry.watched) {
        unwatch(entry);
      }
      discard(entry, reason);
    }
    drain();
  }

  function discard(entry: Entry, reason: unknown) {
    entry.state = 'settled';
    entry.promise.catch(noop);
    entry.reject(reason);
  }

  const queue = {
    add<value>(task: Task<value>, addOptions: Queue.AddOptions = {}): Promise<value> {
      const { priority = 0, signal } = addOptions;
      if (typeof priority !== 'number') {
        throw new TypeError('Expected `priority` to be a number.');
      }
      if (Number.isNaN(priority)) {
        throw new RangeError('Expected `priority` to be a number, got NaN.');
      }
      if (queueSignal.aborted) {
        return Promise.reject(queueSignal.reason);
      }
      if (signal?.aborted) {
        return Promise.reject(signal.reason);
      }
      const entry: Entry = {
        task,
        priority,
        context: signal ? combined(queueSignal, signal) : { signal: queueSignal },
        watched: undefined,
        resolve: noop,
        reject: noop,
        state: 'waiting',
        begin: noop,
        promise: undefined!,
      };
      const promise = new Promise<value>((resolve, reject) => {
        entry.resolve = resolve as (value: unknown) => void;
        entry.reject = reject;
      });
      entry.promise = promise;
      // Chaining here, not in `start`, runs the task in the async context of its `add` call.
      void new Promise<void>((begin) => (entry.begin = begin)).then(() => run(entry));
      watch(entry, signal);
      enqueue(entry);
      size++;
      drain();
      return promise;
    },
    idle(): Promise<void> {
      if (size === 0 && pending === 0) {
        return Promise.resolve();
      }
      return new Promise<void>((resolve) => idleWaiters.push(resolve));
    },
    pause() {
      paused = true;
    },
    resume() {
      paused = false;
      drain();
    },
    clear() {
      removeWaiting(new DOMException('The task was removed by clear().', 'AbortError'));
    },
    get size() {
      return size;
    },
    get pending() {
      return pending;
    },
    get paused() {
      return paused;
    },
    get concurrency() {
      return concurrency;
    },
    set concurrency(value: number) {
      concurrency = assertLimit('concurrency', value);
      drain();
    },
  };
  return withAsyncDispose(queue, () => {
    disposer.abort(new DOMException('The queue was disposed.', 'AbortError'));
    return queue.idle();
  });
}

/**
 * Returns a function that runs the tasks passed to it, at most `concurrency` at once. It is the
 * `add` method of a new queue. Use `create` to also read its size or clear it.
 *
 * @example
 * ```ts
 * import * as Queue from '@portable/queue';
 *
 * const limit = Queue.limit(2);
 * const pages = await Promise.all(urls.map((url) => limit(() => fetch(url).then((r) => r.text()))));
 * ```
 */
export function limit(concurrency: number): Queue['add'] {
  return create({ concurrency }).add;
}

export function assertLimit(name: string, value: number): number {
  if (!(value === Infinity || (Number.isInteger(value) && value >= 1))) {
    throw new RangeError(
      `Expected \`${name}\` to be a positive integer or Infinity, got ${value}.`,
    );
  }
  return value;
}

type LazyContext = { queue: AbortSignal; task: AbortSignal; combined: AbortSignal | undefined };

// Most tasks never read `signal`, so the combined signal is created on first read.
const lazyContext = {
  get signal(): AbortSignal {
    const self = this as unknown as LazyContext;
    return (self.combined ??= AbortSignal.any([self.queue, self.task]));
  },
};

function combined(queue: AbortSignal, task: AbortSignal): Context {
  return { __proto__: lazyContext, queue, task, combined: undefined } as unknown as Context;
}

export function isThenable(value: unknown): value is PromiseLike<unknown> {
  return typeof (value as { then?: unknown } | null | undefined)?.then === 'function';
}
