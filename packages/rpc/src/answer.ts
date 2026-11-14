import { json } from './connect.js';
import { error, failure, invoke, lookup, parse, respond, success } from './dispatch.js';
import type { Codec, Context, ResponseMessage } from './types.js';

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
 * hibernation. It can't stream a result: streaming sends each value in its own message and waits
 * for the client's `$/stream/credit`, so the server has to keep the stream in memory between
 * messages. If a method returns an async iterable or a `ReadableStream`, `answer` cancels it and
 * replies with error code `-32603`.
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
  const response = await respondStateless(methods, decoded, {
    signal: signal ?? new AbortController().signal,
  });
  signal?.throwIfAborted();
  return response === undefined ? undefined : encode(codec, response);
}

/**
 * Answers a decoded message without keeping state between messages, as `answer` does. `handler`
 * uses it when its codec can't stream.
 */
export function respondStateless(
  methods: object,
  decoded: unknown,
  context: Context,
): Promise<ResponseMessage | ResponseMessage[] | undefined> {
  const run = async (message: unknown): Promise<ResponseMessage | undefined> => {
    const parsed = parse(message);
    if (!parsed) {
      return error(null, -32600, 'Invalid Request');
    }
    const { id, notification, method, params } = parsed;
    if (notification && (method === '$/cancel' || method === '$/stream/credit')) {
      return;
    }
    const target = lookup(methods, method);
    if (!target) {
      return notification ? undefined : error(id, -32601, 'Method not found');
    }
    const outcome = await invoke(target, params, context);
    if (outcome.kind === 'stream') {
      outcome.source.cancel();
      return notification ? undefined : error(id, -32603, streamsUnsupported);
    }
    if (notification) {
      return;
    }
    return outcome.kind === 'value' ? success(id, outcome.value) : failure(id, outcome.error);
  };
  return respond(decoded, run);
}

const streamsUnsupported = 'The method returned a stream, which this server cannot send.';

/**
 * Encodes `response`. If the codec can't encode a result, that response becomes an error
 * response, as `provide` sends when its transport can't write a result.
 */
export function encode<encoded>(
  codec: Codec<encoded, any>,
  response: ResponseMessage | ResponseMessage[],
): encoded {
  try {
    return codec.encode(response);
  } catch (e) {
    const fallback = (single: ResponseMessage, reason: unknown): ResponseMessage =>
      'error' in single ? single : failure(single.id, reason);
    if (!Array.isArray(response)) {
      return codec.encode(fallback(response, e));
    }
    return codec.encode(
      response.map((single) => {
        try {
          codec.encode(single);
          return single;
        } catch (reason) {
          return fallback(single, reason);
        }
      }),
    );
  }
}
