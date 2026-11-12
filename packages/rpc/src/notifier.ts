import { isEmpty } from './client.js';
import { json } from './connect.js';
import { remote } from './remote.js';
import type { Codec, Params } from './types.js';

/**
 * The type of a notifier for an API type. Every method sends a notification and returns a promise
 * that resolves once `send` returns or its promise resolves.
 */
export type Notifier<api> = 0 extends 1 & api
  ? any
  : {
      readonly [key in keyof api]: api[key] extends (...args: infer args) => unknown
        ? (...args: args) => Promise<void>
        : api[key] extends object
          ? Notifier<api[key]>
          : never;
    };

export declare namespace notifier {
  type Options = {
    /** Encodes each notification. @default Rpc.json */
    codec?: Codec<any> | undefined;
  };
}

/**
 * Returns a proxy that sends JSON-RPC notifications without a connection. Calling a method encodes
 * a notification and passes it to `send`. The method's parameters are type-checked against `api`. Use it
 * to push messages to a client from code that has no transport, such as a Durable Object pushing to
 * the WebSockets it accepted with hibernation. To send params by name, pass a method of
 * the proxy to `Rpc.notify`.
 *
 * @example
 * ```ts
 * import * as Rpc from '@portable/rpc';
 * import type { ClientApi } from './client.ts';
 *
 * const clients = Rpc.notifier<ClientApi>((data) => {
 *   for (const socket of ctx.getWebSockets('circle:42')) {
 *     socket.send(data);
 *   }
 * });
 * await clients.notice({ text: 'Hello' });
 * ```
 */
export function notifier<api>(
  send: (data: any) => void | PromiseLike<void>,
  options: notifier.Options = {},
): Notifier<api> {
  const { codec = json } = options;
  const notify = async (method: string, params: Params | undefined, signal?: AbortSignal) => {
    signal?.throwIfAborted();
    await send(
      codec.encode(
        isEmpty(params) ? { jsonrpc: '2.0', method } : { jsonrpc: '2.0', method, params },
      ),
    );
  };
  return remote({ request: notify, notify });
}
