# Test parity

This package replaces [@arrowood.dev/socket](https://github.com/ethan-arrowood/socket) (MIT) 0.2.0, a Node implementation of the Cloudflare Sockets API. Its npm package has no tests, so the list of cases below comes from the behavior of its published `dist/index.js` and from the [WinterTC Sockets API](https://sockets-api.proposal.wintertc.org/) draft. The oracle and benchmark compare with 0.2.0.

Test files:

- `node.conformance.test.ts` runs the Node adapter against `node:net` and `node:tls` servers on localhost (`servers.ts`). Its name ends in `.test.ts`, so the browser project skips it, and it contains `conformance`, so it also runs on Bun and Deno with `pnpm test:bun` and `pnpm test:deno`.
- `node.fuzz.conformance.test.ts` echoes random bytes, split into random writes in each byte form, over TCP and TLS, with and without `allowHalfOpen`.
- `node.oracle.test.ts` sends the same writes through @arrowood.dev/socket and this package and compares the echoed bytes, and checks the upstream issues below.
- `node.bench.ts` compares a 16 MB echo and opening a connection with @arrowood.dev/socket and `node:net`.
- The `sockets` check in `tools/workers/src/checks.ts` checks that `connect` from `cloudflare:sockets` matches `Sockets.Connect` and echoes bytes through it in workerd.

Test names below are `file > describe > test`, with the file's suffix left out.

## Upstream behavior

| Upstream behavior | Covered by | Notes |
| --- | --- | --- |
| `connect(address, options)` opens TCP, or TLS with `secureTransport: 'on'` | `node.conformance > connect > *`, `node.conformance > TLS > opens a TLS connection that verifies against ca` | |
| `connect('host:port')` parses a string address, with port 443 by default | Not applicable | `Sockets.Connect` takes `{ hostname, port }`, which is what drivers pass. A string throws a `TypeError`. |
| `readable` and `writable` from `Duplex.toWeb` | `node.conformance > connect > sends and receives bytes…`, `carries 4 MB unchanged in both directions`, `node.fuzz.conformance > *` | |
| `allowHalfOpen`, default `true` | `node.conformance > half-close > *` | The option is required here. Upstream's default is the opposite of the Sockets API's. |
| `closed` resolves on a clean close and rejects with a `SocketError` on an error | `node.conformance > errors and close > *` | Ours rejects with Node's error and its `code`. |
| `close()` calls `end()` and returns `closed` | `node.conformance > errors and close > close() closes both sides even if the peer never ends its side`, `close() returns the closed promise` | `close()` destroys the socket. See below. |
| `startTls()` throws unless `secureTransport` is `'starttls'`, and on a second call | `node.conformance > startTls > throws unless…`, `throws when called twice, or on the upgraded socket` | Ours throws a `TypeError`, and upstream's `SocketError` is also a `TypeError`. |
| `startTls()` returns a TLS socket over the same connection | `node.conformance > startTls > upgrades an open connection, and the old socket stops working` | |
| No `opened` | `node.conformance > connect > opens a TCP connection and resolves opened with the addresses`, `node.conformance > errors and close > a refused connection rejects opened…` | Added, as the Sockets API specifies. |
| No `upgraded` | `node.conformance > startTls > upgrades an open connection…` | Added. |

## Known upstream issues

| Issue | Test |
| --- | --- |
| `startTls()` wraps the socket in `new tls.TLSSocket(socket)`, which neither verifies the server certificate nor sends SNI. | `node.oracle > known upstream issues > upstream startTls() accepts a certificate that does not verify, and ours rejects it`, `node.conformance > startTls > verifies the certificate of the upgraded connection`, and the SNI check in `upgrades an open connection…` |
| `close()` only ends this side, so the readable keeps receiving what the peer sends. | `node.oracle > known upstream issues > upstream close() ends only this side, and ours closes both` |
| `allowHalfOpen` defaults to `true`, unlike the Sockets API and `cloudflare:sockets`. | Not tested: `Sockets.Options` requires the option. |
| When an error rejects `closed` and nothing awaits `closed`, Node reports an unhandled rejection. | `node.conformance > errors and close > a refused connection with nothing awaiting it causes no unhandled rejection` |
| No way to trust a private CA or a self-signed certificate. | `node.conformance > TLS > opens a TLS connection that verifies against ca`, `accepts any certificate with rejectUnauthorized: false` |
