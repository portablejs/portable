# @portable/sockets

## 0.1.0

### Minor Changes

- [#27](https://github.com/portablejs/portable/pull/27) [`b2d6cb3`](https://github.com/portablejs/portable/commit/b2d6cb3e0e0588f159df726b8fd2f1cf228b6d32) - Initial release. The `Sockets.Connect` and `Sockets.Socket` types follow the WinterTC Sockets API, which `connect` from `cloudflare:sockets` fits. `@portable/sockets/node` has `connect` and `create`, which open TCP and TLS connections with `node:net` and `node:tls` in Node, Bun, and Deno, and `startTls()` verifies the server certificate and sends SNI. Replaces @arrowood.dev/socket.

### Patch Changes

- Updated dependencies [[`ef22071`](https://github.com/portablejs/portable/commit/ef22071656ac46dc37c780989da9b1caed3d7375), [`f637257`](https://github.com/portablejs/portable/commit/f637257a41ca66306438256279150ee9e214671a)]:
  - @portable/bytes@0.1.0
  - @portable/errors@0.1.0
