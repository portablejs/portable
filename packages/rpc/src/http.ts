import { toBufferSource } from '@portable/bytes/internal';
import * as Errors from '@portable/errors';
import * as Lines from '@portable/lines';
import { encode, respondStateless } from './answer.js';
import { createClient } from './client.js';
import { json } from './connect.js';
import type { AsyncDisposeMethod } from '@portable/errors/internal';
import { RemoteError, TransportError } from './errors.js';
import { remote } from './remote.js';
import { error } from './dispatch.js';
import { createServer } from './server.js';
import { noop } from './util.js';
import type { Codec, Id, Message, Remote } from './types.js';

const ndjson = 'application/x-ndjson';
const textEncoder = new TextEncoder();
const newline = new Uint8Array([10]);

/** A codec for HTTP: `decode` receives the body as bytes, or one line of a streamed response as text. */
type HttpCodec = Codec<string | Uint8Array, string | Uint8Array>;

const mediaType = (codec: HttpCodec) => codec.contentType ?? 'application/octet-stream';
const isJson = (codec: HttpCodec) => mediaType(codec) === 'application/json';
const body = (data: string | Uint8Array) =>
  typeof data === 'string' ? data : toBufferSource(data);

export declare namespace handler {
  type Options = {
    /**
     * Decodes request bodies and encodes responses. Its `contentType` is sent as `content-type`.
     * Results stream only when it is `application/json`. @default Rpc.json
     */
    codec?: Codec<any, any> | undefined;
  };
}

/**
 * Answers calls to `methods` over HTTP. The returned function answers a POST of a JSON-RPC request
 * or batch, encoded with `codec`. With the default JSON codec, a method that returns a stream sends
 * its values as newline-delimited messages as they are produced. With any other codec, a method
 * that returns a stream is answered with error code `-32603`, because the response has no framing
 * for separate messages. Methods wrapped with `withContext` get the `Request`, and their `signal`
 * aborts when the client disconnects.
 *
 * @example
 * ```ts
 * import * as Rpc from '@portable/rpc';
 *
 * const rpc = Rpc.handler(api);
 * export default { fetch: (request: Request) => rpc(request) };
 * ```
 */
export function handler(
  methods: object,
  options: handler.Options = {},
): (request: Request) => Promise<Response> {
  const codec = (options.codec ?? json) satisfies HttpCodec;
  const headers = { 'content-type': mediaType(codec) };
  const respondWith = (response: Message) =>
    new Response(body(encode(codec, response as Parameters<typeof encode>[1])), { headers });
  return async (request) => {
    if (request.method !== 'POST') {
      return new Response(null, { status: 405, headers: { allow: 'POST' } });
    }
    let message: unknown;
    try {
      message = codec.decode(new Uint8Array(await request.arrayBuffer()));
    } catch {
      return respondWith(error(null, -32700, 'Parse error'));
    }
    if (!isJson(codec)) {
      const response = await respondStateless(methods, message, {
        signal: request.signal,
        request,
      });
      return response ? respondWith(response) : new Response(null, { status: 204 });
    }

    const buffered: Message[] = [];
    const streams = new Set<Id>();
    let streamed = false;
    let writer: WritableStreamDefaultWriter<Message> | undefined;
    const send = (message: Message): Promise<void> | void => {
      if (isStreamStart(message)) {
        streamed = true;
        streams.add(message.params.id);
      } else if (!Array.isArray(message) && 'id' in message && !('method' in message)) {
        if (streams.delete(message.id) && streams.size === 0 && writer) {
          return writer.write(message).then(() => writer!.close());
        }
      }
      if (!writer) {
        return void buffered.push(message);
      }
      return writer.write(message);
    };

    const server = createServer(methods, send, { flow: false, request });
    const onAbort = () => server.close(request.signal.reason);
    request.signal.addEventListener('abort', onAbort);
    await server.handle(message);

    if (!streamed) {
      request.signal.removeEventListener('abort', onAbort);
      const [response] = buffered;
      return response ? respondWith(response) : new Response(null, { status: 204 });
    }
    const encoder = new TransformStream<Message, Uint8Array>({
      transform(message, controller) {
        const data = codec.encode(message);
        controller.enqueue(typeof data === 'string' ? textEncoder.encode(`${data}\n`) : data);
        if (typeof data !== 'string') {
          controller.enqueue(newline);
        }
      },
    });
    writer = encoder.writable.getWriter();
    writer.closed.then(
      () => request.signal.removeEventListener('abort', onAbort),
      () => {
        request.signal.removeEventListener('abort', onAbort);
        server.close();
      },
    );
    for (const message of buffered) {
      for (const single of Array.isArray(message) ? message : [message]) {
        void writer.write(single).catch(noop);
      }
    }
    if (streams.size === 0) {
      void writer.close().catch(noop);
    }
    return new Response(encoder.readable, {
      headers: { 'content-type': ndjson },
    });
  };
}

export declare namespace http {
  type Options = {
    /** The `fetch` to send requests with, such as one that adds an `authorization` header. @default globalThis.fetch */
    fetch?: ((request: Request) => Promise<Response>) | undefined;
    /** Aborts every request and rejects waiting calls with `signal.reason`. */
    signal?: AbortSignal | undefined;
    /** Encodes request bodies and decodes responses. Use the same codec as the `handler`. @default Rpc.json */
    codec?: Codec<any, any> | undefined;
  };
}

type Batch = {
  messages: Message[];
  encoded: (string | Uint8Array)[];
  pending: Set<Id>;
  controller: AbortController;
  sent: Promise<void>;
};

/**
 * Connects to an API served by `handler`, or any JSON-RPC server that accepts POST requests. Calls
 * made in the same tick are sent as one batch request. Where the runtime has
 * `Symbol.asyncDispose`, the remote's `[Symbol.asyncDispose]()` aborts every request and rejects
 * waiting calls with an `AbortError` `DOMException`, as aborting `signal` does.
 *
 * @example
 * ```ts
 * import * as Rpc from '@portable/rpc';
 * import type { Api } from './server.ts';
 *
 * const api = Rpc.http<Api>('https://example.com/rpc');
 * await api.add(1, 2);
 * ```
 */
export function http<api>(
  url: string | URL,
  options: http.Options = {},
): Remote<api> & AsyncDisposeMethod {
  const { fetch = (request: Request) => globalThis.fetch(request) } = options;
  const codec = (options.codec ?? json) satisfies HttpCodec;
  const contentType = mediaType(codec);
  const disposer = new AbortController();
  const signal = options.signal
    ? AbortSignal.any([options.signal, disposer.signal])
    : disposer.signal;
  const batches = new Map<Id, Batch>();
  const posting = new Set<AbortController>();
  let queued: Batch | undefined;

  const send = (message: Message): Promise<void> | void => {
    if (!Array.isArray(message) && 'method' in message && message.method === '$/cancel') {
      return cancel((message.params as { id: Id }).id);
    }
    const encoded = codec.encode(message);
    if (!queued) {
      const batch: Batch = {
        messages: [],
        encoded: [],
        pending: new Set(),
        controller: new AbortController(),
        sent: Promise.resolve(),
      };
      batch.sent = batch.sent.then(() => post(batch));
      queued = batch;
    }
    queued.messages.push(message);
    queued.encoded.push(encoded);
    if (!Array.isArray(message) && 'id' in message) {
      queued.pending.add(message.id);
      batches.set(message.id, queued);
    }
    return queued.sent;
  };
  const client = createClient(send, false);

  const cancel = (id: Id) => {
    const batch = batches.get(id);
    if (!batch) {
      return;
    }
    batches.delete(id);
    batch.pending.delete(id);
    if (batch.pending.size === 0) {
      batch.controller.abort();
    }
  };
  const receive = (batch: Batch, message: unknown) => {
    if (message === null || typeof message !== 'object') {
      return;
    }
    const { id, error: remoteError } = message as {
      id?: Id | undefined;
      error?: RemoteError.Options | undefined;
    };
    if ('method' in message || id === undefined) {
      return client.receive(message as Record<string, unknown>);
    }
    if (id === null && remoteError) {
      for (const pending of batch.pending) {
        client.fail(pending, new RemoteError(remoteError));
      }
      return;
    }
    if (batch.pending.delete(id)) {
      batches.delete(id);
    }
    client.receive(message as Record<string, unknown>);
  };

  async function post(batch: Batch) {
    queued = undefined;
    const { messages, encoded, controller, pending } = batch;
    if (signal.aborted) {
      controller.abort(signal.reason);
    }
    posting.add(controller);
    try {
      const response = await fetch(
        new Request(url, {
          method: 'POST',
          headers: { 'content-type': contentType, accept: `${contentType}, ${ndjson}` },
          body: body(
            encoded.length === 1
              ? encoded[0]!
              : isJson(codec) && encoded.every((part) => typeof part === 'string')
                ? `[${encoded.join(',')}]`
                : codec.encode(messages as Message),
          ),
          signal: controller.signal,
        }),
      );
      if (!response.ok) {
        await response.body?.cancel().catch(() => {});
        throw new TransportError(`The server answered ${response.status}.`, {
          cause: new Errors.ResponseError({ response }),
        });
      }
      if (response.body && response.headers.get('content-type')?.startsWith(ndjson)) {
        const reader = response.body
          .pipeThrough(new Lines.DecoderStream({ skipEmpty: true }))
          .getReader();
        for (let r = await reader.read(); !r.done; r = await reader.read()) {
          receive(batch, codec.decode(r.value));
        }
      } else if (response.status !== 204) {
        const decoded = codec.decode(new Uint8Array(await response.arrayBuffer()));
        for (const message of Array.isArray(decoded) ? decoded : [decoded]) {
          receive(batch, message);
        }
      }
      for (const id of pending) {
        client.fail(id, new TransportError('The response has no result for this call.'));
      }
    } catch (e) {
      const reason = signal.aborted ? signal.reason : e;
      for (const id of pending) {
        client.fail(id, reason);
      }
      if (!controller.signal.aborted || signal.aborted) {
        throw reason;
      }
    } finally {
      posting.delete(controller);
      for (const id of pending) {
        batches.delete(id);
      }
    }
  }

  if (signal.aborted) {
    client.close(signal.reason);
  } else {
    signal.addEventListener(
      'abort',
      () => {
        for (const controller of posting) {
          controller.abort(signal.reason);
        }
        client.close(signal.reason);
      },
      { once: true },
    );
  }
  return remote(client, '', async () => {
    disposer.abort(new DOMException('The connection was disposed.', 'AbortError'));
  });
}

function isStreamStart(
  message: Message,
): message is { jsonrpc: '2.0'; method: '$/stream'; params: { id: Id } } {
  return !Array.isArray(message) && 'method' in message && message.method === '$/stream';
}
