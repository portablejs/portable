---
'@portable/sockets': minor
---

Added the `Sockets.Connect` and `Sockets.Socket` types in the shape of the WinterTC Sockets API, which `connect` from `cloudflare:sockets` fits. Added `connect` and `create` in `@portable/sockets/node`, which open TCP and TLS connections with `node:net` and `node:tls` in Deno, Bun and Node. `startTls()` verifies the server certificate and sends SNI. Replaces @arrowood.dev/socket.
