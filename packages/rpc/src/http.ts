import * as Errors from '@portable/errors';
import * as Jsonl from '@portable/jsonl';
import { createClient } from './client.js';
import { RemoteError, TransportError } from './errors.js';
import { remote } from './remote.js';
import { createServer, error, noop } from './server.js';
import type { Id, Message, Remote } from './types.js';

const ndjson = 'application/x-ndjson';

/**
 * Answers calls to `methods` over HTTP. The returned function answers a POST of a JSON-RPC request or batch. The
 * response is JSON, or, when a method returns a stream, newline-delimited messages that carry the
 * stream's values as they are produced. Methods wrapped with `withContext` get the `Request`, and
 * their `signal` aborts when the client disconnects.
 *
 * @example
 * ```ts
 * import * as Rpc from '@portable/rpc';
 *
 * const rpc = Rpc.handler(api);
 * export default { fetch: (request: Request) => rpc(request) };
 * ```
 */
export function handler(methods: object): (request: Request) => Promise<Response> {
  return async (request) => {
    if (request.method !== 'POST') {
      return new Response(null, { status: 405, headers: { allow: 'POST' } });
    }
    let message: unknown;
    try {
      message = JSON.parse(await request.text());
    } catch {
      return Response.json(error(null, -32700, 'Parse error'));
    }

    const buffered: Message[] = [];
    const streams = new Set<Id>();
    let streamed = false;
    let writer: WritableStreamDefaultWriter<unknown> | undefined;
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
      return response ? Response.json(response) : new Response(null, { status: 204 });
    }
    const encoder = new Jsonl.EncoderStream();
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
  };
}

type Batch = {
  messages: string[];
  pending: Set<Id>;
  controller: AbortController;
  sent: Promise<void>;
};

/**
 * Connects to an API served by `handler`, or any JSON-RPC server that accepts POST requests. Calls
 * made in the same tick are sent as one batch request.
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
export function http<api>(url: string | URL, options: http.Options = {}): Remote<api> {
  const { fetch = (request: Request) => globalThis.fetch(request), signal } = options;
  const batches = new Map<Id, Batch>();
  let queued: Batch | undefined;

  const send = (message: Message): Promise<void> | void => {
    if (!Array.isArray(message) && 'method' in message && message.method === '$/cancel') {
      return cancel((message.params as { id: Id }).id);
    }
    const text = JSON.stringify(message);
    if (!queued) {
      const batch: Batch = {
        messages: [],
        pending: new Set(),
        controller: new AbortController(),
        sent: Promise.resolve(),
      };
      batch.sent = batch.sent.then(() => post(batch));
      queued = batch;
    }
    queued.messages.push(text);
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
    const { messages, controller, pending } = batch;
    try {
      const response = await fetch(
        new Request(url, {
          method: 'POST',
          headers: { 'content-type': 'application/json', accept: `application/json, ${ndjson}` },
          body: messages.length === 1 ? messages[0]! : `[${messages.join(',')}]`,
          signal: signal ? AbortSignal.any([signal, controller.signal]) : controller.signal,
        }),
      );
      if (!response.ok) {
        await response.body?.cancel().catch(() => {});
        throw new TransportError(`The server answered ${response.status}.`, {
          cause: new Errors.ResponseError({ response }),
        });
      }
      if (response.body && response.headers.get('content-type')?.startsWith(ndjson)) {
        const reader = response.body.pipeThrough(new Jsonl.DecoderStream()).getReader();
        for (let r = await reader.read(); !r.done; r = await reader.read()) {
          receive(batch, r.value);
        }
      } else if (response.status !== 204) {
        const body: unknown = await response.json();
        for (const message of Array.isArray(body) ? body : [body]) {
          receive(batch, message);
        }
      }
      for (const id of pending) {
        client.fail(id, new TransportError('The response has no result for this call.'));
      }
    } catch (e) {
      const reason = signal?.aborted ? signal.reason : e;
      for (const id of pending) {
        client.fail(id, reason);
      }
      if (!controller.signal.aborted || signal?.aborted) {
        throw reason;
      }
    } finally {
      for (const id of pending) {
        batches.delete(id);
      }
    }
  }

  if (signal?.aborted) {
    client.close(signal.reason);
  } else {
    signal?.addEventListener('abort', () => client.close(signal.reason), { once: true });
  }
  return remote(client);
}

function isStreamStart(
  message: Message,
): message is { jsonrpc: '2.0'; method: '$/stream'; params: { id: Id } } {
  return !Array.isArray(message) && 'method' in message && message.method === '$/stream';
}
