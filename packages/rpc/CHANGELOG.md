# @portable/rpc

## 0.2.0

### Minor Changes

- [#67](https://github.com/portablejs/portable/pull/67) [`0d45854`](https://github.com/portablejs/portable/commit/0d4585448f00cf80b1a849d4cfe3d8e047bce6ac) - `Rpc.handler` and `Rpc.http` take a `codec` option, as `Rpc.connect` does, so HTTP can carry CBOR or another format instead of JSON. Codecs have a new optional `contentType`, which `handler` and `http` send as the `content-type` header. `Rpc.json` sets it to `application/json`. Results still stream with any codec. If the codec's `encode` returns a string, `handler` sends one message per line as `application/x-ndjson`, as before. If it returns bytes, `handler` sends each message after the 5-byte header of the Connect protocol: a flags byte and a 32-bit big-endian length. That stream's `content-type` is `application/vnd.portable.rpc-stream` with a `codec` parameter, such as `codec="application/cbor"`, taken from the codec's `contentType`. `http` reads either framing, chosen by the response's `content-type`.
  
  Code that uses JSON needs no change. To switch HTTP to CBOR, pass the same codec to both sides:
  
  ```ts
  // Before: HTTP always used JSON.
  const rpc = Rpc.handler(api);
  const remote = Rpc.http<Api>(url);
  
  // After
  const codec = { encode: cbor.encode, decode: cbor.decode, contentType: 'application/cbor' };
  const rpc = Rpc.handler(api, { codec });
  const remote = Rpc.http<Api>(url, { codec });
  ```

- [#70](https://github.com/portablejs/portable/pull/70) [`6a146a1`](https://github.com/portablejs/portable/commit/6a146a1941bf7c9a05bc5102abc7eed6e205e054) - `Rpc.connect` takes a stream of transports, one per connection, such as the stream from `WebSockets.connections`. It sends on the newest transport and holds calls made between transports. When a transport's `readable` ends, the calls whose requests went out on it reject with `Rpc.TransportError`, instead of waiting forever.
  
  ```ts
  // Before: a call whose request was lost in a reconnect never settled.
  const room = Rpc.connect<RoomApi>(WebSockets.connect(url));
  
  // After
  const room = Rpc.connect<RoomApi>(WebSockets.connections(url));
  ```

- [#66](https://github.com/portablejs/portable/pull/66) [`f1370e2`](https://github.com/portablejs/portable/commit/f1370e2bc6de10211f160407f1e3fabf241cfa52) - `Rpc.answer` answers one encoded message without a transport and resolves with the encoded reply. `Rpc.notifier` returns a typed proxy that encodes notifications and passes them to a `send` function. Neither keeps state between messages, so a Durable Object that accepts WebSockets with hibernation can answer calls in `webSocketMessage` and push notifications from another request. `answer` can't stream a result, because streaming needs a server that keeps the stream in memory between messages. If a method returns an async iterable or a `ReadableStream`, `answer` cancels it and replies with error code `-32603`. `Rpc.Codec` takes a second type parameter, `received`, for the type `decode` accepts, so `Rpc.json` is now typed as `Codec<string, string | Uint8Array>`.

## 0.1.0

### Minor Changes

- [`8ebdda6`](https://github.com/portablejs/portable/commit/8ebdda6ce448764af23cd351e2894d1e5c4b6758) - Initial release. `Rpc.connect`, `provide`, `call`, `notify`, and `withContext` make typed JSON-RPC 2.0 calls over any `{ readable, writable }` transport, with streaming results that apply backpressure, and cancellation through `$/cancel`. `port` wraps a `MessagePort`, `Worker`, or `BroadcastChannel`; `window` connects to another window; `handler` and `http` carry calls over HTTP; and `json` is the default codec. Where the runtime has `Symbol.asyncDispose`, a remote declared with `await using` closes its connection at the end of the scope. Replaces comlink, penpal, post-me, birpc, and json-rpc-2.0.

### Patch Changes

- Updated dependencies [[`f637257`](https://github.com/portablejs/portable/commit/f637257a41ca66306438256279150ee9e214671a), [`c8c2035`](https://github.com/portablejs/portable/commit/c8c20356c5cf917cc48c3e66e559a4fa8e80586b)]:
  - @portable/errors@0.1.0
  - @portable/jsonl@0.1.0
