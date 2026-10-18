/** Settles as `work` does, or rejects with `signal.reason` as soon as `signal` aborts. */
export function race<T>(work: T | PromiseLike<T>, signal: AbortSignal | undefined): Promise<T> {
  if (!signal) return Promise.resolve(work)
  return new Promise<T>((resolve, reject) => {
    if (signal.aborted) return reject(signal.reason)
    const onAbort = () => reject(signal.reason)
    signal.addEventListener('abort', onAbort, { once: true })
    Promise.resolve(work)
      .then(resolve, reject)
      .finally(() => signal.removeEventListener('abort', onAbort))
  })
}

/** Reads a body to the end. Aborting `signal` cancels the body and rejects with the reason. */
export async function readBody(
  body: Body,
  signal: AbortSignal | undefined,
): Promise<Uint8Array<ArrayBuffer>> {
  if (!signal || body.body === null) return new Uint8Array(await body.arrayBuffer())
  signal.throwIfAborted()
  const reader = body.body.getReader()
  const onAbort = () => reader.cancel(signal.reason).catch(() => {})
  signal.addEventListener('abort', onAbort, { once: true })
  try {
    const chunks: Uint8Array[] = []
    let length = 0
    for (;;) {
      const { done, value } = await reader.read()
      signal.throwIfAborted()
      if (done) break
      chunks.push(value)
      length += value.length
    }
    const out = new Uint8Array(length)
    let offset = 0
    for (const chunk of chunks) {
      out.set(chunk, offset)
      offset += chunk.length
    }
    return out
  } finally {
    signal.removeEventListener('abort', onAbort)
  }
}
