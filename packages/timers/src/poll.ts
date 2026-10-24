import { backoff, call, type Context, type Delay, neverAborted } from './Delay.js';
import { abortable, sleep } from './sleep.js';

export declare namespace poll {
  type Options = {
    /** Wait after each check that returns `undefined`. @default 1000 */
    delay?: Delay | undefined;
    /**
     * Stops polling and rejects with `signal.reason`, also while a check is running. Pass
     * `AbortSignal.timeout(ms)` to limit the whole poll.
     */
    signal?: AbortSignal | undefined;
  };
}

/**
 * Calls `fn` until it returns a value other than `undefined`, waiting `delay` between calls, and
 * resolves with that value. An error thrown by `fn` rejects the poll without another call.
 *
 * @example
 * ```ts
 * import * as Timers from '@portable/timers';
 *
 * const order = await Timers.poll(
 *   async ({ signal }) => {
 *     const order = await (await fetch(`/orders/${id}`, { signal })).json();
 *     return order.status === 'paid' ? order : undefined;
 *   },
 *   { delay: 2000, signal: AbortSignal.timeout(120_000) },
 * );
 * ```
 */
export async function poll<value>(
  fn: (context: Context) => value | undefined | PromiseLike<value | undefined>,
  options: poll.Options = {},
): Promise<value> {
  const { delay = 1000, signal } = options;
  const next = backoff(delay);
  signal?.throwIfAborted();
  for (let attempt = 1; ; attempt++) {
    const result = call(fn, { attempt, signal: signal ?? neverAborted() });
    const value = await (signal ? abortable(result, signal) : result);
    if (value !== undefined) {
      return value;
    }
    await sleep(next({ attempt }), { signal });
  }
}
