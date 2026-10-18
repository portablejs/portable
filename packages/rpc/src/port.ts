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
  let listener: (event: MessageEvent) => void
  const stop = () => {
    target.removeEventListener('message', listener)
    signal?.removeEventListener('abort', onAbort)
  }
  let onAbort: () => void
  const readable = new ReadableStream<unknown>({
    start(controller) {
      listener = (event) => controller.enqueue(event.data)
      onAbort = () => {
        stop()
        controller.error(signal!.reason)
      }
      if (signal?.aborted) return onAbort()
      signal?.addEventListener('abort', onAbort)
      target.addEventListener('message', listener)
      target.start?.()
    },
    cancel: stop,
  })
  const writable = new WritableStream<unknown>({
    write(message) {
      target.postMessage(message)
    },
  })
  return { readable, writable }
}
