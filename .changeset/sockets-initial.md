---
'@portable/sockets': minor
---

Initial release. The `Sockets.Connect` and `Sockets.Socket` types follow the WinterTC Sockets API, which `connect` from `cloudflare:sockets` fits. `@portable/sockets/node` has `connect` and `create`, which open TCP and TLS connections with `node:net` and `node:tls` in Deno, Bun and Node, and `startTls()` verifies the server certificate and sends SNI. Replaces @arrowood.dev/socket.
