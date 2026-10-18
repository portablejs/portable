import type { Client } from './client.js'
import type { Params } from './types.js'

type Target = { client: Pick<Client, 'request' | 'notify'>; method: string }

const targets = new WeakMap<object, Target>()

export function remote(client: Target['client'], method = ''): any {
  const children = new Map<string, unknown>()
  const proxy = new Proxy(function () {}, {
    get(_, key) {
      if (typeof key !== 'string' || key === 'then') return undefined
      let child = children.get(key)
      if (!child) children.set(key, (child = remote(client, method ? `${method}.${key}` : key)))
      return child
    },
    apply(_, __, args) {
      return client.request(method, args)
    },
  })
  targets.set(proxy, { client, method })
  return proxy
}

function target(method: unknown): Target {
  const found = typeof method === 'function' ? targets.get(method) : undefined
  if (!found) throw new TypeError('Expected a method of a remote from connect or http.')
  return found
}

type CallParams<fn> = 0 extends 1 & fn ? Params : Parameters<fn & ((...args: any[]) => unknown)>

export declare namespace call {
  type Options = {
    /** Cancels the call: the promise rejects with `signal.reason`, and the remote is sent `$/cancel`. */
    signal?: AbortSignal | undefined
  }
}

/**
 * Calls a remote method with explicit parameters and options. Use it to pass a `signal`, or to send
 * parameters by name (an object), as MCP and LSP servers expect.
 *
 * @example
 * ```ts
 * import * as Rpc from '@portable/rpc'
 *
 * const sum = await Rpc.call(remote.add, [1, 2], { signal: AbortSignal.timeout(5000) })
 *
 * const mcp = Rpc.connect<any>(transport)
 * const { tools } = await Rpc.call(mcp['tools/list'], {})
 * ```
 */
export function call<fn extends (...args: any[]) => unknown>(
  method: fn,
  params: CallParams<fn>,
  options: call.Options = {},
): ReturnType<fn> {
  const { client, method: name } = target(method)
  return client.request(name, params as Params, options.signal) as ReturnType<fn>
}

export declare namespace notify {
  type Options = {
    /** Rejects with `signal.reason` instead of sending when already aborted. */
    signal?: AbortSignal | undefined
  }
}

/**
 * Sends a JSON-RPC notification: a call without an id, which the remote doesn't answer. The
 * promise resolves once the message is written.
 *
 * @example
 * ```ts
 * import * as Rpc from '@portable/rpc'
 *
 * await Rpc.notify(remote.log, ['page loaded'])
 * await Rpc.notify(mcp['notifications/initialized'], {})
 * ```
 */
export function notify<fn extends (...args: any[]) => unknown>(
  method: fn,
  params: CallParams<fn>,
  options: notify.Options = {},
): Promise<void> {
  const { client, method: name } = target(method)
  return client.notify(name, params as Params, options.signal)
}
