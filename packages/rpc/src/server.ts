import { RemoteError } from './errors.js'
import type { Context, ErrorObject, Id, Message, ResponseMessage } from './types.js'

export type Send = (message: Message) => Promise<void> | void

type Call = {
  controller: AbortController
  credit: number
  done: boolean
  wake: (() => void) | undefined
  cancel: (() => void) | undefined
}

type Source = { next: () => Promise<IteratorResult<unknown>>; cancel: () => void }

const contextKey = Symbol.for('portable.rpc.context')

/**
 * Wraps a method so that it receives a `Context` as its first argument when it is called
 * remotely. The context's `signal` aborts when the caller cancels the call or the connection
 * closes. Callers see the method without the context argument.
 *
 * @example
 * ```ts
 * import * as Rpc from '@portable/rpc'
 *
 * const api = {
 *   search: Rpc.withContext(async ({ signal }, query: string) => {
 *     const response = await fetch(`https://example.com/search?q=${query}`, { signal })
 *     return response.json()
 *   }),
 * }
 * ```
 */
export function withContext<args extends unknown[], result>(
  fn: (context: Context, ...args: args) => result,
): (...args: args) => result {
  const wrapper = function (this: unknown, ...args: args) {
    return fn.call(this, { signal: new AbortController().signal }, ...args)
  }
  Object.defineProperty(wrapper, contextKey, { value: fn })
  return wrapper
}

export const error = (id: Id, code: number, message: string): ResponseMessage => ({
  jsonrpc: '2.0',
  id,
  error: { code, message },
})

export type Server = {
  handle(message: unknown): Promise<void>
  close(reason?: unknown): void
}

export function createServer(
  api: object,
  send: Send,
  options: { flow: boolean; request?: Request | undefined },
): Server {
  const { flow, request } = options
  const calls = new Map<Id, Call>()

  async function handle(message: unknown): Promise<void> {
    if (!Array.isArray(message)) {
      const response = await run(message)
      if (response) await reply(response)
      return
    }
    if (message.length === 0) return reply(error(null, -32600, 'Invalid Request'))
    const responses = (await Promise.all(message.map(run))).filter((r) => r !== undefined)
    if (responses.length > 0) await reply(responses)
  }

  async function reply(response: ResponseMessage | ResponseMessage[]): Promise<void> {
    try {
      await send(response)
    } catch (e) {
      if (Array.isArray(response)) for (const single of response) await reply(single)
      else if (!('error' in response)) {
        await Promise.resolve(
          send({ jsonrpc: '2.0', id: response.id, error: toErrorObject(e) }),
        ).catch(noop)
      }
    }
  }

  async function run(message: unknown): Promise<ResponseMessage | undefined> {
    if (!isRequest(message)) return error(null, -32600, 'Invalid Request')
    const { method, params } = message
    const notification = !('id' in message)
    const id = notification ? null : (message.id as Id)
    if (notification && method === '$/cancel') return cancel(idOf(params))
    if (notification && method === '$/stream/credit') return addCredit(params)

    const target = lookup(api, method)
    if (!target) return notification ? undefined : error(id, -32601, 'Method not found')
    const [holder, fn] = target
    const call: Call = {
      controller: new AbortController(),
      credit: flow ? 0 : Infinity,
      done: false,
      wake: undefined,
      cancel: undefined,
    }
    if (!notification) calls.set(id, call)
    try {
      const args = params === undefined ? [] : Array.isArray(params) ? params : [params]
      const original = (fn as { [contextKey]?: Function })[contextKey]
      let result: unknown = original
        ? original.call(holder, { signal: call.controller.signal, request }, ...args)
        : fn.apply(holder, args)
      if (isThenable(result)) result = await result
      if (isStream(result)) {
        if (notification || call.done) open(result).cancel()
        else void pump(id, call, open(result))
        return
      }
      if (call.done) return
      calls.delete(id)
      if (notification) return
      return { jsonrpc: '2.0', id, result: result === undefined ? null : result }
    } catch (e) {
      if (call.done || notification) return
      calls.delete(id)
      return { jsonrpc: '2.0', id, error: toErrorObject(e) }
    }
  }

  async function pump(id: Id, call: Call, source: Source) {
    call.cancel = source.cancel
    try {
      await send({ jsonrpc: '2.0', method: '$/stream', params: { id } })
      for (;;) {
        while (call.credit <= 0 && !call.done) await new Promise<void>((r) => (call.wake = r))
        if (call.done) return
        const { done, value } = await source.next()
        if (call.done) return
        if (done) break
        call.credit--
        const sent = send({ jsonrpc: '2.0', method: '$/stream/next', params: { id, value } })
        if (sent instanceof Promise) await sent
      }
      finish(id, call)
      await send({ jsonrpc: '2.0', id, result: null })
    } catch (e) {
      if (call.done) return
      finish(id, call)
      source.cancel()
      await Promise.resolve(send({ jsonrpc: '2.0', id, error: toErrorObject(e) })).catch(noop)
    }
  }

  function finish(id: Id, call: Call) {
    call.done = true
    calls.delete(id)
  }

  function stop(call: Call, reason?: unknown) {
    call.done = true
    call.controller.abort(reason)
    call.wake?.()
    call.cancel?.()
  }

  function cancel(id: Id | undefined): undefined {
    const call = id === undefined ? undefined : calls.get(id)
    if (!call) return
    calls.delete(id!)
    stop(call)
    void Promise.resolve(send(error(id!, -32800, 'Request cancelled'))).catch(noop)
  }

  function addCredit(params: unknown): undefined {
    const call = calls.get(idOf(params) ?? null)
    const credit = (params as { credit?: unknown }).credit
    if (!call || typeof credit !== 'number' || !(credit > 0)) return
    call.credit += credit
    call.wake?.()
  }

  function close(reason?: unknown) {
    for (const call of calls.values()) stop(call, reason)
    calls.clear()
  }

  return { handle, close }
}

function lookup(api: object, method: string): [object, Function] | undefined {
  if (method.startsWith('rpc.')) return
  let holder: unknown = api
  let value = property(api, method)
  if (value === undefined && method.includes('.')) {
    value = api
    for (const key of method.split('.')) {
      holder = value
      value = property(value, key)
      if (value === undefined) return
    }
  }
  return typeof value === 'function' ? [holder as object, value] : undefined
}

function property(object: unknown, key: string): unknown {
  if (object === null || typeof object !== 'object') return
  if (!Object.hasOwn(object, key) && key in Object.prototype) return
  return (object as Record<string, unknown>)[key]
}

function isRequest(
  message: unknown,
): message is { method: string; params?: unknown; id?: unknown } & object {
  if (message === null || typeof message !== 'object') return false
  const { jsonrpc, method, params, id } = message as Record<string, unknown>
  return (
    jsonrpc === '2.0' &&
    typeof method === 'string' &&
    (params === undefined || (params !== null && typeof params === 'object')) &&
    (id === undefined || id === null || typeof id === 'string' || typeof id === 'number')
  )
}

function idOf(params: unknown): Id | undefined {
  if (params === null || typeof params !== 'object') return
  const { id } = params as { id?: unknown }
  return typeof id === 'string' || typeof id === 'number' ? id : undefined
}

export function toErrorObject(e: unknown): ErrorObject {
  if (e instanceof RemoteError) {
    return e.data === undefined
      ? { code: e.code, message: e.message }
      : { code: e.code, message: e.message, data: e.data }
  }
  const message = (e as { message?: unknown } | null)?.message
  return { code: -32603, message: typeof message === 'string' ? message : String(e) }
}

export function isStream(value: unknown): value is ReadableStream | AsyncIterable<unknown> {
  return (
    value instanceof ReadableStream ||
    (value !== null &&
      typeof value === 'object' &&
      typeof (value as AsyncIterable<unknown>)[Symbol.asyncIterator] === 'function')
  )
}

function open(source: ReadableStream | AsyncIterable<unknown>): Source {
  if (source instanceof ReadableStream) {
    const reader = source.getReader()
    return { next: () => reader.read(), cancel: () => void reader.cancel().catch(noop) }
  }
  const iterator = source[Symbol.asyncIterator]()
  return {
    next: () => iterator.next(),
    cancel: () => void Promise.resolve(iterator.return?.()).catch(noop),
  }
}

const isThenable = (value: unknown): value is PromiseLike<unknown> =>
  value !== null &&
  (typeof value === 'object' || typeof value === 'function') &&
  typeof (value as PromiseLike<unknown>).then === 'function'

export const noop = (): void => {}

export type Deferred<value> = {
  promise: Promise<value>
  resolve: (value: value) => void
  reject: (reason: unknown) => void
}

export function deferred<value>(): Deferred<value> {
  let resolve!: (value: value) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<value>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}
