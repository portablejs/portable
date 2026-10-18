import { TransportError } from './errors.js'
import { deferred, noop } from './server.js'
import type { Transport } from './types.js'

const key = '@portable/rpc'
const version = 1
const retryInterval = 100

export declare namespace window {
  /** Another window: `iframe.contentWindow`, `window.parent`, `window.opener`, or a popup. */
  type Target = { postMessage(message: unknown, targetOrigin: string): void }
  type Options = {
    /**
     * The other window's origin, such as `'https://app.example.com'`. Messages from any other
     * origin are ignored, and messages are posted only to this origin. `'*'` accepts and sends to
     * any origin.
     */
    origin: string
    /** Separates several connections to the same window. Both sides must use the same channel. @default '' */
    channel?: string | undefined
    /** Stops the handshake and listening, and errors the readable with `signal.reason`. */
    signal?: AbortSignal | undefined
  }
}

/**
 * A transport to another window, such as an iframe or a popup. Both sides send a hello every 100 ms
 * until the other answers, so either may start first, and writes wait until the handshake is done.
 * Pass `signal: AbortSignal.timeout(ms)` to give up.
 *
 * @example
 * ```ts
 * import * as Rpc from '@portable/rpc'
 *
 * // In the parent page
 * const iframe = document.querySelector('iframe')!
 * const child = Rpc.connect<ChildApi>(
 *   Rpc.window(iframe.contentWindow!, { origin: 'https://child.example.com' }),
 * )
 *
 * // In the iframe
 * Rpc.serve(api, Rpc.window(window.parent, { origin: 'https://parent.example.com' }))
 * ```
 */
export function window(target: window.Target, options: window.Options): Transport {
  const { origin, channel = '', signal } = options
  const ready = deferred<void>()
  ready.promise.catch(noop)
  let connected = false
  let timer: ReturnType<typeof setTimeout> | undefined
  let listener: (event: MessageEvent) => void
  let onAbort: () => void

  const post = (type: string, data?: unknown) =>
    target.postMessage({ [key]: type, version, channel, data }, origin)
  const hello = () => {
    post('hello')
    timer = setTimeout(hello, retryInterval)
  }
  const stop = () => {
    clearTimeout(timer)
    globalThis.removeEventListener('message', listener)
    signal?.removeEventListener('abort', onAbort)
  }

  const readable = new ReadableStream<unknown>({
    start(controller) {
      const fail = (reason: unknown) => {
        stop()
        ready.reject(reason)
        controller.error(reason)
      }
      listener = (event) => {
        if (event.source !== target || (origin !== '*' && event.origin !== origin)) return
        const message = event.data as Record<string, unknown> | null
        if (typeof message !== 'object' || message === null || message.channel !== channel) return
        const type = message[key]
        if (type === 'message') return controller.enqueue(message.data)
        if (type !== 'hello' && type !== 'ready') return
        if (message.version !== version) {
          return fail(
            new TransportError(
              `The other window uses protocol version ${String(message.version)}.`,
            ),
          )
        }
        if (type === 'hello') post('ready')
        if (connected) return
        connected = true
        clearTimeout(timer)
        ready.resolve()
      }
      onAbort = () => fail(signal!.reason)
      if (signal?.aborted) return onAbort()
      signal?.addEventListener('abort', onAbort)
      globalThis.addEventListener('message', listener)
      hello()
    },
    cancel(reason) {
      stop()
      ready.reject(reason)
    },
  })
  const writable = new WritableStream<unknown>({
    async write(message) {
      await ready.promise
      post('message', message)
    },
  })
  return { readable, writable }
}
