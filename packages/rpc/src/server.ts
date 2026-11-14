import {
  error,
  failure,
  idOf,
  invoke,
  lookup,
  parse,
  respond,
  success,
  type Source,
} from './dispatch.js';
import type { Id, Message, ResponseMessage } from './types.js';
import { noop } from './util.js';

export type Send = (message: Message) => Promise<void> | void;

type Call = {
  controller: AbortController;
  credit: number;
  done: boolean;
  wake: (() => void) | undefined;
  cancel: (() => void) | undefined;
};

export type Server = {
  handle(message: unknown): Promise<void>;
  close(reason?: unknown): void;
};

/**
 * A server that keeps each call in memory until it ends, so it can stream results, apply credit,
 * and cancel calls. `answer` uses the same dispatch without this state.
 */
export function createServer(
  api: object,
  send: Send,
  options: { flow: boolean; request?: Request | undefined },
): Server {
  const { flow, request } = options;
  const calls = new Map<Id, Call>();
  const notifications = new Set<Call>();

  async function handle(message: unknown): Promise<void> {
    const response = await respond(message, run);
    if (response) {
      await reply(response);
    }
  }

  async function reply(response: ResponseMessage | ResponseMessage[]): Promise<void> {
    try {
      await send(response);
    } catch (e) {
      if (Array.isArray(response)) {
        for (const single of response) {
          await reply(single);
        }
      } else if (!('error' in response)) {
        await Promise.resolve(send(failure(response.id, e))).catch(noop);
      }
    }
  }

  async function run(message: unknown): Promise<ResponseMessage | undefined> {
    const parsed = parse(message);
    if (!parsed) {
      return error(null, -32600, 'Invalid Request');
    }
    const { id, notification, method, params } = parsed;
    if (notification && method === '$/cancel') {
      return cancel(idOf(params));
    }
    if (notification && method === '$/stream/credit') {
      return addCredit(params);
    }
    const target = lookup(api, method);
    if (!target) {
      return notification ? undefined : error(id, -32601, 'Method not found');
    }
    const call = {
      controller: new AbortController(),
      credit: flow ? 0 : Infinity,
      done: false,
      wake: undefined,
      cancel: undefined,
    } satisfies Call;
    if (notification) {
      notifications.add(call);
    } else {
      calls.set(id, call);
    }
    const outcome = await invoke(target, params, { signal: call.controller.signal, request });
    if (notification) {
      notifications.delete(call);
      if (outcome.kind === 'stream') {
        outcome.source.cancel();
      }
      return;
    }
    if (call.done) {
      if (outcome.kind === 'stream') {
        outcome.source.cancel();
      }
      return;
    }
    if (outcome.kind === 'stream') {
      void pump(id, call, outcome.source);
      return;
    }
    calls.delete(id);
    return outcome.kind === 'value' ? success(id, outcome.value) : failure(id, outcome.error);
  }

  async function pump(id: Id, call: Call, source: Source) {
    call.cancel = source.cancel;
    try {
      await send({ jsonrpc: '2.0', method: '$/stream', params: { id } });
      for (;;) {
        while (call.credit <= 0 && !call.done) {
          await new Promise<void>((r) => (call.wake = r));
        }
        if (call.done) {
          return;
        }
        const { done, value } = await source.next();
        if (call.done) {
          return;
        }
        if (done) {
          break;
        }
        call.credit--;
        const sent = send({ jsonrpc: '2.0', method: '$/stream/next', params: { id, value } });
        if (sent instanceof Promise) {
          await sent;
        }
      }
      finish(id, call);
      await send({ jsonrpc: '2.0', id, result: null });
    } catch (e) {
      if (call.done) {
        return;
      }
      finish(id, call);
      source.cancel();
      await Promise.resolve(send(failure(id, e))).catch(noop);
    }
  }

  function finish(id: Id, call: Call) {
    call.done = true;
    calls.delete(id);
  }

  function stop(call: Call, reason?: unknown) {
    call.done = true;
    call.controller.abort(reason);
    call.wake?.();
    call.cancel?.();
  }

  function cancel(id: Id | undefined): undefined {
    const call = id === undefined ? undefined : calls.get(id);
    if (!call) {
      return;
    }
    calls.delete(id!);
    stop(call);
    void Promise.resolve(send(error(id!, -32800, 'Request cancelled'))).catch(noop);
  }

  function addCredit(params: unknown): undefined {
    const call = calls.get(idOf(params) ?? null);
    const credit = (params as { credit?: unknown }).credit;
    if (!call || typeof credit !== 'number' || !(credit > 0)) {
      return;
    }
    call.credit += credit;
    call.wake?.();
  }

  function close(reason?: unknown) {
    for (const call of [...calls.values(), ...notifications]) {
      stop(call, reason);
    }
    calls.clear();
    notifications.clear();
  }

  return { handle, close };
}
