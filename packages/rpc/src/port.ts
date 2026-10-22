import type { Transport } from './types.js'

export declare namespace port {
  /** A `MessagePort`, `Worker`, `BroadcastChannel`, or a worker's `self`. */
  type Target = {
    postMessage(message: unknown): void
    addEventListener(type: 'message', listener: (event: MessageEvent) => void): void
    removeEventListener(type: 'message', listener: (event: MessageEvent) => void): void
    start?(): void
  }
  type Options = {
    /** Stops listening and errors the readable with `signal.reason`. */
    signal?: AbortSignal | undefined
  }
}

/**
 * A transport over `postMessage`: a `MessagePort`, a `Worker`, a `BroadcastChannel`, or `self`
 * inside a worker. Messages are structured-cloned, so the identity codec
 * `{ encode: (m) => m, decode: (m) => m }` also works and keeps `Date`, `Map` and `Uint8Array`
 * values intact.
 *
 * @example
 * ```ts
 * import * as Rpc from '@portable/rpc'
 *
 * const { port1, port2 } = new MessageChannel()
 * Rpc.serve({ add: (a: number, b: number) => a + b }, Rpc.port(port1))
 * const remote = Rpc.connect<{ add(a: number, b: number): number }>(Rpc.port(port2))
 * await remote.add(1, 2)
 * ```
 */
export function port(target: port.Target, options: port.Options = {}): Transport {
  const { signal } = options
  let listening = false
  const listen = (onMessage: (data: unknown) => void, onError: (reason: unknown) => void) => {
    if (listening) throw new TypeError('The transport is already connected.')
    listening = true
    const listener = (event: MessageEvent) => onMessage(event.data)
    let stopped = false
    const stop = () => {
      if (stopped) return
      stopped = true
      target.removeEventListener('message', listener)
      signal?.removeEventListener('abort', onAbort)
    }
    const onAbort = () => {
      stop()
      onError(signal!.reason)
    }
    if (signal?.aborted) onAbort()
    else {
      signal?.addEventListener('abort', onAbort)
      target.addEventListener('message', listener)
      target.start?.()
    }
    return stop
  }
  let stop: (() => void) | undefined
  const readable = new ReadableStream<unknown>(
    {
      pull(controller) {
        if (stop) return
        stop = listen(
          (data) => controller.enqueue(data),
          (reason) => controller.error(reason),
        )
      },
      cancel: () => stop?.(),
    },
    { highWaterMark: 0 },
  )
  const writable = new WritableStream<unknown>({
    write(message) {
      target.postMessage(message)
    },
  })
  const transport = { readable, writable }
  direct.set(transport, {
    post(message) {
      target.postMessage(message)
    },
    listen,
  })
  return transport
}

type Direct = {
  post(message: unknown): void | Promise<void>
  listen?(onMessage: (data: unknown) => void, onError: (reason: unknown) => void): () => void
}

const directKey = Symbol.for('portable.rpc.direct')

/**
 * Lets `connect` post, and for ports receive, messages directly instead of through the streams.
 * That is faster, and a message that can't be cloned rejects one call instead of erroring the
 * writable permanently. The functions are stored on the transport under a `Symbol.for` key, so
 * `connect` from another copy of this package finds them too.
 */
export const direct = {
  get: (transport: Transport): Direct | undefined =>
    (transport as { [directKey]?: Direct })[directKey],
  set(transport: Transport, value: Direct): void {
    Object.defineProperty(transport, directKey, { value })
  },
}
