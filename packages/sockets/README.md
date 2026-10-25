# @portable/sockets

TCP and TLS client sockets with the shape of the [WinterTC Sockets API](https://sockets-api.proposal.wintertc.org/), the API of `connect` from `cloudflare:sockets`. The main entry exports only types. `@portable/smtp` and other protocol clients take a `connect` function of type `Sockets.Connect` instead of opening sockets themselves. `@portable/sockets/node` has a `connect` built on `node:net` and `node:tls`, so the same client runs in Cloudflare Workers, Deno, Bun and Node 24+.

Replaces [@arrowood.dev/socket](https://www.npmjs.com/package/@arrowood.dev/socket).

```sh
npm install @portable/sockets
```

Write the client against `Sockets.Connect`:

```ts
import type * as Sockets from '@portable/sockets';

export async function greeting(connect: Sockets.Connect, hostname: string): Promise<string> {
  const socket = connect({ hostname, port: 25 }, { secureTransport: 'off', allowHalfOpen: false });
  try {
    const reader = socket.readable.getReader();
    const { value } = await reader.read();
    return new TextDecoder().decode(value);
  } finally {
    await socket.close();
  }
}
```

Then pass `connect` from `cloudflare:sockets` on Workers:

```ts
import { connect } from 'cloudflare:sockets';

await greeting(connect, 'mx.example.com');
```

On Deno, Bun and Node, pass `connect` from `@portable/sockets/node`:

```ts
import { connect } from '@portable/sockets/node';

await greeting(connect, 'mx.example.com');
```

## API

### `connect(address, options)`

Imported from `@portable/sockets/node`. Opens a connection to `address` (`{ hostname, port }`) and returns a `Socket` at once. Deno and Bun run it through their `node:net` and `node:tls`. It throws a `TypeError` for a missing hostname or a port that isn't a number, and a `RangeError` for a port outside 0 to 65535 or an unknown `secureTransport`.

| Option | Description |
| --- | --- |
| `secureTransport` | `'off'` for plain TCP, `'on'` for TLS from the start, or `'starttls'` for plain TCP that `startTls()` can upgrade. |
| `allowHalfOpen` | When `false`, the writable side closes as soon as the peer ends its side. When `true`, it stays open until you close it. |

With `secureTransport: 'on'` and after `startTls()`, `connect` checks the server certificate against Node's bundled root certificates and the hostname. It also sends the hostname as SNI unless the hostname is an IP address.

The socket has these members:

| Member | Description |
| --- | --- |
| `readable` | A `ReadableStream<Uint8Array>` of the bytes the peer sends. It closes when the peer ends its side and errors if the connection fails. Cancelling it discards incoming bytes and leaves the writable side open. |
| `writable` | A `WritableStream<Uint8Array>` for the bytes to send. Closing it ends this side of the connection. A write after the connection closes rejects with a `TypeError`. |
| `opened` | Resolves with `{ remoteAddress, localAddress }`, each as `host:port`, once the connection and the TLS handshake are done. Rejects with Node's error, such as one with `code` `ECONNREFUSED`, if the connection fails. |
| `closed` | Resolves when the connection closes and rejects with the error if it fails. |
| `close()` | Closes both sides at once, without waiting for the peer, and returns `closed`. Reads after it are done, and writes reject. |
| `startTls()` | Starts TLS on a socket opened with `secureTransport: 'starttls'` and returns the TLS socket. The old socket's `upgraded` becomes `true`, its readable closes, its writes reject and its `closed` resolves. It throws a `TypeError` for any other socket and on a second call. |
| `upgraded` | Whether `startTls()` was called on this socket. |
| `[Symbol.asyncDispose]()` | Calls `close()`, so `await using socket = connect(address, options)` closes the socket at the end of the scope. It exists only where the runtime has `Symbol.asyncDispose`. |

### `create(options)`

Imported from `@portable/sockets/node`. Returns a `connect` that verifies TLS certificates with these options:

| Option | Description |
| --- | --- |
| `ca` | Certificates to trust instead of Node's bundled root certificates, as PEM text or an array of them. |
| `rejectUnauthorized` | Defaults to `true`. With `false`, any certificate is accepted. Turn it off only to test against a self-signed certificate, and pass `ca` instead where you can. |

```ts
import { create } from '@portable/sockets/node';

const connect = create({ ca: await readFile('internal-ca.pem', 'utf8') });
```

### Differences between runtimes

The Sockets API leaves some behavior open, and workerd, the Workers runtime, differs from this package's Node adapter in these cases. If your code runs on both, don't rely on either behavior.

- When you close the writable side first and then read to the end, `closed` resolves in Node. In workerd it stays pending until you call `close()`. Call `close()` when you are done with a socket.
- When a connection is refused, Node rejects `opened` before `closed`, and workerd rejects `closed` first. Both reject.
- A read after `close()` is done in Node and rejects in workerd.
- With `allowHalfOpen: true`, workerd delivered no bytes when the peer wrote and then immediately ended its side.
- workerd resolved `closed` for a connection reset by the peer, where Node rejects it with `ECONNRESET`.

These were seen in workerd under Miniflare, which connects through a local proxy. Cloudflare's own network may behave differently.

## Types

| Type | Description |
| --- | --- |
| `Sockets.Connect` | `(address, options) => Socket`. Both `connect` from `cloudflare:sockets` and `connect` from `@portable/sockets/node` match this type. |
| `Sockets.Socket` | A connection: `readable`, `writable`, `opened`, `closed`, `upgraded`, `close()` and `startTls()`. |
| `Sockets.Address` | `{ hostname, port }`. |
| `Sockets.Options` | `{ secureTransport, allowHalfOpen }`. Both are required, because the `cloudflare:sockets` types require `allowHalfOpen`. |
| `Sockets.Info` | What `opened` resolves with: `remoteAddress` and `localAddress`, where the runtime knows them. |
| `Socket` | From `@portable/sockets/node`: a `Sockets.Socket` with `[Symbol.asyncDispose]()`. |

## Why use this over @arrowood.dev/socket

- `startTls()` verifies the server certificate and sends SNI. @arrowood.dev/socket wraps the plain socket in `new tls.TLSSocket(socket)`, which does neither, so a STARTTLS connection accepts any certificate.
- `opened` resolves after the connection and the TLS handshake, as the Sockets API specifies. @arrowood.dev/socket has no `opened`.
- `close()` closes both sides at once. @arrowood.dev/socket calls `end()`, which only ends this side, so its readable still receives what the peer sends after `close()`.
- `allowHalfOpen` is a required option. @arrowood.dev/socket defaults it to `true`, while the Sockets API and `cloudflare:sockets` default to `false`.
- It is an ES module with no dependencies outside `@portable/*`, and its tests run in Deno and Bun as well as Node.

<!-- bench:start -->
| | @portable/sockets | @arrowood.dev/socket | node:net |
| --- | ---: | ---: | ---: |
| Echo 16 MB over TCP on localhost | 36.5 | 33.9 | 41.1 |
| Open and close a connection on localhost | 15,300 | 13,500 | 24,200 |

Operations per second from `pnpm bench`, higher is better, in Node 24.22.1, on Intel(R) Xeon(R) Processor @ 2.10GHz (4 cores). A dash means the library has no equivalent.

| | @portable/sockets | @arrowood.dev/socket | node:net |
| --- | --- | --- | --- |
| Minified and gzipped | 1.5 kB | 1.3 kB | built in |
| Runtime dependencies | 2 | 0 | – |
| Node built-ins used | `net`, `tls` | `net`, `stream`, `tls` | Node only |
| TypeScript types | included | included | – |
| Version compared | – | 0.2.0 | – |

Sizes cover the imports in the usage example, or the equivalent imports of each library, bundled for the browser by `scripts/bundle-size.ts`. Runtime dependencies count every package installed with the published package. A library that uses Node built-ins needs polyfills in a browser and the `nodejs_compat` flag in Cloudflare Workers.
<!-- bench:end -->

