---
'@portable/websockets': minor
---

Initial release. `WebSockets.connect` opens a WebSocket that reconnects, with a readable and a writable stream that stay the same across reconnects, and `fromSocket` wraps an existing socket in the same two streams. Where the runtime has `Symbol.asyncDispose`, both work with `await using`, which closes the socket at the end of the scope. Replaces reconnecting-websocket, partysocket, and websocket-ts.
