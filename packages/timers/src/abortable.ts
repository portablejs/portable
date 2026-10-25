/**
 * Settles as `work` does, or rejects with `signal.reason` as soon as `signal` aborts. The work itself
 * keeps running, so use it only for work that can't take the signal or that ignores it.
 */
export function abortable<value>(
  work: value | PromiseLike<value>,
  signal: AbortSignal | undefined,
): Promise<value> {
  if (!signal) {
    return Promise.resolve(work);
  }
  if (signal.aborted) {
    return Promise.reject(signal.reason);
  }
  return new Promise((resolve, reject) => {
    const onAbort = () => reject(signal.reason);
    signal.addEventListener('abort', onAbort, { once: true });
    Promise.resolve(work)
      .then(resolve, reject)
      .finally(() => signal.removeEventListener('abort', onAbort));
  });
}
