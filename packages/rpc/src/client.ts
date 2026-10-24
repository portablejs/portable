import { RemoteError } from './errors.js'
import { deferred, noop, type Send } from './server.js'
import type { ErrorObject, Id, Params } from './types.js'

const streamWindow = 256

type Call = {
  resolve: (value: unknown) => void
  reject: (reason: unknown) => void
  stream: ReadableStreamDefaultController<unknown> | undefined
  outstanding: number
  signal: AbortSignal | undefined
  onAbort: (() => void) | undefined
}

export type Client = {
  request(
    method: string,
    params: Params | undefined,
    signal?: AbortSignal,
  ): Promise<unknown> & AsyncIterable<unknown>
  notify(method: string, params: Params | undefined, signal?: AbortSignal): Promise<void>
  receive(message: Record<string, unknown>): void
  fail(id: Id, reason: unknown): void
  close(reason: unknown): void
}

export function createClient(send: Send, flow: boolean): Client {
  const calls = new Map<Id, Call>()
  let lastId = 0
  let closed: { reason: unknown } | undefined

  function request(method: string, params: Params | undefined, signal?: AbortSignal) {
    const { promise, resolve, reject } = deferred<unknown>()
    const result = promise as Promise<unknown> & AsyncIterable<unknown>
    result[Symbol.asyncIterator] = iterate
    if (closed) {
      reject(closed.reason)
      return result
    }
    if (signal?.aborted) {
      reject(signal.reason)
      return result
    }
    const id = ++lastId
    const call: Call = {
      resolve,
      reject,
      stream: undefined,
      outstanding: 0,
      signal,
      onAbort: undefined,
    }
    calls.set(id, call)
    if (signal) {
      call.onAbort = () => abort(id, signal.reason)
      signal.addEventListener('abort', call.onAbort)
    }
    try {
      const message = isEmpty(params)
        ? { jsonrpc: '2.0' as const, id, method }
        : { jsonrpc: '2.0' as const, id, method, params }
      const sent = send(message)
      if (sent instanceof Promise) {
        sent.catch((e: unknown) => fail(id, e))
      }
    } catch (e) {
      fail(id, e)
    }
    return result
  }

  async function notify(method: string, params: Params | undefined, signal?: AbortSignal) {
    if (closed) {
      throw closed.reason
    }
    signal?.throwIfAborted()
    await send(isEmpty(params) ? { jsonrpc: '2.0', method } : { jsonrpc: '2.0', method, params })
  }

  function settle(id: Id): Call | undefined {
    const call = calls.get(id)
    if (!call) {
      return
    }
    calls.delete(id)
    if (call.onAbort) {
      call.signal!.removeEventListener('abort', call.onAbort)
    }
    return call
  }

  function fail(id: Id, reason: unknown) {
    const call = settle(id)
    if (!call) {
      return
    }
    if (call.stream) {
      call.stream.error(reason)
    } else {
      call.reject(reason)
    }
  }

  function abort(id: Id, reason: unknown) {
    if (!calls.has(id)) {
      return
    }
    fail(id, reason)
    void Promise.resolve(send({ jsonrpc: '2.0', method: '$/cancel', params: { id } })).catch(noop)
  }

  function receive(message: Record<string, unknown>) {
    if (typeof message.method === 'string') {
      const params = message.params as { id?: Id | undefined; value?: unknown } | undefined
      const call = params ? calls.get(params.id ?? null) : undefined
      if (!call) {
        return
      }
      if (message.method === '$/stream' && !call.stream) {
        start(params!.id!, call)
      } else if (message.method === '$/stream/next' && call.stream) {
        call.outstanding--
        call.stream.enqueue(params!.value)
      }
      return
    }
    const call = settle(message.id as Id)
    if (!call) {
      return
    }
    if ('error' in message) {
      const error = new RemoteError(errorObject(message.error))
      if (call.stream) {
        call.stream.error(error)
      } else {
        call.reject(error)
      }
    } else if (call.stream) {
      call.stream.close()
    } else {
      call.resolve(message.result)
    }
  }

  function start(id: Id, call: Call) {
    const stream = new ReadableStream(
      {
        start(controller) {
          call.stream = controller
        },
        pull(controller) {
          if (!flow) {
            return
          }
          const credit = controller.desiredSize! - call.outstanding
          if (credit < streamWindow / 4 || calls.get(id) !== call) {
            return
          }
          call.outstanding += credit
          void Promise.resolve(
            send({ jsonrpc: '2.0', method: '$/stream/credit', params: { id, credit } }),
          ).catch(noop)
        },
        cancel(reason) {
          abort(id, reason)
        },
      },
      { highWaterMark: flow ? streamWindow : 1 },
    )
    call.resolve(stream)
  }

  function close(reason: unknown) {
    closed ??= { reason }
    for (const id of calls.keys()) {
      fail(id, reason)
    }
  }

  return { request, notify, receive, fail, close }
}

function iterate(this: Promise<unknown>): AsyncIterator<unknown> {
  return iterator(this)
}

function iterator(promise: Promise<unknown>): AsyncIterator<unknown> {
  let reader: ReadableStreamDefaultReader<unknown> | undefined
  return {
    async next() {
      if (!reader) {
        const stream = await promise
        if (!(stream instanceof ReadableStream)) {
          throw new TypeError('The result is not a stream.')
        }
        reader = stream.getReader()
      }
      return reader.read() as Promise<IteratorResult<unknown>>
    },
    async return(value?: unknown) {
      if (reader) {
        await reader.cancel()
      } else {
        promise.then((s) => {
          if (s instanceof ReadableStream) {
            void s.cancel()
          }
        }, noop)
      }
      return { done: true, value }
    },
  }
}

function errorObject(value: unknown): ErrorObject {
  const { code, message, data } = (value ?? {}) as Partial<ErrorObject>
  return {
    code: typeof code === 'number' ? code : -32603,
    message: typeof message === 'string' ? message : 'Unknown error',
    data,
  }
}

const isEmpty = (params: Params | undefined): params is undefined | readonly [] =>
  params === undefined || (Array.isArray(params) && params.length === 0)
