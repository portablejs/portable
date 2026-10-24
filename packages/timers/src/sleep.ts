const maxTimeout = 2 ** 31 - 1;

type Scheduler = {
  wait?:
    | ((ms: number, options?: { signal?: AbortSignal | undefined }) => Promise<void>)
    | undefined;
};

export declare namespace sleep {
  type Options = {
    /** Rejects the returned promise with `signal.reason` and clears the timer when aborted. */
    signal?: AbortSignal | undefined;
  };
}

/**
 * Resolves after `ms` milliseconds. Uses `scheduler.wait` where the runtime has it, and `setTimeout`
 * otherwise. Delays longer than `setTimeout`'s limit of about 24.8 days, including
 * `Infinity`, are waited out in steps, because `setTimeout` would fire such a timer at once.
 *
 * @example
 * ```ts
 * import * as Timers from '@portable/timers';
 *
 * await Timers.sleep(1000);
 * await Timers.sleep(5000, { signal: AbortSignal.timeout(1000) }); // rejects with a TimeoutError
 * ```
 */
export async function sleep(ms: number, options: sleep.Options = {}): Promise<void> {
  const { signal } = options;
  if (Number.isNaN(ms)) {
    throw new RangeError('Expected `ms` to be a number, got NaN.');
  }
  signal?.throwIfAborted();
  let remaining = Math.max(0, ms);
  for (;;) {
    const step = Math.min(remaining, maxTimeout);
    await wait(step, signal);
    remaining -= step;
    if (remaining <= 0) {
      return;
    }
  }
}

function wait(ms: number, signal: AbortSignal | undefined): Promise<void> {
  const { scheduler } = globalThis as { scheduler?: Scheduler | undefined };
  if (typeof scheduler?.wait === 'function') {
    if (!signal) {
      return scheduler.wait(ms);
    }
    return abortable(scheduler.wait(ms, { signal }), signal);
  }
  return new Promise((resolve, reject) => {
    const onAbort = () => {
      clearTimeout(id);
      reject(signal!.reason);
    };
    const id = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

export function abortable<value>(promise: PromiseLike<value>, signal: AbortSignal): Promise<value> {
  return new Promise((resolve, reject) => {
    const onAbort = () => reject(signal.reason);
    promise.then(
      (value) => {
        signal.removeEventListener('abort', onAbort);
        resolve(value);
      },
      (error: unknown) => {
        signal.removeEventListener('abort', onAbort);
        reject(error);
      },
    );
    if (signal.aborted) {
      onAbort();
    } else {
      signal.addEventListener('abort', onAbort, { once: true });
    }
  });
}
