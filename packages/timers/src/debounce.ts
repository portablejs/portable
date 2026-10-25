import { type DisposeMethod, withDispose } from '@portable/errors/internal';

const maxTimeout = 2 ** 31 - 1;

/**
 * A debounced or throttled function. Calls that arrive while an invocation is waiting share it,
 * and each one returns a promise of that invocation's result. Where the runtime has
 * `Symbol.dispose`, `[Symbol.dispose]()` calls `cancel()`, so a function declared with `using`
 * drops its waiting invocation when the scope ends.
 */
export type Debounced<args extends unknown[], result, self = unknown> = DisposeMethod & {
  (this: self, ...args: args): Promise<Awaited<result>>;
  /**
   * Drops the waiting invocation. Calls waiting for it reject with an `AbortError` `DOMException`.
   * Later calls work as usual.
   */
  cancel(): void;
  /**
   * Runs the waiting invocation now and resolves with its result. Resolves with `undefined` when
   * nothing is waiting.
   */
  flush(): Promise<Awaited<result> | undefined>;
  /** `true` while the function waits out `ms` after a call. */
  readonly pending: boolean;
};

export declare namespace debounce {
  type Options = {
    /** Invoke on the first call of a burst. @default false */
    leading?: boolean | undefined;
    /** Invoke `ms` after the last call of a burst, with that call's arguments. @default true */
    trailing?: boolean | undefined;
    /** Longest time, in ms, that a call waits before an invocation, however often calls arrive. */
    maxWait?: number | undefined;
    /** Cancels the waiting invocation, as `cancel()` does but rejecting with `signal.reason`, and disables the function. */
    signal?: AbortSignal | undefined;
  };
}

/**
 * Wraps `fn` so that a burst of calls invokes it once, `ms` after the last call, with the last call's
 * arguments. Every call in the burst resolves with that invocation's result.
 *
 * @example
 * ```ts
 * import * as Timers from '@portable/timers';
 *
 * const save = Timers.debounce((text: string) => fetch('/draft', { method: 'PUT', body: text }), 500);
 * editor.addEventListener('input', () => save(editor.value));
 * const response = await save(editor.value); // the response of the save that this call shares
 * ```
 */
export function debounce<args extends unknown[], result, self = unknown>(
  fn: (this: self, ...args: args) => result,
  ms: number,
  options: debounce.Options = {},
): Debounced<args, result, self> {
  const { leading = false, trailing = true, maxWait, signal } = options;
  if (!leading && !trailing) {
    throw new RangeError('Expected `leading`, `trailing` or both to be true.');
  }
  const wait = normalizeWait('ms', ms);
  const maxing = maxWait !== undefined;
  const max = maxing ? Math.max(normalizeWait('maxWait', maxWait), wait) : 0;

  let batch: Batch | undefined;
  let lastCall: { args: args; self: self } | undefined;
  let lastCallTime: number | undefined;
  let lastInvokeTime = 0;
  let result: unknown;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const onAbort = () => cancel(signal!.reason);

  function settle(): void {
    batch?.resolve(result);
    batch = undefined;
  }

  function invoke(time: number): void {
    const { args, self } = lastCall!;
    const settling = batch;
    batch = undefined;
    lastCall = undefined;
    lastInvokeTime = time;
    try {
      result = fn.apply(self, args);
    } catch (error) {
      const rejected = Promise.reject(error);
      rejected.catch(() => {});
      result = rejected;
    }
    settling?.resolve(result);
  }

  function startTimer(ms: number): void {
    if (timer === undefined) {
      signal?.addEventListener('abort', onAbort, { once: true });
    }
    timer = setTimeout(timerExpired, ms);
  }

  function stopTimer(): void {
    clearTimeout(timer);
    timer = undefined;
    signal?.removeEventListener('abort', onAbort);
  }

  function shouldInvoke(time: number): boolean {
    if (lastCallTime === undefined) {
      return true;
    }
    const sinceCall = time - lastCallTime;
    return sinceCall >= wait || sinceCall < 0 || (maxing && time - lastInvokeTime >= max);
  }

  function timerExpired(): void {
    const time = performance.now();
    if (shouldInvoke(time)) {
      return trailingEdge();
    }
    const waiting = wait - (time - lastCallTime!);
    startTimer(maxing ? Math.min(waiting, max - (time - lastInvokeTime)) : waiting);
  }

  function trailingEdge(): void {
    stopTimer();
    if (trailing && lastCall) {
      invoke(performance.now());
    } else {
      lastCall = undefined;
      settle();
    }
    if (timer === undefined) {
      result = undefined;
    }
  }

  function cancel(reason: unknown = new DOMException('The call was cancelled.', 'AbortError')) {
    stopTimer();
    lastInvokeTime = 0;
    lastCall = lastCallTime = result = undefined;
    batch?.promise.catch(() => {});
    batch?.reject(reason);
    batch = undefined;
  }

  function debounced(this: self, ...args: args): Promise<unknown> {
    if (signal?.aborted) {
      return Promise.reject(signal.reason);
    }
    batch ??= deferred();
    const { promise } = batch;
    const time = performance.now();
    const invoking = shouldInvoke(time);
    lastCall = { args, self: this };
    lastCallTime = time;
    if (invoking && timer === undefined) {
      lastInvokeTime = time;
      startTimer(wait);
      if (leading) {
        invoke(time);
      }
    } else if (invoking && maxing) {
      clearTimeout(timer);
      startTimer(wait);
      invoke(time);
    } else if (timer === undefined) {
      startTimer(wait);
    }
    if (!trailing) {
      settle();
    }
    return promise;
  }

  const drop = () => cancel();
  return Object.defineProperties(withDispose(debounced, drop), {
    cancel: { value: drop },
    flush: {
      value: () => {
        if (timer === undefined) {
          return Promise.resolve(undefined);
        }
        batch ??= deferred();
        const { promise } = batch;
        if (!maxing) {
          trailingEdge();
        } else if (trailing && lastCall) {
          // The timer keeps running, so the `maxWait` window counts from this invocation and a
          // call before it ends runs when it ends.
          invoke(performance.now());
        } else {
          lastCall = undefined;
          settle();
        }
        return promise;
      },
    },
    pending: { get: () => timer !== undefined },
  }) as unknown as Debounced<args, result, self>;
}

type Batch = {
  promise: Promise<unknown>;
  resolve: (value: unknown) => void;
  reject: (reason: unknown) => void;
};

function deferred(): Batch {
  let resolve!: Batch['resolve'];
  let reject!: Batch['reject'];
  const promise = new Promise<unknown>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function normalizeWait(name: string, ms: number): number {
  if (!(ms <= maxTimeout)) {
    throw new RangeError(`Expected \`${name}\` to be a number up to ${maxTimeout}.`);
  }
  return Math.max(0, ms);
}
