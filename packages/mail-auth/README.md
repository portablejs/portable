# @portable/mail-auth

Checks a received message's SPF, DKIM, DMARC and ARC in one call, writes the results as an Authentication-Results header field (RFC 8601), and can ARC-seal the message with them. Runs in browsers, Cloudflare Workers, Deno, Bun and Node 24+.

Replaces `authenticate` from [mailauth](https://www.npmjs.com/package/mailauth).

```sh
npm install @portable/mail-auth @portable/dns
```

```ts
import * as Dns from '@portable/dns';
import * as MailAuth from '@portable/mail-auth';

const result = await MailAuth.authenticate(message, {
  resolver: Dns.create(),
  authservId: 'mx.example.net',
  ip: '192.0.2.1',
  helo: 'mail.example.com',
  sender: 'alice@example.com',
  signal: AbortSignal.timeout(10_000),
});

if (result.dmarc?.disposition === 'reject') {
  reject('550 5.7.1 Rejected by DMARC policy');
}
const delivered = result.headers + message;
```

A forwarder, such as a mailing list, passes `seal` as well, and `result.headers` then starts with a new ARC set that records these results:

```ts
const result = await MailAuth.authenticate(message, {
  resolver,
  authservId: 'lists.example.org',
  ip,
  helo,
  sender,
  seal: { domain: 'lists.example.org', selector: 'arc', privateKey: env.ARC_PRIVATE_KEY },
});
const forwarded = result.headers + message;
```

A message is a `ReadableStream<Uint8Array>`, a `Uint8Array` or a string, which is encoded as UTF-8. `authenticate` reads the message once, and DKIM, ARC and the seal share each body hash, so a body signed relaxed is canonicalized and hashed once for all three. The default WebCrypto hasher keeps the canonicalized body in memory, and the `hasher` option takes an incremental hash instead. Pipe a stream through `Streams.limitBytes` from `@portable/streams` to cap its size, and `tee` it if you deliver it afterwards. Bare LF line ends are read as CRLF.

## Options

| Option | Default | Description |
| --- | --- | --- |
| `resolver` | required | Answers the DNS lookups: `Dns.create()`, `node:dns/promises`, or any object with `resolveTxt`, `resolve4`, `resolve6`, `resolveMx`, `resolvePtr` and `resolveCname`. |
| `authservId` | required | The authserv-id that starts Authentication-Results, usually this server's host name in A-label form (RFC 8601 section 2.5). It must be an RFC 2045 token, so a value such as `mx.example; dkim=pass` throws a `RangeError`. |
| `ip` | required | The SMTP client's IPv4 or IPv6 address. |
| `helo` | none | The HELO or EHLO name. |
| `sender` | none | The MAIL FROM address. Empty or missing for a bounce, which makes SPF check the HELO name. |
| `seal` | none | `{ domain, selector, privateKey, headers?, now? }`, as `Arc.seal` takes them. `authenticate` fills in the ARC-Authentication-Results payload and `cv=`. |
| `now` | `new Date()` | The time to check DKIM and ARC signature expiry against. |
| `minKeyBits` | `1024` | RSA keys shorter than this give DKIM `policy` and fail the ARC chain. |
| `hasher` | WebCrypto | Creates the body hashes. See [Crypto in @portable/dkim](../dkim/README.md#crypto). |
| `organizationalDomain` | the DNS tree walk | Finds organizational domains from a public suffix list, as in [`Dmarc.check`](../dmarc/README.md#options). |
| `signal` | none | Stops reading the message and every DNS lookup. The promise rejects with `signal.reason`. |

## Result

`authenticate` resolves to a plain object. It rejects only for invalid options, a failing message stream or an aborted `signal`. A DNS failure gives a result such as `temperror` instead of a rejection.

| Field | Description |
| --- | --- |
| `spf` | The [`Spf.check`](../spf/README.md) result for the MAIL FROM address, or for the HELO name of a bounce. |
| `dkim` | One [`Dkim.verify`](../dkim/README.md) result per DKIM-Signature, in header order. Empty for an unsigned message. |
| `arc` | The [`Arc.verify`](../arc/README.md) result. |
| `dmarc` | The [`Dmarc.check`](../dmarc/README.md) result for the From domain, with the SPF and DKIM results above. Missing when `dmarcSkipReason` is set. |
| `dmarcSkipReason` | Why DMARC wasn't checked: `'no-author-domain'` (no From field, or no mailbox in it), `'multiple-author-domains'`, `'multiple-from-fields'`, or `'invalid-author-domain'` (a From field that isn't a valid address list). RFC 9989 section 5.3.1 says DMARC can't be applied to such a message, and section 11.5 suggests treating it as suspicious. |
| `authResults` | The Authentication-Results value, without the field name. |
| `headers` | The fields to put above the message, each ending in CRLF: the ARC set when the message was sealed, then Authentication-Results. |
| `sealSkipReason` | Why the message wasn't sealed: it has no From field, its newest ARC-Seal says `cv=fail`, or it already has 50 ARC sets. The message can be delivered without a seal. |

## Authentication-Results

Each method has its own line, with a comment for anything that isn't a plain pass:

```
Authentication-Results: mx.example.net;
 dkim=pass header.d=example.com header.i=@example.com header.s=test
 header.a=rsa-sha256 header.b=Gk813IlW;
 spf=pass (mx.example.net: domain of alice@example.com designates 192.0.2.1 as
 permitted sender) smtp.mailfrom=example.com;
 arc=pass (i=1 spf=pass dkim=pass dkdomain=example.com dmarc=pass
 fromdomain=example.com) smtp.remote-ip=192.0.2.1;
 dmarc=pass (p=REJECT arc=pass) policy.dmarc=reject header.from=example.com
```

- `dkim` is `none` for an unsigned message, and otherwise one line per signature with `header.d`, `header.i`, `header.s`, `header.a` and the first 8 characters of `b=` as `header.b` (RFC 6008).
- `spf` reports `smtp.mailfrom` with the MAIL FROM domain, or `smtp.helo` for a bounce.
- `arc` reports `smtp.remote-ip` (RFC 8617 section 6). On a pass, the comment repeats what the newest sealer recorded. The sealer's text is untrusted, so only keyword results and host-name domains are copied from it.
- `dmarc` reports the applied policy as `policy.dmarc` and the From domain as `header.from` (RFC 9989 section 9.1), and is left out when `dmarcSkipReason` is set.

Values that aren't a token or an address are quoted, comments keep their parentheses balanced, and no line is longer than 998 octets (RFC 5322 section 2.1.1), whatever the message, sender or HELO name contains.

## Types

| Type | Description |
| --- | --- |
| `MailAuth.Resolver` | The lookups SPF, DKIM, DMARC and ARC need together: `Spf.Resolver & Dmarc.Resolver & Dkim.Resolver`. |
| `MailAuth.Result` | What `authenticate` resolves to, as above. |

## Why use this over mailauth

- It runs anywhere. mailauth uses `node:crypto`, `node:dns`, `node:os` and Buffers.
- It follows the RFCs. mailauth's default mode accepts what its `strict: true` mode rejects, and writes Received-SPF above Authentication-Results. This package has no lenient mode. On 400 generated messages, which cover every SPF result and the common DKIM, DMARC and ARC results, it gives mailauth's strict results and the same Authentication-Results properties, except that a DKIM key record problem gives `permerror` instead of `neutral`, as in `@portable/dkim`.
- It never writes an authserv-id that isn't a token. mailauth quotes one in its default mode, so `mx.example; dkim=pass` can still fool a reader that splits the field on semicolons.
- It authenticates and seals a short message faster than mailauth's strict mode in Node, and authenticates a 250 KB message with a DKIM signature and an ARC set about as fast, as the table below shows.
- It has no dependencies outside `@portable/*`.

Differences to check when you switch from mailauth:

- mailauth's `mta` defaults to `os.hostname()`, and `authservId` has no default, so pass it.
- mailauth's `resolver` is a function of `(name, type)`. Here `resolver` is an object with `resolveTxt` and the other methods, such as `node:dns/promises`.
- mailauth's `strict` and `rejectRsaSha1` options have no equivalent, because this package always behaves as if both were set: an rsa-sha1 signature gives DKIM `policy`.
- mailauth's `headers` include a Received-SPF field, and `result.headers` doesn't.
- mailauth sets `result.dmarc` to `false` when DMARC wasn't checked, and here `result.dmarc` is `undefined`.
- mailauth's `trustReceived` isn't supported. Pass the address and HELO name from your SMTP server.
- mailauth's `disableArc`, `disableDmarc` and `disableBimi` have no equivalent. To run one check, call `Arc.verify`, `Dmarc.check` or `Dkim.verify` directly.
- mailauth's BIMI check (`result.bimi`), `result.receivedChain` and `dkim2` aren't supported.

<!-- bench:start -->
| | @portable/mail-auth | mailauth |
| --- | ---: | ---: |
| Authenticate a 250 KB message with a DKIM signature and an ARC set | 246 | 238 |
| Authenticate and seal a short message | 433 | 323 |

Operations per second from `pnpm bench`, higher is better, in Node 24.22.0, on Intel(R) Xeon(R) Processor @ 2.10GHz (4 cores). A dash means the library has no equivalent.

| | @portable/mail-auth | mailauth |
| --- | --- | --- |
| Minified and gzipped | 32 kB | 775 kB |
| Runtime dependencies | 14 | 38 |
| Node built-ins used | none | `assert`, `async_hooks`, `buffer`, `console`, `crypto`, `diagnostics_channel`, `dns`, `events`, `fs`, `http`, `http2`, `https`, `net`, `os`, `path`, `perf_hooks`, `querystring`, `sqlite`, `stream`, `string_decoder`, `timers`, `tls`, `url`, `util`, `worker_threads`, `zlib` |
| TypeScript types | included | included |
| Version compared | – | 7.3.0 |

Sizes cover the imports in the usage example, or the equivalent imports of each library, bundled for the browser by `scripts/bundle-size.ts`. Runtime dependencies count every package installed with the published package. A library that uses Node built-ins needs polyfills in a browser and the `nodejs_compat` flag in Cloudflare Workers.
<!-- bench:end -->
