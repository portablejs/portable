# @portable/websockets

## 0.3.0

### Minor Changes

- [#71](https://github.com/portablejs/portable/pull/71) [`ec968ef`](https://github.com/portablejs/portable/commit/ec968ef22ba8a254ce35877684451e90289e38e2) - `fromSocket` takes the `heartbeat` option that `connect` has. Pings start when the socket opens, and pongs don't reach `readable`. When a reply doesn't arrive in time, `fromSocket` closes the socket with 1000 and fails both streams with a `TimeoutError` `DOMException`, because it can't reconnect.
  
  `Socket.bufferedAmount` is optional, so a Cloudflare Workers `WebSocket`, which has none, type-checks as a `Socket`. On a socket without it, each write is sent at once.

## 0.2.0

### Minor Changes

- [#70](https://github.com/portablejs/portable/pull/70) [`6a146a1`](https://github.com/portablejs/portable/commit/6a146a1941bf7c9a05bc5102abc7eed6e205e054) - Add `WebSockets.connections(url, options)`, which returns a `ReadableStream` with one `{ readable, writable }` pair per connection. When a pair's socket closes, its `readable` delivers the messages it holds and then ends. A write to a closed connection rejects and sends nothing. Use it when you need to know which messages went out on which connection. `connect` is now built on it and behaves as before.

## 0.1.0

### Minor Changes

- [`79aba4e`](https://github.com/portablejs/portable/commit/79aba4ee1c8fd79e6904c8bf262c4b9b90f7aed4) - Initial release. `WebSockets.connect` opens a WebSocket that reconnects, with a readable and a writable stream that stay the same across reconnects, and `fromSocket` wraps an existing socket in the same two streams. Where the runtime has `Symbol.asyncDispose`, both work with `await using`, which closes the socket at the end of the scope. Replaces reconnecting-websocket, partysocket, and websocket-ts.

### Patch Changes

- Updated dependencies [[`ef22071`](https://github.com/portablejs/portable/commit/ef22071656ac46dc37c780989da9b1caed3d7375), [`f637257`](https://github.com/portablejs/portable/commit/f637257a41ca66306438256279150ee9e214671a), [`c04a3b9`](https://github.com/portablejs/portable/commit/c04a3b916eacf40859ed1cd8a4de9544de8208a1)]:
  - @portable/bytes@0.1.0
  - @portable/errors@0.1.0
  - @portable/timers@0.1.0
