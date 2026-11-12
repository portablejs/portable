import { json } from './connect.js';
import { createServer, error } from './server.js';
import type { Codec, Message } from './types.js';

export declare namespace answer {
  type Options<encoded, received> = {
    /** The methods to call, as for `provide`. */
    methods: object;
    /** One encoded message or batch, such as the `message` a Durable Object's `webSocketMessage` receives. */
    message: NoInfer<received>;
    /** Decodes `message` and encodes the reply. @default Rpc.json */
    codec?: Codec<encoded, received> | undefined;
    /** When it aborts, `answer` aborts the context signal of each method wrapped with `withContext` and rejects with `signal.reason`. */
    signal?: AbortSignal | undefined;
  };

  /** The encoded response or batch of responses, or `undefined` when the message has only notifications. */
  type ReturnType<encoded> = encoded | undefined;
}

/**
 * Answers one encoded message without a transport. It decodes `message`, calls the methods that
 * the message requests, and resolves with the encoded reply to send back, or `undefined` when there
 * is nothing to send. It keeps no state between messages, so it works on a server that can be
 * evicted from memory between messages, such as a Durable Object that accepts WebSockets with
 * hibernation. A method that returns a stream is answered with error code `-32603`, because a
 * stream needs a server that stays in memory.
 *
 * @example
 * ```ts
 * import * as Rpc from '@portable/rpc';
 *
 * export class Room extends DurableObject {
 *   async webSocketMessage(socket: WebSocket, message: string | ArrayBuffer) {
 *     const reply = await Rpc.answer({
 *       methods: methods(socket),
 *       message: typeof message === 'string' ? message : new Uint8Array(message),
 *     });
 *     if (reply !== undefined) {
 *       socket.send(reply);
 *     }
 *   }
 * }
 * ```
 */
export async function answer<encoded = string, received = string | Uint8Array>(
  options: answer.Options<encoded, received>,
): Promise<answer.ReturnType<encoded>> {
  const { methods, message, codec = json as Codec<any>, signal } = options;
  signal?.throwIfAborted();
  let decoded: unknown;
  try {
    decoded = codec.decode(message);
  } catch {
    return codec.encode(error(null, -32700, 'Parse error'));
  }
  let reply: encoded | undefined;
  const server = createServer(
    methods,
    (response: Message) => {
      reply = codec.encode(response);
    },
    { flow: false, streams: false },
  );
  const onAbort = () => server.close(signal!.reason);
  signal?.addEventListener('abort', onAbort);
  try {
    await server.handle(decoded);
  } finally {
    signal?.removeEventListener('abort', onAbort);
  }
  signal?.throwIfAborted();
  return reply;
}
