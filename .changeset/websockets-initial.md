---
'@portable/websockets': minor
---

Added `connect`, a WebSocket that reconnects and exposes a readable and a writable stream that stay the same across reconnects, and `fromSocket`, which wraps an existing socket in the same two streams. Replaces reconnecting-websocket, partysocket and websocket-ts.
