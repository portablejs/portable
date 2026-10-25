# @portable/rpc

Typed remote calls between workers, windows, servers and browsers, as JSON-RPC 2.0. Runs in browsers, Cloudflare Workers, Deno, Bun and Node 24+.

Replaces [comlink](https://www.npmjs.com/package/comlink), [penpal](https://www.npmjs.com/package/penpal), [post-me](https://www.npmjs.com/package/post-me), [birpc](https://www.npmjs.com/package/birpc), [json-rpc-2.0](https://www.npmjs.com/package/json-rpc-2.0), and [tRPC](https://trpc.io) for simple cases.

```sh
npm install @portable/rpc
```

```ts
// worker.ts
import * as Rpc from '@portable/rpc';

const api = {
  add: (a: number, b: number) => a + b,
  async *watch(id: string) {
    for (let i = 0; ; i++) {
      yield { id, i };
    }
  },
};
export type Api = typeof api;

Rpc.provide(Rpc.port(self), api);
```

```ts
// main.ts
import * as Rpc from '@portable/rpc';
import type { Api } from './worker.ts';

const worker = Rpc.connect<Api>(Rpc.port(new Worker('./worker.ts', { type: 'module' })));

await worker.add(1, 2); // 3
for await (const event of worker.watch('x')) {
  console.log(event);
}
```

The type of the remote comes from the server's code, so there is no schema or code generation. Every method returns a promise.

## Calls

`Rpc.connect<Api>(transport, options)` returns a proxy. Calling `remote.add(1, 2)` sends `{"jsonrpc":"2.0","id":1,"method":"add","params":[1,2]}` and resolves with the result. Methods of nested objects are called by dotted name, so `remote.math.add()` calls `'math.add'`.

`Rpc.provide(transport, methods, options)` answers those calls. A method can be sync or async, and is called with the object that holds it as `this`, so class instances work.

| Option | Default | Description |
| --- | --- | --- |
| `codec` | `Rpc.json` | Encodes messages for the transport. Any `{ encode, decode }`. |
| `methods` | | `connect` only: methods the other side can call over the same transport. |
| `signal` | | Closes the connection. Waiting calls reject with `signal.reason`, running methods are aborted, and the transport is cancelled. |

Where the runtime has `Symbol.asyncDispose`, the remote from `connect` or `http` also closes with `await using`, as if `signal` aborted with an `AbortError` `DOMException`:

```ts
await using worker = Rpc.connect<Api>(Rpc.port(new Worker('./worker.ts', { type: 'module' })));
await worker.add(1, 2);
```

Disposing closes the connection but not what carries it, so the worker keeps running until you call `terminate()`. TypeScript sees `[Symbol.asyncDispose]` only when your `lib` includes `esnext.disposable`. A method named by a symbol can't be called remotely, so the key never hides one of your methods. In a runtime without `Symbol.asyncDispose`, such as Safari 26, pass a `signal` and abort it to close the remote, which does the same teardown.

### Options per call

Arguments and options don't share a list, so a method's last argument is never mistaken for options. `Rpc.call` takes the method, its params and the options:

```ts
await Rpc.call(remote.search, ['shoes'], { signal: AbortSignal.timeout(5000) });
```

Aborting rejects the call with `signal.reason` and sends `$/cancel` to the server.

Params can also be an object. JSON-RPC calls that "by name", and the server method receives the object as its one argument.

`Rpc.notify(remote.log, ['loaded'])` sends a notification: a call without an id, which the server doesn't answer.

### Cancellation on the server

Wrap a method with `Rpc.withContext` to receive a `{ signal }` first. The signal aborts when the caller cancels or the connection closes. Callers see the method without the extra argument.

```ts
const api = {
  search: Rpc.withContext(async ({ signal }, query: string) => {
    const response = await fetch(`https://example.com/search?q=${query}`, { signal });
    return response.json();
  }),
};
```

### Errors

A method that throws `Rpc.RemoteError` sends its `code`, `message` and `data`. Any other error is sent with code `-32603` and its `message`. The caller rejects with an `Rpc.RemoteError` either way.

```ts
throw new Rpc.RemoteError({ code: 404, message: 'No such user', data: { id } });
```

When the transport closes or fails, or an HTTP request fails, waiting calls reject with `Rpc.TransportError`, whose `cause` holds the underlying error. For a failed HTTP response, `cause` is an `Errors.ResponseError` whose `response` is the whole `Response`. An unknown method rejects with code `-32601`. Names that start with `rpc.` and names inherited from `Object.prototype`, such as `constructor`, are never called.

### Streams

A method that returns an async iterable (such as an async generator) or a `ReadableStream` streams its values back:

```ts
for await (const event of remote.watch('x')) {
  console.log(event);
}

const stream = await remote.watch('x'); // a ReadableStream
stream.pipeThrough(new TransformStream());
```

Breaking out of the loop or cancelling the stream stops the generator on the server, so its `finally` block runs. The server sends at most 256 values ahead of what the caller has read.

### Both directions

Pass `methods` to `connect` to answer calls from the other side over the same transport. A worker can report progress to the page that called it:

```ts
// main.ts
const worker = Rpc.connect<WorkerApi>(Rpc.port(new Worker('./worker.ts', { type: 'module' })), {
  methods: { progress: (percent: number) => (bar.value = percent) },
});
await worker.convert(file);

// worker.ts
const main = Rpc.connect<MainApi>(Rpc.port(self), {
  methods: {
    async convert(file: File) {
      await main.progress(50);
      // ...
    },
  },
});
```

### Untyped servers

`Rpc.connect<any>` gives a remote with every method, and `Rpc.call` sends params by name. That is enough to talk to an LSP or MCP server:

```ts
const mcp = Rpc.connect<any>(transport);
await Rpc.call(mcp.initialize, { protocolVersion: '2025-06-18', capabilities: {}, clientInfo });
await Rpc.notify(mcp['notifications/initialized'], {});
const { tools } = await Rpc.call(mcp['tools/list'], {});
```

## Transports

A transport is any `{ readable, writable }` pair of streams that carries encoded messages.

### `Rpc.port(target, { signal })`

A `MessagePort`, `Worker`, `BroadcastChannel`, or `self` inside a worker. Messages are structured-cloned, so the identity codec also works and keeps `Date`, `Map` and `Uint8Array` values intact:

```ts
Rpc.connect<Api>(Rpc.port(worker), { codec: { encode: (m) => m, decode: (m) => m } });
```

A `BroadcastChannel` connects only two peers. With more, every peer would receive every answer. It also doesn't buffer, so a call posted before the other side has opened its channel is lost. Pass a `signal` to such calls.

### `Rpc.window(target, { origin, channel, signal })`

Another window: an iframe's `contentWindow`, `window.parent`, `window.opener` or a popup.

```ts
// parent
const child = Rpc.connect<ChildApi>(
  Rpc.window(iframe.contentWindow!, { origin: 'https://child.example.com' }),
);

// iframe
Rpc.provide(Rpc.window(window.parent, { origin: 'https://parent.example.com' }), api);
```

Both sides post a hello every 100 ms until the other answers, so either can load first, and writes wait until the handshake is done. The hello carries a protocol version. Messages whose `event.origin` differs from `origin`, or that come from a window other than `target`, are ignored, and messages are posted only to `origin`. `origin` is required: pass `'*'` to accept any origin. `channel` lets several connections share one window.

The handshake has no timeout of its own, and `signal` closes the connection whenever it aborts, so pass a signal to each call (`Rpc.call(..., { signal: AbortSignal.timeout(10_000) })`) to give up on a window that never answers. When the other window reloads, its new page says hello again and the same remote keeps working. A call the old page didn't answer stays pending until its signal aborts.

### `Rpc.handler(api)` and `Rpc.http(url, { fetch, signal })`

`Rpc.handler` returns a `(request: Request) => Promise<Response>` for JSON-RPC over HTTP POST, which fits Workers, Deno, Bun and any framework that takes a fetch handler:

```ts
const rpc = Rpc.handler(api);
export default { fetch: (request: Request) => rpc(request) };
```

`Rpc.http` is the client. Calls made in the same tick are sent as one batch request. Its `fetch` option is called with a `Request`, so a test can pass the function returned by `Rpc.handler` as `fetch`.

```ts
const api = Rpc.http<Api>('https://example.com/rpc', {
  fetch: (request) => {
    request.headers.set('authorization', authorization);
    return fetch(request);
  },
});
```

A response is JSON, or, when a method returns a stream, `application/x-ndjson` with one message per line as the values are produced. Breaking out of a streamed result aborts the request. A request that holds only notifications gets `204 No Content`, and other HTTP methods get `405`. Methods wrapped with `withContext` receive the `Request`, and their `signal` aborts when the client disconnects. HTTP always uses JSON.

### WebSocket and server-sent events

A WebSocket wrapped as `readable` and `writable` streams of strings, such as the one `@portable/websockets` returns, can be passed as a transport unchanged. Without that package, you can wrap a socket in a few lines:

```ts
const socket = new WebSocket('wss://example.com/rpc');
const transport = {
  readable: new ReadableStream({
    start(controller) {
      socket.onmessage = (event) => controller.enqueue(event.data);
      socket.onclose = () => controller.close();
    },
  }),
  writable: new WritableStream({
    async start() {
      if (socket.readyState === WebSocket.CONNECTING) {
        await new Promise((r) => (socket.onopen = r));
      }
    },
    write: (message) => socket.send(message as string),
  }),
};
const remote = Rpc.connect<Api>(transport);
```

Server-sent events carry messages one way only. Pair the event stream from `@portable/sse` with POST requests for the other way:

```ts
const transport = {
  readable: events.pipeThrough(new TransformStream({ transform: (e, c) => c.enqueue(e.data) })),
  writable: new WritableStream({ write: (message) => void fetch(postUrl, { method: 'POST', body: message as string }) }),
};
```

## Protocol

Every message is a JSON-RPC 2.0 request, notification or response, or a batch of them, so `Rpc.provide` answers any JSON-RPC client and `Rpc.connect` calls any JSON-RPC server. Streams and cancellation are notifications with reserved names, as in LSP:

| Message | Sent by | Params |
| --- | --- | --- |
| `$/stream` | server | `{ id }`: the result of request `id` is a stream. |
| `$/stream/next` | server | `{ id, value }`: the next value. The stream ends with the normal response to `id`, or errors with an error response. |
| `$/stream/credit` | client | `{ id, credit }`: the server may send `credit` more values. |
| `$/cancel` | client | `{ id }`: stop request `id`. The server aborts the method's signal and answers `-32800`. |

A codec turns messages into what the transport carries. `Rpc.json` writes JSON text and reads text or UTF-8 bytes. Pass a binary codec the same way:

```ts
import * as cbor from 'cborg';

Rpc.connect<Api>(transport, { codec: { encode: cbor.encode, decode: cbor.decode } });
```

Validation is left to the methods. Parse the arguments with your schema library at the start of a method.

## Types

| Type | Description |
| --- | --- |
| `Rpc.Remote` | The client type `connect` and `http` return for an API type. |
| `Rpc.Result` | What a remote method returns for a result of a given type. |
| `Rpc.Transport` | A pair of streams that carry encoded messages. |
| `Rpc.Codec` | Turns messages into what a transport carries, and back. |
| `Rpc.Context` | What a method wrapped with `withContext` receives as its first argument. |
| `Rpc.Message` | A JSON-RPC 2.0 request, notification or response. |

## Why use this over comlink, penpal, birpc and json-rpc-2.0

The benchmarks run over a `MessageChannel` with the default JSON codec.

<!-- bench:start -->
| | @portable/rpc | birpc | comlink | penpal | json-rpc-2.0 |
| --- | ---: | ---: | ---: | ---: | ---: |
| Make one call at a time over a `MessageChannel` | 114,000 | 86,900 | 64,500 | 89,700 | – |
| Make 100 concurrent calls | 1,720 | 1,290 | 834 | 1,150 | – |
| Send 100 notifications and a call | 3,250 | 3,020 | – | – | – |
| Stream 1,000 items | 193 | 212 | 76.9 | – | – |
| Send a 2 KB record | 23,400 | 14,100 | 13,700 | 12,300 | – |
| Make one call over HTTP | 17,100 | – | – | – | 17,200 |
| Send a batch of 10 calls over HTTP | 20,800 | – | – | – | 23,000 |

Operations per second from `pnpm bench`, higher is better, in Node 24.22.0, on Intel(R) Xeon(R) Processor @ 2.10GHz (4 cores). A dash means the library has no equivalent.

| | @portable/rpc | birpc | comlink | penpal | json-rpc-2.0 |
| --- | --- | --- | --- | --- | --- |
| Minified and gzipped | 3.5 kB | 1.3 kB | 1.7 kB | 2.3 kB | 4.0 kB |
| Runtime dependencies | 4 | 0 | 0 | 0 | 0 |
| Node built-ins used | none | none | none | none | none |
| TypeScript types | included | included | included | included | included |
| Version compared | – | 4.2.0 | 4.4.2 | 8.0.1 | 1.8.1 |

Sizes cover the imports in the usage example, or the equivalent imports of each library, bundled for the browser by `scripts/bundle-size.ts`. Runtime dependencies count every package installed with the published package. A library that uses Node built-ins needs polyfills in a browser and the `nodejs_compat` flag in Cloudflare Workers.
<!-- bench:end -->

Structured-cloning a nested object costs more in Node than cloning one JSON string, so the JSON codec is faster than the identity codec (14,400/s for the 2 KB record) and than the libraries that clone. birpc and comlink have no streamed results, so the stream row compares with the server pushing each value without waiting, which has no backpressure.

- One package covers workers, iframes, popups, WebSockets and HTTP, with the same API on each. comlink and post-me cover `postMessage`, penpal covers windows and workers, birpc takes callbacks for any channel, and json-rpc-2.0 has no transport.
- The wire format is JSON-RPC 2.0, so the server also answers clients written in other languages, and the client talks to LSP and MCP servers.
- Async generators and `ReadableStream` results stream back with backpressure and cancellation. comlink needs a proxied callback per value, and birpc and penpal have no streams.
- Cancellation is an `AbortSignal` that reaches the method on the server. birpc and json-rpc-2.0 have timeouts but can't stop the remote work.
- json-rpc-2.0 answers a batch of one request with a bare object and an all-notification batch with `null`, and treats a non-string method as unknown. `Rpc.provide` follows the specification in each case.
- Methods are looked up only as own properties or class methods, never `Object.prototype` names, so `constructor` and `__proto__` can't be called remotely.
- Errors a method throws are sent with code `-32603`. json-rpc-2.0 sends code `0`, and birpc and penpal also send the error's name and stack.
- The codec must be able to encode a method's result. With `Rpc.json`, a `Date` arrives as a string and `undefined` as `null`. comlink, penpal, post-me and birpc structured-clone by default, so pass the identity codec over a port to get the same behavior.
- comlink's `Comlink.transfer` has no equivalent. The identity codec structured-clones values without transferring them.
- There are no middleware hooks like json-rpc-2.0's `applyMiddleware` or birpc's `onRequest` and `resolver`. Wrap the methods, the `fetch` passed to `Rpc.http` or the transport instead.
- `Rpc.window` takes one origin string. penpal's `allowedOrigins` also accepts a list of origins and regular expressions.
