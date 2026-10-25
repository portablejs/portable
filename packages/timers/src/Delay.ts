import { sleep } from './sleep.js';

/**
 * How long to wait before the next attempt: a fixed number of milliseconds, exponential backoff, or a
 * function that takes `{ attempt, error }`: the number of the attempt that just finished and, in
 * `retry`, the error it threw.
 */
export type Delay = number | Backoff | ((attempt: Attempt) => number);

/** What a `delay` function receives. */
export type Attempt = {
  /** The number of the attempt that just finished, starting at 1. */
  attempt: number;
  /** The error that ended the attempt. `poll` passes none. */
  error?: unknown;
};

/**
 * Exponential backoff. Attempt `n` waits up to `min(max, initial * factor ** (n - 1))` ms. With
 * `jitter` (the default), the wait is a random value between 0 and that cap ("full jitter").
 */
export type Backoff = {
  /** Cap for the wait after the first attempt, in ms. */
  initial: number;
  /** Largest wait, in ms. */
  max: number;
  /** Growth of the cap per attempt. @default 2 */
  factor?: number | undefined;
  /** Wait a random time between 0 and the cap. With `false`, wait exactly the cap. @default true */
  jitter?: boolean | undefined;
};

/** What `retry` and `poll` pass to `fn`. */
export type Context = {
  /** The attempt number, starting at 1. */
  attempt: number;
  /** Aborts when the `signal` option aborts or the `timeout` passes. Pass it to `fetch`. */
  signal: AbortSignal;
};

let never: AbortSignal | undefined;

// Workers refuses to create an AbortController at the top level of a module.
export function neverAborted(): AbortSignal {
  return (never ??= new AbortController().signal);
}

/**
 * Checks `delay` and returns a function that takes the attempt number, starting at 1, and the
 * error that ended that attempt, and returns the wait in ms before the next attempt. `retry` and
 * `poll` use it, and so do the reconnecting clients in `@portable/websockets` and `@portable/sse`.
 *
 * @example
 * ```ts
 * import * as Timers from '@portable/timers';
 *
 * const next = Timers.backoff({ initial: 1000, max: 30_000, jitter: false });
 * next({ attempt: 1 }); // 1000
 * next({ attempt: 3 }); // 4000
 * ```
 *
 * @throws {RangeError} When a wait, `initial` or `max` is negative, or `factor` isn't a positive finite number.
 */
export function backoff(delay: Delay): (attempt: Attempt) => number {
  if (typeof delay === 'function') {
    return delay;
  }
  if (typeof delay === 'number') {
    assertMs('delay', delay);
    return () => delay;
  }
  const { initial, max, factor = 2, jitter = true } = delay;
  assertMs('delay.initial', initial);
  assertMs('delay.max', max);
  if (!(factor > 0) || factor === Infinity) {
    throw new RangeError('Expected `delay.factor` to be a positive finite number.');
  }
  return ({ attempt }) => {
    const cap = Math.min(max, initial * factor ** (attempt - 1));
    return jitter ? Math.random() * cap : cap;
  };
}

export function assertMs(name: string, value: number): void {
  if (!(value >= 0)) {
    throw new RangeError(`Expected \`${name}\` to be a non-negative number.`);
  }
}

export function call<value>(
  fn: (context: Context) => value | PromiseLike<value>,
  context: Context,
): Promise<value> {
  return new Promise<value>((resolve) => resolve(fn(context)));
}

export function withTimeout(
  signal: AbortSignal | undefined,
  timeout: number,
): { signal: AbortSignal; clear: () => void } {
  const controller = new AbortController();
  const stop = new AbortController();
  const onAbort = () => controller.abort(signal!.reason);
  signal?.addEventListener('abort', onAbort, { once: true });
  sleep(timeout, { signal: stop.signal }).then(
    () => controller.abort(new DOMException('The operation timed out.', 'TimeoutError')),
    () => {},
  );
  return {
    signal: controller.signal,
    clear() {
      stop.abort();
      signal?.removeEventListener('abort', onAbort);
    },
  };
}
