export declare namespace once {
  type Options = {
    /**
     * Whether to keep the result after `fn` fulfills, so later calls return it without calling
     * `fn`. With `false`, callers share only a call that is still running, and the next call after
     * it settles calls `fn` again. A rejection is never kept.
     * @default true
     */
    cache?: boolean | undefined;
  };
}

/**
 * Wraps `fn` so that callers share one call: while it runs, every caller gets the same promise.
 * After it fulfills, the result is kept (unless `cache` is `false`). After it rejects,
 * the next call calls `fn` again.
 *
 * @example
 * ```ts
 * import * as Queue from '@portable/queue';
 *
 * const connect = Queue.once(() => openDatabase(url));
 * const db = await connect(); // concurrent and later callers get the same connection
 *
 * const refresh = Queue.once(() => fetchToken(), { cache: false });
 * ```
 */
export function once<value>(
  fn: () => value | PromiseLike<value>,
  options: once.Options = {},
): () => Promise<value> {
  const { cache = true } = options;
  let current: Promise<value> | undefined;
  return () => {
    if (current) {
      return current;
    }
    const promise = new Promise<value>((resolve) => resolve(fn()));
    current = promise;
    const reset = () => {
      if (current === promise) {
        current = undefined;
      }
    };
    promise.then(cache ? undefined : reset, reset);
    return promise;
  };
}
