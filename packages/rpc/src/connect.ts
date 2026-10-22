import { createClient } from './client.js'
import { TransportError } from './errors.js'
import { remote } from './remote.js'
import { direct } from './port.js'
import { createServer, error, noop, type Send } from './server.js'
import type { Codec, Remote, Transport } from './types.js'

const decoder = new TextDecoder()

/**
 * The default codec: JSON text. It decodes text or UTF-8 bytes, so it reads binary WebSocket
 * frames too.
 *
 * @example
 * ```ts
 * import * as Rpc from '@portable/rpc'
 * import * as cbor from 'cborg'
 *
 * Rpc.connect(transport, { codec: Rpc.json })
 * Rpc.connect(transport, { codec: { encode: cbor.encode, decode: cbor.decode } })
 * ```
 */
export const json: Codec<string | Uint8Array> = {
  encode: (message) => JSON.stringify(message),
  decode: (data) => JSON.parse(typeof data === 'string' ? data : decoder.decode(data)),
}

export declare namespace connect {
  type Options = {
    /** Encodes messages for the transport. @default Rpc.json */
    codec?: Codec<any> | undefined
    /** Methods the other side can call over the same transport. */
    methods?: object | undefined
    /** Closes the connection: waiting calls reject with `signal.reason`, and the transport is cancelled. */
    signal?: AbortSignal | undefined
  }
}

/**
 * Connects to an API served on the other side of `transport` and returns a proxy for it. Calling
 * a method sends a JSON-RPC request and returns a promise for the result. Pass `methods` to answer
 * calls from the other side over the same transport.
 *
 * @example
 * ```ts
 * import * as Rpc from '@portable/rpc'
 * import type { Api } from './worker.ts'
 *
 * const worker = Rpc.connect<Api>(Rpc.port(new Worker('./worker.ts', { type: 'module' })))
 * await worker.add(1, 2)
 * for await (const event of worker.watch('x')) console.log(event)
 * ```
 */
export function connect<api>(transport: Transport, options: connect.Options = {}): Remote<api> {
  const { codec = json, methods = {}, signal } = options
  const port = direct.get(transport)
  const failed = (cause: unknown) =>
    close(signal?.aborted ? signal.reason : new TransportError('The transport failed.', { cause }))
  let unlisten: (() => void) | undefined
  const reader = port?.listen ? undefined : transport.readable.getReader()
  const writer = port ? undefined : transport.writable.getWriter()
  const send: Send = port
    ? (message) => port.post(codec.encode(message))
    : (message) => writer!.write(codec.encode(message))
  const client = createClient(send, true)
  const server = createServer(methods, send, { flow: true })

  function close(reason: unknown) {
    signal?.removeEventListener('abort', onAbort)
    unlisten?.()
    client.close(reason)
    server.close(reason)
  }
  function onAbort() {
    close(signal!.reason)
    reader?.cancel(signal!.reason).catch(noop)
    writer?.abort(signal!.reason).catch(noop)
  }
  if (port?.listen) unlisten = port.listen(dispatch, failed)
  if (signal?.aborted) onAbort()
  else signal?.addEventListener('abort', onAbort)

  function dispatch(data: unknown) {
    let message: unknown
    try {
      message = codec.decode(data)
    } catch {
      void Promise.resolve(send(error(null, -32700, 'Parse error'))).catch(noop)
      return
    }
    if (isResponse(message)) client.receive(message)
    else if (Array.isArray(message) && message.length > 0 && message.every(isResponse)) {
      for (const response of message) client.receive(response)
    } else void server.handle(message).catch(noop)
  }

  if (reader) {
    void (async () => {
      try {
        for (;;) {
          const { done, value } = await reader.read()
          if (done) break
          dispatch(value)
        }
        close(new TransportError('The transport closed.'))
      } catch (cause) {
        failed(cause)
      }
    })()
  }

  return remote(client)
}

export declare namespace provide {
  type Options = Omit<connect.Options, 'methods'>
}

/**
 * Answers calls to `methods` over `transport`: every method, including methods of nested objects as
 * `'name.method'`, can be called with JSON-RPC. A method that returns an async iterable or a
 * `ReadableStream` streams its values back with backpressure.
 *
 * @example
 * ```ts
 * import * as Rpc from '@portable/rpc'
 *
 * const api = {
 *   add: (a: number, b: number) => a + b,
 *   async *watch(id: string) {
 *     for (let i = 0; ; i++) yield { id, i }
 *   },
 * }
 * export type Api = typeof api
 *
 * Rpc.provide(Rpc.port(self), api)
 * ```
 */
export function provide(
  transport: Transport,
  methods: object,
  options: provide.Options = {},
): void {
  connect(transport, { ...options, methods })
}

function isResponse(message: unknown): message is Record<string, unknown> {
  if (message === null || typeof message !== 'object' || Array.isArray(message)) return false
  if ('method' in message)
    return message.method === '$/stream' || message.method === '$/stream/next'
  return 'result' in message || 'error' in message
}
