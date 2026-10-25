/**
 * Settles as `work` does, or rejects with `signal.reason` as soon as `signal` aborts. The work itself
 * keeps running, so use it only for work that can't take the signal or that ignores it. A rejection
 * of `work` after the abort is ignored.
 */
export function abortable<value>(
  work: value | PromiseLike<value>,
  signal: AbortSignal | undefined,
): Promise<value> {
  const promise = Promise.resolve(work);
  if (!signal) {
    return promise;
  }
  if (signal.aborted) {
    promise.catch(() => {});
    return Promise.reject(signal.reason);
  }
  return new Promise((resolve, reject) => {
    const onAbort = () => reject(signal.reason);
    signal.addEventListener('abort', onAbort, { once: true });
    promise.then(resolve, reject).finally(() => signal.removeEventListener('abort', onAbort));
  });
}
