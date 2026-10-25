# @portable/websockets

A WebSocket that reconnects when the connection drops, read and written as a `ReadableStream` and a `WritableStream` that stay the same across reconnects. Runs in browsers, Cloudflare Workers, Deno, Bun and Node 24+.

Replaces [reconnecting-websocket](https://www.npmjs.com/package/reconnecting-websocket), [partysocket](https://www.npmjs.com/package/partysocket) and [websocket-ts](https://www.npmjs.com/package/websocket-ts).

```sh
npm install @portable/websockets
```

```ts
import * as Streams from '@portable/streams';
import * as WebSockets from '@portable/websockets';

const { readable, writable } = WebSockets.connect('wss://example.com/feed', {
  async open({ send, messages }) {
    send(JSON.stringify({ token }));
    const reader = messages.getReader();
    const { value } = await reader.read();
    if (value !== 'ok') {
      throw new Error('Not authorized');
    }
  },
});

const writer = writable.getWriter();
await writer.write(JSON.stringify({ subscribe: 'prices' }));

for await (const message of Streams.toAsyncIterable(readable)) {
  console.log(message);
}
```

`Streams.toAsyncIterable` from `@portable/streams` iterates a stream in every runtime. Where the runtime iterates streams itself, `for await (const message of readable)` also works.

The namespace is `WebSockets`, so it doesn't shadow the global `WebSocket`.

A server can wrap the socket it accepted in the same two streams:

```ts
// Cloudflare Workers
const [client, server] = Object.values(new WebSocketPair());
server.accept();
const { readable, writable } = WebSockets.fromSocket(server);
readable.pipeTo(writable); // echo
return new Response(null, { status: 101, webSocket: client });
```

Deno's `Deno.upgradeWebSocket(request).socket` works the same way. Bun's `ServerWebSocket` has handler callbacks instead of `addEventListener`, so `fromSocket` can't wrap it.

## `connect(url, options)`

Returns `{ readable, writable }`. `readable` is a `ReadableStream<string | Uint8Array>`: text messages are strings and binary messages are `Uint8Array`. `writable` takes the same types. `url` is a string, a `URL`, or a function that returns one (or a promise of one). `connect` calls the function before every attempt, so it can fetch a fresh token.

The first attempt starts at once. When a connection drops or an attempt fails, `connect` waits `delay` and tries again.

1. The socket opens.
2. `open` runs, if you passed it. Messages that arrive meanwhile go to its `messages` stream, and the ones it doesn't read go to `readable` afterwards.
3. Writes queued while disconnected are sent in order.
4. Writes go straight to the socket until the connection drops.

| Option | Default | Description |
| --- | --- | --- |
| `protocols` | | Subprotocols, as for `new WebSocket(url, protocols)`. |
| `signal` | | Closes the socket with code 1000 and fails both streams with `signal.reason`. |
| `open` | | `({ send, messages, signal }) => void \| Promise<void>`. Runs on every connection before queued writes are sent. `send` writes ahead of the queue, and `signal` aborts when this connection closes. If `open` throws, the socket closes and `connect` tries again after `delay`. |
| `delay` | `{ initial: 1000, max: 30000 }` | Wait before each retry: milliseconds, `{ initial, max, factor = 2, jitter = true }` for exponential backoff, or `({ attempt, error }) => ms`. `attempt` counts failures in a row from 1. It is `Timers.Delay` from `@portable/timers`. |
| `attempts` | `Infinity` | How many attempts in a row, counting the first, may fail before `connect` gives up. The streams then fail with the last error, such as a `CloseError` or a `TimeoutError`. A connection that finishes `open` resets the count. |
| `timeout` | `10000` | Milliseconds for one attempt to open and finish `open`. |
| `reconnectIf` | see below | `({ code, reason }, { attempt }) => boolean \| Promise<boolean>`. Called when the server closes the connection or the connection drops. `attempt` is the number of failures in a row, including this one. `false` makes the close final, and a rejection fails both streams with its error. |
| `maxQueued` | `1000` | Writes to hold while disconnected. Further writes wait, so `writer.ready` and `writer.write()` stay pending. |
| `highWaterMark` | `1048576` | Writes wait while the socket's `bufferedAmount` is above this many bytes. |
| `maxBuffered` | `Infinity` | Bytes of received messages (characters for text) to hold while the reader is behind. Past it, both streams fail with `MaxBufferedError` and the socket closes. |
| `heartbeat` | | `{ ping, pong, interval, timeout = interval }`. Sends `ping` every `interval` ms. When no message for which `pong(message)` returns `true` arrives within `timeout` ms, the connection counts as dead and `connect` reconnects. Pongs don't reach `readable`. |
| `WebSocket` | `globalThis.WebSocket` | The class to construct, such as the `ws` package's in older Node or a fake in tests. |

By default, close codes 1000 (normal), 1002 (protocol error), 1003 (unsupported data), 1007 (invalid data), 1008 (policy violation), 1009 (message too big) and 1010 (missing extension) are final, because reconnecting won't change the server's answer. Every other code reconnects, including 1001 (going away), 1005 (no code), 1006 (dropped), 1011 to 1014 (server errors and restarts) and the 4000 to 4999 range.

How the streams end:

- `writable.close()` waits for queued writes, closes the socket with 1000, and ends `readable` once the close completes.
- `readable.cancel()`, `writable.abort()` and `signal` close the socket with 1000 and fail the other stream.
- `[Symbol.asyncDispose]()` closes the socket with 1000, stops reconnecting and fails both streams with an `AbortError`, as `signal` does, so `await using socket = WebSockets.connect(url)` closes the connection when the scope ends, even while a reader or writer holds a stream's lock. It exists only where the runtime has `Symbol.asyncDispose`, and TypeScript sees it only when your `lib` includes `esnext.disposable`. `fromSocket`'s result has it too.
- In a runtime without `Symbol.asyncDispose`, such as Safari 26, pass a `signal` and abort it to tear the connection down. It does what `[Symbol.asyncDispose]()` does and also works while a reader or writer holds a lock, which `writable.close()` doesn't.
- A final close with 1000, 1001 or 1005 ends `readable`. Any other final close fails it with a `CloseError` that stores `code` and `reason`. `writable` fails with the `CloseError` in both cases.

### Messages can be lost during a drop

A WebSocket has no acknowledgements. When a connection drops, messages the server sent after the last one you received are gone, and so are writes the old socket accepted (`send()` returned) but never delivered. A write made while the socket is closing or closed is queued for the next connection, but the browser can take seconds to notice a dead connection. If your app can't lose messages, number them and resend or replay after `open`, which is where a resubscribe or a "since sequence N" request goes.

### Backpressure

Writes wait while `bufferedAmount` is above `highWaterMark`. `connect` checks it again after 1 ms, then backs off to every 32 ms.

A browser can't pause reading from a WebSocket: messages arrive whether or not anyone reads them, and `readable` queues them. `maxBuffered` sets a limit, so a reader that falls behind gets a `MaxBufferedError` instead of the tab running out of memory.

## `fromSocket(socket, options)`

Returns `{ readable, writable }` for a socket you already have. It never reconnects. It sets `binaryType` to `'arraybuffer'`, and writes wait until a connecting socket opens. Options: `signal`, `highWaterMark` and `maxBuffered`, as above. `readable` ends when the socket closes with 1000, 1001 or 1005 and fails with a `CloseError` for other codes.

## Errors

| Error | When |
| --- | --- |
| `WebSockets.CloseError` | The connection closed permanently. `code` and `reason` store the close event's values. |
| `WebSockets.MaxBufferedError` | Received messages exceeded `maxBuffered`, stored in `maxBuffered`. |
| `TimeoutError` (`DOMException`) | `attempts` is used up, and the last attempt timed out while opening or while waiting for a heartbeat reply. |
| `TypeError` | No `WebSocket` class was found. |
| `RangeError` | An option is out of range. |

## Types

| Type | Description |
| --- | --- |
| `WebSockets.Duplex` | `{ readable, writable }`, what `connect` and `fromSocket` return, with `[Symbol.asyncDispose]` where the runtime has it. |
| `WebSockets.Message` | A received message: text as a `string`, binary data as a `Uint8Array`. |
| `WebSockets.Socket` | The part of the platform `WebSocket` this package uses. Any object with this shape works. |
| `WebSockets.Delay` | The `delay` option, `Timers.Delay` from `@portable/timers`. |
| `WebSockets.Backoff` | `{ initial, max, factor?, jitter? }`, exponential backoff for `delay`. |

## Why use this over reconnecting-websocket, partysocket and websocket-ts

All three wrap a WebSocket in an `EventTarget` with `send()`. `connect` returns web streams, so a connection can be piped through a `TransformStream`, such as `@portable/jsonl`'s `DecoderStream`, and writes wait instead of queuing without a limit.

- Writes made while disconnected wait for `open`, so authentication or a resubscribe always comes first. reconnecting-websocket and partysocket send their queue in the `open` event, before your handler runs.
- The queue is bounded and applies backpressure. reconnecting-websocket and partysocket queue without a limit by default and drop messages past `maxEnqueuedMessages`. websocket-ts drops them without a buffer.
- Writes wait while `bufferedAmount` is high. None of the three look at it.
- `heartbeat` replaces a connection that stopped answering. reconnecting-websocket has no heartbeat ([#98](https://github.com/pladaria/reconnecting-websocket/issues/98)), so a silently dropped connection stays open until the operating system notices.
- Close codes such as 1008 are final by default, so a client the server rejected doesn't reconnect in a loop.
- A URL function that throws counts as a failed attempt. websocket-ts stopped reconnecting permanently.
- Closing a `ws` client that is still connecting doesn't crash Node ([#197](https://github.com/pladaria/reconnecting-websocket/issues/197)).
- On Node 24, echoing 1,000 messages of 100 bytes through a local server with `connect` runs within 5% of a bare `WebSocket`, and about 10% faster than with reconnecting-websocket. A server echoing through `fromSocket` runs within 5% of one using `ws` listeners. The benchmark table below has the numbers.

<!-- bench:start -->
| Benchmark | Library | Ops/s | Relative | |
| --- | --- | ---: | --- | --- |
| Echo 1,000 messages through a local server | `WebSocket` | 109 | same | ████████████ |
|  | **@portable/websockets** | 105 |  | ███████████▌ |
|  | websocket-ts | 104 | same | ███████████▌ |
|  | reconnecting-websocket | 93.5 | 1.1× slower | ██████████▎ |
|  | partysocket | 83.1 | 1.3× slower | █████████▏ |
| Echo 1,000 messages on the server | ws | 97.7 | same | ████████████ |
|  | **@portable/websockets** | 94.0 |  | ███████████▌ |

Operations per second from `pnpm bench`, higher is better, in Node 24.22.0, on Intel(R) Xeon(R) Processor @ 2.10GHz (4 cores). Each benchmark lists only the libraries that can do the same work, fastest first. The relative speed compares each library with @portable/websockets, and the bars are scaled to the fastest library.

| Library | Version | Minified and gzipped | Runtime dependencies | Node built-ins | TypeScript types |
| --- | --- | ---: | ---: | --- | --- |
| @portable/websockets | – | 3.1 kB | 3 | none | included |
| reconnecting-websocket | 4.4.0 | 2.6 kB | 0 | none | included |
| partysocket | 1.3.0 | 2.8 kB | 1 | none | included |
| websocket-ts | 3.0.0 | 1.8 kB | 0 | none | included |
| ws | 8.22.0 | 0.5 kB | 0 | none | `@types/ws` |
| `WebSocket` | – | built in | – | none | – |

Sizes cover the imports in the usage example, or the equivalent imports of each library, bundled for the browser by `scripts/bundle-size.ts`. Runtime dependencies count every package installed with the published package. A library that uses Node built-ins needs polyfills in a browser and the `nodejs_compat` flag in Cloudflare Workers.
<!-- bench:end -->

- reconnecting-websocket's `maxRetries` counts the retries after the first attempt, and `attempts` counts every attempt, so `maxRetries: n` becomes `attempts: n + 1`.
- reconnecting-websocket's `reconnect()` has no equivalent. Use `heartbeat` to replace a dead connection, or close the connection and call `connect` again.
- Binary messages always arrive as `Uint8Array`, as if `binaryType` were `'arraybuffer'`, and the option can't be changed.
- websocket-ts's `RingQueue` has no equivalent. Writes wait at `maxQueued` instead of dropping the oldest message.
- A close with 1000, 1002, 1003, 1007, 1008, 1009 or 1010 from the server is final unless `reconnectIf` returns `true`. reconnecting-websocket and partysocket reconnect after any close they didn't start.
- The first connection opens at once. reconnecting-websocket waited for the reconnect delay before it ([#91](https://github.com/pladaria/reconnecting-websocket/issues/91)).
- The attempt count resets when `open` finishes. reconnecting-websocket resets it only after the connection has stayed open for `minUptime`.
