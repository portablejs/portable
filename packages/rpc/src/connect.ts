import { createClient } from './client.js';
import type { AsyncDisposeMethod } from '@portable/errors/internal';
import { TransportError } from './errors.js';
import { remote } from './remote.js';
import { direct } from './port.js';
import { error } from './dispatch.js';
import { createServer, type Send, type Server } from './server.js';
import { deferred, noop } from './util.js';
import type { Codec, Id, Message, Remote, Transport } from './types.js';

const decoder = new TextDecoder();

/**
 * The default codec: JSON text. It decodes text or UTF-8 bytes, so it reads binary WebSocket
 * frames too.
 *
 * @example
 * ```ts
 * import * as Rpc from '@portable/rpc';
 * import * as cbor from 'cborg';
 *
 * Rpc.connect(transport, { codec: Rpc.json });
 * Rpc.connect(transport, { codec: { encode: cbor.encode, decode: cbor.decode } });
 * ```
 */
export const json: Codec<string, string | Uint8Array> = {
  encode: (message) => JSON.stringify(message),
  decode: (data) => JSON.parse(typeof data === 'string' ? data : decoder.decode(data)),
};

export declare namespace connect {
  type Options = {
    /** Encodes messages for the transport. @default Rpc.json */
    codec?: Codec<any> | undefined;
    /** Methods the other side can call over the same transport. */
    methods?: object | undefined;
    /** Closes the connection: waiting calls reject with `signal.reason`, and the transport is cancelled. */
    signal?: AbortSignal | undefined;
  };
}

/**
 * Connects to an API served on the other side of `transport` and returns a proxy for it. Calling
 * a method sends a JSON-RPC request and returns a promise for the result. Pass `methods` to answer
 * calls from the other side over the same transport.
 *
 * `transport` can also be a stream of transports, one per connection, such as the stream that
 * `connections` from the websockets package returns. `connect` then sends on the newest transport
 * and holds calls made between transports. When a transport's `readable` ends, the calls whose
 * requests went out on it reject with `TransportError`.
 *
 * Where the runtime has `Symbol.asyncDispose`, the proxy's `[Symbol.asyncDispose]()` closes the
 * connection as aborting `signal` does, with an `AbortError` `DOMException`, so a remote declared
 * with `await using` is closed when the scope ends.
 *
 * @example
 * ```ts
 * import * as Rpc from '@portable/rpc';
 * import type { Api } from './worker.ts';
 *
 * const worker = Rpc.connect<Api>(Rpc.port(new Worker('./worker.ts', { type: 'module' })));
 * await worker.add(1, 2);
 * for await (const event of worker.watch('x')) {
 *   console.log(event);
 * }
 * ```
 */
export function connect<api>(
  transport: Transport | ReadableStream<Transport>,
  options: connect.Options = {},
): Remote<api> & AsyncDisposeMethod {
  if (!('writable' in transport)) {
    return reconnecting(transport, options);
  }
  const { codec = json, methods = {}, signal } = options;
  const port = direct.get(transport);
  const failed = (cause: unknown) =>
    close(signal?.aborted ? signal.reason : new TransportError('The transport failed.', { cause }));
  let unlisten: (() => void) | undefined;
  const reader = port?.listen ? undefined : transport.readable.getReader();
  const writer = port ? undefined : transport.writable.getWriter();
  const send = (
    port
      ? (message: Message) => port.post(codec.encode(message))
      : (message: Message) => writer!.write(codec.encode(message))
  ) satisfies Send;
  const client = createClient(send, true);
  const server = createServer(methods, send, { flow: true });

  function close(reason: unknown) {
    signal?.removeEventListener('abort', onAbort);
    unlisten?.();
    client.close(reason);
    server.close(reason);
  }
  function shutdown(reason: unknown): Promise<unknown> {
    close(reason);
    return Promise.all([reader?.cancel(reason).catch(noop), writer?.abort(reason).catch(noop)]);
  }
  function onAbort() {
    void shutdown(signal!.reason);
  }
  if (port?.listen) {
    unlisten = port.listen(dispatch, failed);
  }
  if (signal?.aborted) {
    onAbort();
  } else {
    signal?.addEventListener('abort', onAbort);
  }

  function dispatch(data: unknown) {
    let message: unknown;
    try {
      message = codec.decode(data);
    } catch {
      void Promise.resolve(send(error(null, -32700, 'Parse error'))).catch(noop);
      return;
    }
    if (isResponse(message)) {
      client.receive(message);
    } else if (Array.isArray(message) && message.length > 0 && message.every(isResponse)) {
      for (const response of message) {
        client.receive(response);
      }
    } else {
      void server.handle(message).catch(noop);
    }
  }

  if (reader) {
    void (async () => {
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) {
            break;
          }
          dispatch(value);
        }
        close(new TransportError('The transport closed.'));
      } catch (cause) {
        failed(cause);
      }
    })();
  }

  return remote(client, '', async () => {
    await shutdown(new DOMException('The connection was disposed.', 'AbortError'));
  });
}

type Connection = {
  reader: ReadableStreamDefaultReader<unknown>;
  writer: WritableStreamDefaultWriter<unknown>;
  server: Server;
  calls: Set<Id>;
};

function reconnecting<api>(
  transports: ReadableStream<Transport>,
  options: connect.Options,
): Remote<api> & AsyncDisposeMethod {
  const { codec = json, methods = {}, signal } = options;
  const source = transports.getReader();
  const queue: { message: Message; data: unknown; written: () => void }[] = [];
  let current: Connection | undefined;
  let closed: { reason: unknown } | undefined;

  const write = async (connection: Connection, message: Message, data: unknown) => {
    const id = requestId(message);
    if (id !== undefined) {
      connection.calls.add(id);
    }
    try {
      await connection.writer.write(data);
    } catch (e) {
      if (id !== undefined) {
        connection.calls.delete(id);
      }
      throw e;
    }
  };
  const send = ((message: Message) => {
    if (closed) {
      return Promise.reject(closed.reason);
    }
    const data = codec.encode(message);
    const connection = current;
    if (connection && queue.length === 0) {
      return write(connection, message, data).catch(() => {
        if (current === connection) {
          current = undefined;
        }
        return enqueue(message, data);
      });
    }
    return enqueue(message, data);
  }) satisfies Send;
  const enqueue = (message: Message, data: unknown) => {
    const { promise, resolve } = deferred<void>();
    queue.push({ message, data, written: resolve });
    return promise;
  };
  const client = createClient(send, true);

  function dispatch(connection: Connection, data: unknown) {
    let message: unknown;
    try {
      message = codec.decode(data);
    } catch {
      void connection.writer.write(codec.encode(error(null, -32700, 'Parse error'))).catch(noop);
      return;
    }
    const responses = isResponse(message)
      ? [message]
      : Array.isArray(message) && message.length > 0 && message.every(isResponse)
        ? message
        : undefined;
    if (!responses) {
      void connection.server.handle(message).catch(noop);
      return;
    }
    for (const response of responses) {
      if (!('method' in response)) {
        connection.calls.delete(response.id as Id);
      }
      client.receive(response);
    }
  }

  async function run() {
    for (;;) {
      const { done, value } = await source.read();
      if (done) {
        return close(new TransportError('The transport closed.'));
      }
      const writer = value.writable.getWriter();
      const connection = {
        reader: value.readable.getReader(),
        writer,
        server: createServer(methods, (message) => writer.write(codec.encode(message)), {
          flow: true,
        }),
        calls: new Set<Id>(),
      } satisfies Connection;
      let open = true;
      while (open && queue.length > 0 && !closed) {
        const { message, data, written } = queue[0]!;
        try {
          await write(connection, message, data);
          queue.shift();
          written();
        } catch {
          open = false;
        }
      }
      if (open && !closed) {
        current = connection;
      }
      try {
        for (;;) {
          const { done: ended, value: data } = await connection.reader.read();
          if (ended) {
            break;
          }
          dispatch(connection, data);
        }
      } catch {}
      if (current === connection) {
        current = undefined;
      }
      const reason = new TransportError('The connection closed before the call was answered.');
      for (const id of connection.calls) {
        client.fail(id, reason);
      }
      connection.server.close(reason);
      if (closed) {
        return;
      }
    }
  }

  function close(reason: unknown) {
    if (closed) {
      return;
    }
    closed = { reason };
    signal?.removeEventListener('abort', onAbort);
    client.close(reason);
    current?.server.close(reason);
    queue.length = 0;
  }
  function shutdown(reason: unknown): Promise<unknown> {
    const connection = current;
    close(reason);
    return Promise.all([
      source.cancel(reason).catch(noop),
      connection?.reader.cancel(reason).catch(noop),
      connection?.writer.abort(reason).catch(noop),
    ]);
  }
  function onAbort() {
    void shutdown(signal!.reason);
  }
  if (signal?.aborted) {
    onAbort();
  } else {
    signal?.addEventListener('abort', onAbort);
    void run().catch((cause: unknown) =>
      close(
        signal?.aborted ? signal.reason : new TransportError('The transport failed.', { cause }),
      ),
    );
  }

  return remote(client, '', async () => {
    await shutdown(new DOMException('The connection was disposed.', 'AbortError'));
  });
}

function requestId(message: Message): Id | undefined {
  return !Array.isArray(message) && 'id' in message && 'method' in message ? message.id : undefined;
}

export declare namespace provide {
  type Options = Omit<connect.Options, 'methods'>;
}

/**
 * Answers calls to `methods` over `transport`: every method, including methods of nested objects as
 * `'name.method'`, can be called with JSON-RPC. A method that returns an async iterable or a
 * `ReadableStream` streams its values back with backpressure.
 *
 * @example
 * ```ts
 * import * as Rpc from '@portable/rpc';
 *
 * const api = {
 *   add: (a: number, b: number) => a + b,
 *   async *watch(id: string) {
 *     for (let i = 0; ; i++) {
 *       yield { id, i };
 *     }
 *   },
 * };
 * export type Api = typeof api;
 *
 * Rpc.provide(Rpc.port(self), api);
 * ```
 */
export function provide(
  transport: Transport,
  methods: object,
  options: provide.Options = {},
): void {
  connect(transport, { ...options, methods });
}

function isResponse(message: unknown): message is Record<string, unknown> {
  if (message === null || typeof message !== 'object' || Array.isArray(message)) {
    return false;
  }
  if ('method' in message) {
    return message.method === '$/stream' || message.method === '$/stream/next';
  }
  return 'result' in message || 'error' in message;
}
