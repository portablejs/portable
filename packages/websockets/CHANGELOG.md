# @portable/websockets

## 0.1.0

### Minor Changes

- [`79aba4e`](https://github.com/portablejs/portable/commit/79aba4ee1c8fd79e6904c8bf262c4b9b90f7aed4) - Initial release. `WebSockets.connect` opens a WebSocket that reconnects, with a readable and a writable stream that stay the same across reconnects, and `fromSocket` wraps an existing socket in the same two streams. Where the runtime has `Symbol.asyncDispose`, both work with `await using`, which closes the socket at the end of the scope. Replaces reconnecting-websocket, partysocket, and websocket-ts.

### Patch Changes

- Updated dependencies [[`ef22071`](https://github.com/portablejs/portable/commit/ef22071656ac46dc37c780989da9b1caed3d7375), [`f637257`](https://github.com/portablejs/portable/commit/f637257a41ca66306438256279150ee9e214671a), [`c04a3b9`](https://github.com/portablejs/portable/commit/c04a3b916eacf40859ed1cd8a4de9544de8208a1)]:
  - @portable/bytes@0.1.0
  - @portable/errors@0.1.0
  - @portable/timers@0.1.0
