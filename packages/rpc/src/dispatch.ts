import { RemoteError } from './errors.js';
import type { Context, ErrorObject, Id, ResponseMessage } from './types.js';
import { noop } from './util.js';

export type Source = { next: () => Promise<IteratorResult<unknown>>; cancel: () => void };

/** A message that passed the JSON-RPC 2.0 request checks. */
export type Parsed = { id: Id; notification: boolean; method: string; params: unknown };

/** What calling a method produced. */
export type Outcome =
  | { kind: 'value'; value: unknown }
  | { kind: 'stream'; source: Source }
  | { kind: 'error'; error: unknown };

const contextKey = Symbol.for('portable.rpc.context');

/**
 * Wraps a method so that it receives a `Context` as its first argument when it is called
 * remotely. The context's `signal` aborts when the caller cancels the call or the connection
 * closes. The remote's type has the method without the context argument.
 *
 * @example
 * ```ts
 * import * as Rpc from '@portable/rpc';
 *
 * const api = {
 *   search: Rpc.withContext(async ({ signal }, query: string) => {
 *     const response = await fetch(`https://example.com/search?q=${query}`, { signal });
 *     return response.json();
 *   }),
 * };
 * ```
 */
export function withContext<args extends unknown[], result>(
  fn: (context: Context, ...args: args) => result,
): (...args: args) => result {
  const wrapper = function (this: unknown, ...args: args) {
    return fn.call(this, { signal: new AbortController().signal }, ...args);
  };
  Object.defineProperty(wrapper, contextKey, { value: fn });
  return wrapper;
}

export const error = (id: Id, code: number, message: string): ResponseMessage => ({
  jsonrpc: '2.0',
  id,
  error: { code, message },
});

/**
 * Runs `run` for a message or for each message of a batch, and returns what to reply: one
 * response, a batch of responses, or `undefined` when there is nothing to reply.
 */
export async function respond(
  message: unknown,
  run: (message: unknown) => Promise<ResponseMessage | undefined>,
): Promise<ResponseMessage | ResponseMessage[] | undefined> {
  if (!Array.isArray(message)) {
    return run(message);
  }
  if (message.length === 0) {
    return error(null, -32600, 'Invalid Request');
  }
  const responses = (await Promise.all(message.map(run))).filter((r) => r !== undefined);
  return responses.length > 0 ? responses : undefined;
}

export function parse(message: unknown): Parsed | undefined {
  if (!isRequest(message)) {
    return;
  }
  const notification = !('id' in message);
  return {
    id: notification ? null : (message.id as Id),
    notification,
    method: message.method,
    params: message.params,
  };
}

/** Calls a method found by `lookup` with `params`, and gives a method wrapped with `withContext` the context. */
export async function invoke(
  target: [object, Function],
  params: unknown,
  context: Context,
): Promise<Outcome> {
  const [holder, fn] = target;
  try {
    const args = params === undefined ? [] : Array.isArray(params) ? params : [params];
    const original = (fn as { [contextKey]?: Function | undefined })[contextKey];
    let result: unknown = original
      ? original.call(holder, context, ...args)
      : fn.apply(holder, args);
    if (isThenable(result)) {
      result = await result;
    }
    return isStream(result)
      ? { kind: 'stream', source: open(result) }
      : { kind: 'value', value: result };
  } catch (e) {
    return { kind: 'error', error: e };
  }
}

export const success = (id: Id, value: unknown): ResponseMessage => ({
  jsonrpc: '2.0',
  id,
  result: value === undefined ? null : value,
});

export const failure = (id: Id, e: unknown): ResponseMessage => ({
  jsonrpc: '2.0',
  id,
  error: toErrorObject(e),
});

export function lookup(api: object, method: string): [object, Function] | undefined {
  if (method.startsWith('rpc.')) {
    return;
  }
  let holder: unknown = api;
  let value = property(api, method);
  if (value === undefined && method.includes('.')) {
    value = api;
    for (const key of method.split('.')) {
      holder = value;
      value = property(value, key);
      if (value === undefined) {
        return;
      }
    }
  }
  return typeof value === 'function' ? [holder as object, value] : undefined;
}

function property(object: unknown, key: string): unknown {
  if (object === null || typeof object !== 'object') {
    return;
  }
  if (!Object.hasOwn(object, key) && key in Object.prototype) {
    return;
  }
  return (object as Record<string, unknown>)[key];
}

function isRequest(
  message: unknown,
): message is { method: string; params?: unknown; id?: unknown } & object {
  if (message === null || typeof message !== 'object') {
    return false;
  }
  const { jsonrpc, method, params, id } = message as Record<string, unknown>;
  return (
    jsonrpc === '2.0' &&
    typeof method === 'string' &&
    (params === undefined || (params !== null && typeof params === 'object')) &&
    (id === undefined || id === null || typeof id === 'string' || typeof id === 'number')
  );
}

export function idOf(params: unknown): Id | undefined {
  if (params === null || typeof params !== 'object') {
    return;
  }
  const { id } = params as { id?: unknown };
  return typeof id === 'string' || typeof id === 'number' ? id : undefined;
}

export function toErrorObject(e: unknown): ErrorObject {
  if (e instanceof RemoteError) {
    return e.data === undefined
      ? { code: e.code, message: e.message }
      : { code: e.code, message: e.message, data: e.data };
  }
  const message = (e as { message?: unknown } | null)?.message;
  return { code: -32603, message: typeof message === 'string' ? message : String(e) };
}

export function isStream(value: unknown): value is ReadableStream | AsyncIterable<unknown> {
  return (
    value instanceof ReadableStream ||
    (value !== null &&
      typeof value === 'object' &&
      typeof (value as AsyncIterable<unknown>)[Symbol.asyncIterator] === 'function')
  );
}

function open(source: ReadableStream | AsyncIterable<unknown>): Source {
  if (source instanceof ReadableStream) {
    const reader = source.getReader();
    return { next: () => reader.read(), cancel: () => void reader.cancel().catch(noop) };
  }
  const iterator = source[Symbol.asyncIterator]();
  return {
    next: () => iterator.next(),
    cancel: () => void Promise.resolve(iterator.return?.()).catch(noop),
  };
}

const isThenable = (value: unknown): value is PromiseLike<unknown> =>
  value !== null &&
  (typeof value === 'object' || typeof value === 'function') &&
  typeof (value as PromiseLike<unknown>).then === 'function';
