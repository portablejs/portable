# @portable/rpc

Typed remote calls between workers, windows, servers, and browsers over JSON-RPC 2.0. Runs in browsers, Cloudflare Workers, Node 24+, Bun, and Deno.

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

The remote's type comes from the server's code, so there's no schema or code generation. Every method returns a promise.

## Calls

`Rpc.connect<Api>(transport, options)` returns a proxy. `remote.add(1, 2)` sends `{"jsonrpc":"2.0","id":1,"method":"add","params":[1,2]}` and resolves with the result. `remote.math.add()` calls `'math.add'`.

`Rpc.provide(transport, methods, options)` answers those calls. Methods can be sync or async, and are called with their object as `this`, so class instances work. To stop answering, abort `signal`.

| Option | Default | Description |
| --- | --- | --- |
| `codec` | `Rpc.json` | Encodes messages for the transport. Any `{ encode, decode }`. |
| `methods` | | `connect` only: methods the other side can call over the same transport. |
| `signal` | | Closes the connection. Waiting calls reject with `signal.reason`, running methods are aborted, and the transport is cancelled. |

Where the runtime has `Symbol.asyncDispose`, you can also close the remote from `connect` or `http` with `await using`. It's the same as aborting `signal` with an `AbortError` `DOMException`:

```ts
await using worker = Rpc.connect<Api>(Rpc.port(new Worker('./worker.ts', { type: 'module' })));
await worker.add(1, 2);
```

Closing cancels the transport's streams, which closes a WebSocket wrapped in streams. A `Worker` or `MessagePort` stays open, so call `terminate()` or `close()` yourself.

TypeScript sees `[Symbol.asyncDispose]` only when your `lib` includes `esnext.disposable`. In runtimes without it (e.g. Safari 26), abort `signal` instead.

### Options per call

`Rpc.call` takes the method, its params, and options, so a method's last argument is never mistaken for options:

```ts
await Rpc.call(remote.search, ['shoes'], { signal: AbortSignal.timeout(5000) });
```

Aborting rejects the call with `signal.reason` and sends `$/cancel` to the server.

Params can also be an object (by-name params in JSON-RPC). The server method receives it as its only argument.

`Rpc.notify(remote.log, ['loaded'])` sends a call without expecting a response.

### Cancellation on the server

`Rpc.withContext` passes a method `{ signal }` as its first argument. The signal aborts when the caller cancels or the connection closes. The client's type doesn't include this argument.

```ts
const api = {
  search: Rpc.withContext(async ({ signal }, query: string) => {
    const response = await fetch(`https://example.com/search?q=${query}`, { signal });
    return response.json();
  }),
};
```

### Errors

Remote calls reject with `Rpc.RemoteError`. Throw one from a method to send a `code`, `message`, and `data`. Any other error is sent with code `-32603` and its `message`.

```ts
throw new Rpc.RemoteError({ code: 404, message: 'No such user', data: { id } });
```

If the transport closes or fails, or an HTTP request fails, waiting calls reject with `Rpc.TransportError`. Its `cause` is the underlying error, or an `Errors.ResponseError` holding the failed `Response`.

An unknown method rejects with code `-32601`. Names starting with `rpc.` and `Object.prototype` names such as `constructor` are never called.

### Streams

A method that returns an async iterable or a `ReadableStream` streams its values back:

```ts
for await (const event of remote.watch('x')) {
  console.log(event);
}

const stream = await remote.watch('x'); // a ReadableStream
stream.pipeThrough(new TransformStream());
```

Breaking out of the loop or cancelling the stream stops the server's generator and runs its `finally` block. The server sends at most 256 values ahead of what the client has read, except over HTTP, where it writes as fast as the response body accepts.

### Both directions

Pass `methods` to `connect` to also answer calls from the other side. For example, a worker can report progress to the page:

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

`Rpc.connect<any>` allows any method name, and `Rpc.call` can send params by name, so you can talk to LSP and MCP servers:

```ts
const mcp = Rpc.connect<any>(transport);
await Rpc.call(mcp.initialize, { protocolVersion: '2025-06-18', capabilities: {}, clientInfo });
await Rpc.notify(mcp['notifications/initialized'], {});
const { tools } = await Rpc.call(mcp['tools/list'], {});
```

## Transports

A transport is any `{ readable, writable }` pair of streams that carries encoded messages. Use each transport with only one `connect` or `provide`. Reusing one from `Rpc.port` or `Rpc.window` throws a `TypeError`.

### `Rpc.port(target, { signal })`

A `MessagePort`, `Worker`, `BroadcastChannel`, or `self` inside a worker. Messages are structured-cloned, so you can use an identity codec to keep `Date`, `Map`, and `Uint8Array` values intact:

```ts
Rpc.connect<Api>(Rpc.port(worker), { codec: { encode: (m) => m, decode: (m) => m } });
```

A `BroadcastChannel` works for only two peers. It doesn't buffer, so a call sent before the other side opens its channel is lost. Pass a `signal` to such calls.

### `Rpc.window(target, { origin, channel, signal })`

Another window: an iframe's `contentWindow`, `window.parent`, `window.opener`, or a popup.

```ts
// parent
const child = Rpc.connect<ChildApi>(
  Rpc.window(iframe.contentWindow!, { origin: 'https://child.example.com' }),
);

// iframe
Rpc.provide(Rpc.window(window.parent, { origin: 'https://parent.example.com' }), api);
```

Either side can load first: both send a hello every 100 ms until the other answers, and writes wait for the handshake. If their protocol versions differ, the connection fails with `TransportError`.

`origin` is required. `Rpc.window` posts only to `origin` and ignores messages from other origins or from windows other than `target`. If you pass `'*'`, any page that can post to this window can call your methods. `channel` lets several connections share one window.

The handshake has no timeout, so pass a signal to each call to stop waiting for a window that never answers: `Rpc.call(..., { signal: AbortSignal.timeout(10_000) })`.

If the other window reloads, the connection keeps working, but unanswered calls stay pending until their signal aborts.

### `Rpc.handler(api)` and `Rpc.http(url, { fetch, signal })`

`Rpc.handler` returns a `(request: Request) => Promise<Response>` that answers JSON-RPC over HTTP POST:

```ts
const rpc = Rpc.handler(api);
export default { fetch: (request: Request) => rpc(request) };
```

`Rpc.http` is the client. It sends calls made in the same tick as one batch. In tests, you can pass the function from `Rpc.handler` as `fetch`.

```ts
const api = Rpc.http<Api>('https://example.com/rpc', {
  fetch: (request) => {
    request.headers.set('authorization', authorization);
    return fetch(request);
  },
});
```

`handler` has no body size limit, so limit the body size in front of it.

Responses are JSON, or `application/x-ndjson` when a method returns a stream. `handler` answers a POST of only notifications with `204`, other HTTP methods with `405`, and malformed JSON with a 200 and a `-32700` error. `Rpc.http` and `handler` always use JSON.

Methods wrapped with `withContext` receive the `Request`, and their `signal` aborts when the client disconnects. Cancelling a call aborts the request only once every call in its batch is cancelled.

### WebSocket and server-sent events

A WebSocket wrapped as streams of strings, such as the one from [@portable/websockets](https://portablejs.com/packages/websockets), works as a transport. You can also wrap a socket yourself:

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

Server-sent events are one-way, so pair the event stream from [@portable/sse](https://portablejs.com/packages/sse) with POST requests:

```ts
const transport = {
  readable: events.pipeThrough(new TransformStream({ transform: (e, c) => c.enqueue(e.data) })),
  writable: new WritableStream({ write: (message) => void fetch(postUrl, { method: 'POST', body: message as string }) }),
};
```

## Protocol

Messages are plain JSON-RPC 2.0, so they work with any JSON-RPC client or server. Streams and cancellation use notifications with reserved names (as in LSP):

| Message | Sent by | Params |
| --- | --- | --- |
| `$/stream` | server | `{ id }`: the result of request `id` is a stream. |
| `$/stream/next` | server | `{ id, value }`: the next value. The stream ends with the normal response to `id`, or errors with an error response. |
| `$/stream/credit` | client | `{ id, credit }`: the server may send `credit` more values. |
| `$/cancel` | client | `{ id }`: stop request `id`. The server aborts the method's signal and answers `-32800`. |

A codec turns messages into what the transport carries. `Rpc.json` writes JSON text and reads text or UTF-8 bytes. You can pass a binary codec instead:

```ts
import * as cbor from 'cborg';

Rpc.connect<Api>(transport, { codec: { encode: cbor.encode, decode: cbor.decode } });
```

Arguments aren't validated, so parse them with your schema library at the start of each method.

## Types

| Type | Description |
| --- | --- |
| `Rpc.Remote` | The client type `connect` and `http` return for an API type. |
| `Rpc.Result` | What a remote method returns for a result of a given type. |
| `Rpc.Transport` | A pair of streams that carry encoded messages. |
| `Rpc.Codec` | Turns messages into what a transport carries, and back. |
| `Rpc.Context` | What a method wrapped with `withContext` receives as its first argument. |
| `Rpc.Message` | A JSON-RPC 2.0 request, notification, or response. |

## Why use this over comlink, penpal, birpc, and json-rpc-2.0

The benchmarks run over a `MessageChannel` with the default JSON codec.

<!-- bench:start -->
<table>
<thead><tr><th align="left">Library</th><th align="right">Ops/s</th><th align="left">Relative</th><th></th></tr></thead>
<tbody>
<tr><th colspan="4" align="left">Make one call at a time over a <code>MessageChannel</code></th></tr>
<tr><td>@portable/rpc</td><td align="right">114,000</td><td></td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="160" height="12" alt="" /></td></tr>
<tr><td>penpal</td><td align="right">89,700</td><td>1.3× slower</td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="126" height="12" alt="" /></td></tr>
<tr><td>birpc</td><td align="right">86,900</td><td>1.3× slower</td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="122" height="12" alt="" /></td></tr>
<tr><td>comlink</td><td align="right">64,500</td><td>1.8× slower</td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="91" height="12" alt="" /></td></tr>
<tr><th colspan="4" align="left">Make 100 concurrent calls</th></tr>
<tr><td>@portable/rpc</td><td align="right">1,720</td><td></td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="160" height="12" alt="" /></td></tr>
<tr><td>birpc</td><td align="right">1,290</td><td>1.3× slower</td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="120" height="12" alt="" /></td></tr>
<tr><td>penpal</td><td align="right">1,150</td><td>1.5× slower</td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="107" height="12" alt="" /></td></tr>
<tr><td>comlink</td><td align="right">834</td><td>2.1× slower</td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="78" height="12" alt="" /></td></tr>
<tr><th colspan="4" align="left">Send 100 notifications and a call</th></tr>
<tr><td>@portable/rpc</td><td align="right">3,250</td><td></td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="160" height="12" alt="" /></td></tr>
<tr><td>birpc</td><td align="right">3,020</td><td>1.1× slower</td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="149" height="12" alt="" /></td></tr>
<tr><th colspan="4" align="left">Stream 1,000 items</th></tr>
<tr><td>birpc</td><td align="right">212</td><td>1.1× faster</td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="160" height="12" alt="" /></td></tr>
<tr><td>@portable/rpc</td><td align="right">193</td><td></td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="146" height="12" alt="" /></td></tr>
<tr><td>comlink</td><td align="right">76.9</td><td>2.5× slower</td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="58" height="12" alt="" /></td></tr>
<tr><th colspan="4" align="left">Send a 2 KB record</th></tr>
<tr><td>@portable/rpc</td><td align="right">23,400</td><td></td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="160" height="12" alt="" /></td></tr>
<tr><td>birpc</td><td align="right">14,100</td><td>1.7× slower</td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="96" height="12" alt="" /></td></tr>
<tr><td>comlink</td><td align="right">13,700</td><td>1.7× slower</td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="94" height="12" alt="" /></td></tr>
<tr><td>penpal</td><td align="right">12,300</td><td>1.9× slower</td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="84" height="12" alt="" /></td></tr>
<tr><th colspan="4" align="left">Make one call over HTTP</th></tr>
<tr><td>json-rpc-2.0</td><td align="right">17,200</td><td>same</td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="160" height="12" alt="" /></td></tr>
<tr><td>@portable/rpc</td><td align="right">17,100</td><td></td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="159" height="12" alt="" /></td></tr>
<tr><th colspan="4" align="left">Send a batch of 10 calls over HTTP</th></tr>
<tr><td>json-rpc-2.0</td><td align="right">23,000</td><td>1.1× faster</td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="160" height="12" alt="" /></td></tr>
<tr><td>@portable/rpc</td><td align="right">20,800</td><td></td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="145" height="12" alt="" /></td></tr>
</tbody>
</table>

Operations per second from `pnpm bench`, higher is better, in Node 24.22.0, on Intel(R) Xeon(R) Processor @ 2.10GHz (4 cores). Each benchmark lists only the libraries that can do the same work, fastest first. The relative speed compares each library with @portable/rpc, and the bars are scaled to the fastest library.

| Library | Version | Minified and gzipped | Runtime dependencies | Node built-ins | TypeScript types |
| --- | --- | ---: | ---: | --- | --- |
| @portable/rpc | – | 3.5 kB | 4 | none | included |
| birpc | 4.2.0 | 1.3 kB | 0 | none | included |
| comlink | 4.4.2 | 1.7 kB | 0 | none | included |
| penpal | 8.0.1 | 2.3 kB | 0 | none | included |
| json-rpc-2.0 | 1.8.1 | 4.0 kB | 0 | none | included |

Sizes cover the imports in the usage example, or the equivalent imports of each library, bundled for the browser by `scripts/bundle-size.ts`. Runtime dependencies count every package installed with the published package. A library that uses Node built-ins needs polyfills in a browser and the `nodejs_compat` flag in Cloudflare Workers.
<!-- bench:end -->

In Node, the JSON codec is faster than the identity codec (14,400/s for the 2 KB record) and than libraries that structured-clone. birpc and comlink have no streamed results, so their stream row pushes each value without backpressure.

- One API for workers, iframes, popups, WebSockets, and HTTP. comlink and post-me cover `postMessage`; penpal covers windows and workers; birpc takes callbacks; and json-rpc-2.0 has no transport.
- JSON-RPC 2.0 on the wire, so it works with clients in other languages and with LSP and MCP servers.
- Streamed results have backpressure and cancellation. comlink needs a proxied callback per value, and birpc and penpal have no streams.
- Cancelling a call aborts the method's `AbortSignal` on the server. birpc and json-rpc-2.0 have timeouts but can't stop the remote work.
- json-rpc-2.0 answers a batch of one request with a bare object and an all-notification batch with `null`, and treats a non-string method as unknown. `Rpc.provide` follows the spec in each case.
- Thrown errors are sent with code `-32603`. json-rpc-2.0 sends code `0`, and birpc and penpal also send the error's name and stack.
- With `Rpc.json`, a `Date` arrives as a string and `undefined` as `null`. comlink, penpal, post-me, and birpc structured-clone by default, so use the identity codec over a port for the same behavior.
- There's no equivalent of `Comlink.transfer`. The identity codec clones values without transferring them.
- There are no middleware hooks like json-rpc-2.0's `applyMiddleware` or birpc's `onRequest` and `resolver`. Wrap the methods, the `fetch` passed to `Rpc.http`, or the transport instead.
- `Rpc.window` takes one origin string. penpal's `allowedOrigins` also accepts a list and regular expressions.
