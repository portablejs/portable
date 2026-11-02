# @portable/smtp

Sends email over SMTP (RFC 5321) or LMTP (RFC 2033) from any runtime with a TCP socket API: Cloudflare Workers, Node 24+, Bun, and Deno. You pass the function that opens the socket. The message can be a `ReadableStream`, such as [@portable/mail](https://portablejs.com/packages/mail) output signed with [@portable/dkim](https://portablejs.com/packages/dkim), and is streamed without buffering.

Replaces the SMTP transport and `smtp-connection` of [nodemailer](https://www.npmjs.com/package/nodemailer).

```sh
npm install @portable/smtp
```

```ts
import * as Smtp from '@portable/smtp';
import { connect } from 'cloudflare:sockets';

const result = await Smtp.send(
  { from: 'me@example.com', to: ['you@example.com'], message: 'Subject: Hi\r\n\r\nHello' },
  {
    connect,
    host: 'smtp.example.com',
    auth: { user: 'me@example.com', pass: env.SMTP_PASSWORD },
    signal: AbortSignal.timeout(30_000),
  },
);
result.accepted; // ['you@example.com']
```

Cloudflare Workers can't connect to port 25, so use a submission port (587 or 465) on a relay.

To send several messages over one connection, open a client:

```ts
await using client = await Smtp.connect({ connect, host: 'smtp.example.com', auth });
for (const mail of outbox) {
  await client.send(mail);
}
```

`await using` sends QUIT and closes the connection when the block ends, even if a send throws. Without it, call `client.close()` in `finally`.

## Sockets

`connect` is called as `connect({ hostname, port }, { secureTransport, allowHalfOpen })` and returns a [Sockets API](https://sockets-api.proposal.wintertc.org/) socket (`Sockets.Connect` in [@portable/sockets](https://portablejs.com/packages/sockets)).

On Cloudflare Workers, pass `connect` from `cloudflare:sockets`. On Node, Bun, and Deno, pass `connect` from `@portable/sockets/node`:

```ts
import * as Smtp from '@portable/smtp';
import { connect } from '@portable/sockets/node';

await Smtp.send(mail, { connect, host: 'smtp.example.com', auth });
```

## API

### `Smtp.connect(options)`

Connects, sends EHLO, starts TLS, logs in, and resolves with a `Client`. If the server refuses EHLO, `connect` falls back to HELO, or rejects with `ETLS` when `secure` is `'starttls'`.

| Option | Default | Description |
| --- | --- | --- |
| `connect` | Required | Opens the socket. See [Sockets](#sockets). |
| `host` | Required | The server's host name. |
| `port` | 465 when `secure` is `'on'`, otherwise 587 | |
| `secure` | `'on'` for port 465, otherwise `'starttls'` | `'on'` starts TLS right away. `'starttls'` fails if the server doesn't offer STARTTLS. `'off'` never encrypts. |
| `auth` | None | `{ user, pass }` for AUTH PLAIN, or LOGIN if the server offers only LOGIN. Set `method: 'LOGIN'` to force LOGIN. `{ user, accessToken }` for XOAUTH2. |
| `allowInsecureAuth` | `false` | Send credentials over an unencrypted connection. Without it, AUTH requires TLS. |
| `name` | `'[127.0.0.1]'` | The host name sent with EHLO. A name with CR or LF makes `connect` reject with a `RangeError`. |
| `lmtp` | `false` | Speak LMTP. Set `port` and `secure` too, because the defaults are for SMTP. Recipients refused after the message are listed in `rejected`, and if all are refused, `send` rejects with `EMESSAGE`. |
| `signal` | None | Limits connecting, TLS, and login. Aborting rejects with `signal.reason` and closes the socket. |

With `auth` set, the client always authenticates. If the server offers neither PLAIN nor LOGIN, `connect` rejects with `EAUTH` without sending the password.

### `client.send(mail, { signal })`

Sends one message and resolves with `{ accepted, rejected, response }` if at least one recipient accepted it. `rejected` lists the others with their replies. Concurrent calls run one after another.

| Field | Description |
| --- | --- |
| `from` | The envelope sender. `''` sends `MAIL FROM:<>`, as bounces do. |
| `to` | One recipient or an array. |
| `message` | The raw message as a `string`, `Uint8Array`, or `ReadableStream<Uint8Array>`. Line breaks are converted to CRLF and dot-stuffed. |
| `size` | The message size for the SIZE extension, computed for strings and bytes. A message over the server's limit fails before MAIL FROM. |
| `dsn` | `{ ret, envid, notify }` (RFC 3461), sent if the server offers DSN. |
| `requireTls` | Ask the server to relay only over TLS (RFC 8689). Fails before MAIL FROM if the connection isn't encrypted or the server lacks REQUIRETLS. |

The client uses PIPELINING, BODY=8BITMIME, and SMTPUTF8 (for non-ASCII addresses) when the server offers them. An address with a control character or an angle bracket is rejected before anything is sent.

A stream message that isn't sent in full is cancelled.

Aborting `signal` rejects with `signal.reason`. A started send also closes the connection. A send still waiting for earlier calls rejects at once and leaves the connection open.

After an `ECONNECTION` error or a failed message stream, the client is closed, so open a new one. After `EENVELOPE`, or `EMESSAGE` for a refused or oversized message, you can keep sending. The exception: if a PIPELINING server refuses the sender and then accepts `DATA`, the client closes the connection after the `EENVELOPE`.

### `client.close({ signal })`

Waits for queued sends, sends QUIT, and closes the socket. It never rejects. Aborting `signal` stops waiting for the reply to QUIT.

Where the runtime has `Symbol.asyncDispose`, the client also has `[Symbol.asyncDispose]()`, which calls `close()`.

### `Smtp.send(mail, options)`

Connects with `options`, sends one message, and closes the connection. Here `signal` limits the whole call.

### `Smtp.CommandError`

Every failure rejects with a `Smtp.CommandError`, except a `TypeError` or `RangeError` for invalid options and `signal.reason` on abort. Its fields never include credentials.

| Field | Description |
| --- | --- |
| `code` | `'ECONNECTION'`, `'EPROTOCOL'`, `'ETLS'`, `'EAUTH'`, `'EENVELOPE'`, or `'EMESSAGE'`. |
| `command` | The command the server refused, such as `'RCPT TO'`, or `'CONNECT'`. |
| `responseCode` | The reply code, such as `550`. |
| `enhancedCode` | The RFC 3463 code, such as `'5.1.1'`. |
| `response` | The server's whole reply. |
| `rejected` | Each recipient with its reply, set when every recipient was refused, including after the message with `lmtp`. |

| `code` | Meaning |
| --- | --- |
| `ECONNECTION` | The socket failed to open or closed early, or the server replied 421 to any command. Retry on a new connection. |
| `EPROTOCOL` | The greeting wasn't 220, the server refused both EHLO and HELO (or LHLO with `lmtp`), or a reply was malformed or over 1 MiB. |
| `ETLS` | STARTTLS was not offered or was refused, EHLO was refused before STARTTLS, or the TLS handshake failed. |
| `EAUTH` | Login failed, no supported method was offered, or the connection is plaintext without `allowInsecureAuth`. |
| `EENVELOPE` | An address is invalid, the server refused the sender, every recipient or DATA, or the server can't honor SMTPUTF8 or REQUIRETLS. |
| `EMESSAGE` | The message is over the SIZE limit, the message stream errored, or the server refused the message after DATA (with `lmtp`, for every recipient). |

## Types

| Type | Description |
| --- | --- |
| `Smtp.Client` | An open session from `connect`, with the methods `send`, `close`, and `[Symbol.asyncDispose]`, and the fields `secure` (whether the connection is encrypted) and `extensions` (the extension lines of the EHLO reply, empty after a HELO fallback). |
| `Smtp.Mail` | A message and its envelope, as `send` takes them. |
| `Smtp.Result` | The outcome of a send that reached at least one recipient. |
| `Smtp.Rejection` | A recipient the server refused, with its reply. |
| `Smtp.Auth` | Credentials for AUTH PLAIN or LOGIN, or an OAuth 2.0 access token for XOAUTH2. |
| `Smtp.Dsn` | RFC 3461 delivery status notification parameters. |
| `Smtp.Connect` | The function that opens a socket, such as `connect` from `cloudflare:sockets` or `@portable/sockets/node`. The same type as `Sockets.Connect`. |
| `Smtp.Socket` | The socket `Connect` returns. The same type as `Sockets.Socket`. |

## Why use this over nodemailer

- It runs in Cloudflare Workers and Deno as well as Node, and has no dependencies outside `@portable/*`.
- STARTTLS is required unless you pass `secure: 'off'`. nodemailer continues in plaintext when STARTTLS fails unless `requireTLS` is set.
- Credentials are never sent over plaintext unless `allowInsecureAuth` is set.
- With `auth` set, the client always authenticates. nodemailer sends unauthenticated when the server doesn't offer AUTH, unless `forceAuth` is set.
- Bare CR and LF are converted to CRLF before dot-stuffing, so a message can't smuggle an end of DATA. The output is byte-identical to nodemailer's.
- Every 421 reply is `ECONNECTION`, so one check of `code` finds every "retry on a new connection" case.
- 8-bit messages are declared with BODY=8BITMIME automatically.

The benchmarks send to a server on localhost that answers at once.

<!-- bench:start -->
<table>
<thead><tr><th align="left">Library</th><th align="right">Ops/s</th><th align="left">Relative</th><th></th></tr></thead>
<tbody>
<tr><th colspan="4" align="left">Send 10 small messages over one connection</th></tr>
<tr><td>@portable/smtp</td><td align="right">1,360</td><td></td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="160" height="12" alt="" /></td></tr>
<tr><td>nodemailer</td><td align="right">1,200</td><td>1.1× slower</td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="141" height="12" alt="" /></td></tr>
<tr><th colspan="4" align="left">Send a 1 MB message</th></tr>
<tr><td>@portable/smtp</td><td align="right">63.3</td><td></td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="160" height="12" alt="" /></td></tr>
<tr><td>nodemailer</td><td align="right">51.9</td><td>1.2× slower</td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="131" height="12" alt="" /></td></tr>
</tbody>
</table>

Operations per second from `pnpm bench`, higher is better, in Node 24.22.0, on Intel(R) Xeon(R) Processor @ 2.10GHz (4 cores). Each benchmark lists only the libraries that can do the same work, fastest first. The relative speed compares each library with @portable/smtp, and the bars are scaled to the fastest library.

| Library | Version | Minified and gzipped | Runtime dependencies | Node built-ins | TypeScript types |
| --- | --- | ---: | ---: | --- | --- |
| @portable/smtp | – | 6.1 kB | 4 | none | included |
| nodemailer | 10.2.1 | 15 kB | 0 | `Buffer`, `crypto`, `dns`, `events`, `fs`, `http`, `https`, `net`, `os`, `stream`, `tls`, `url`, `util`, `zlib` | none |

Sizes cover the imports in the usage example, or the equivalent imports of each library, bundled for the browser by `scripts/bundle-size.ts`. Runtime dependencies count every package installed with the published package. A library that uses Node built-ins needs polyfills in a browser and the `nodejs_compat` flag in Cloudflare Workers.
<!-- bench:end -->

- `Smtp.send` and `client.send` send an empty message. nodemailer refuses it.
- `Smtp.connect` throws a `RangeError` for a `name` that contains CR or LF. nodemailer removes the CR and LF instead.
- nodemailer's `opportunisticTLS`, `logger`, and `debug` options have no equivalent.
- nodemailer refreshes an OAuth2 access token itself. `auth: { user, accessToken }` sends the token as given, so refresh it yourself before it expires.
- CRAM-MD5 and custom `auth.type` handlers aren't supported, because WebCrypto has no MD5.
- `mail.dsn` has no equivalent of nodemailer's `orcpt`.
- nodemailer's `pool: true` has no equivalent. Keep a `Client` open and send several messages over it instead.
- nodemailer's `proxy` and `getSocket` options have no equivalent. Open the tunnel in the `connect` function instead.
- nodemailer's `info.rejected` is a list of address strings. `result.rejected` is a list of objects with `recipient`, `responseCode`, `enhancedCode`, and `response`.
- The result has no `messageId` or `envelope`, which nodemailer returns in `info`.
