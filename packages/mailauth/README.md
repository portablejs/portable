# @portable/mailauth

Checks a received message's SPF, DKIM, DMARC and ARC in one call, writes the results as an Authentication-Results header field (RFC 8601), and can ARC-seal the message with them. Runs in browsers, Cloudflare Workers, Deno, Bun and Node 24+.

Replaces `authenticate` from [mailauth](https://www.npmjs.com/package/mailauth).

```sh
npm install @portable/mailauth @portable/dns
```

```ts
import * as Dns from '@portable/dns'
import * as Mailauth from '@portable/mailauth'

const result = await Mailauth.authenticate(message, {
  resolver: Dns.createResolver(),
  authservId: 'mx.example.net',
  ip: '192.0.2.1',
  helo: 'mail.example.com',
  sender: 'alice@example.com',
  signal: AbortSignal.timeout(10_000),
})

if (result.dmarc?.disposition === 'reject') reject('550 5.7.1 Rejected by DMARC policy')
const delivered = result.headers + message
```

A forwarder, such as a mailing list, passes `seal` as well, and `result.headers` then starts with a new ARC set that records these results:

```ts
const result = await Mailauth.authenticate(message, {
  resolver,
  authservId: 'lists.example.org',
  ip,
  helo,
  sender,
  seal: { domain: 'lists.example.org', selector: 'arc', privateKey: env.ARC_PRIVATE_KEY },
})
const forwarded = result.headers + message
```

A message is a `ReadableStream<Uint8Array>`, a `Uint8Array` or a string, which is encoded as UTF-8. `authenticate` reads a stream into memory once, because DKIM, ARC and the seal each read the message. Pipe the stream through `Streams.limitBytes` from `@portable/streams` to cap its size. Bare LF line ends are read as CRLF.

## Options

| Option | Default | Description |
| --- | --- | --- |
| `resolver` | required | Answers the DNS lookups: `Dns.createResolver()`, `node:dns/promises`, or any object with `resolveTxt`, `resolve4`, `resolve6`, `resolveMx`, `resolvePtr` and `resolveCname`. |
| `authservId` | required | The authserv-id that starts Authentication-Results, usually this server's host name in A-label form (RFC 8601 section 2.5). It must be an RFC 2045 token, so a value such as `mx.example; dkim=pass` throws a `RangeError`. |
| `ip` | required | The SMTP client's IPv4 or IPv6 address. |
| `helo` | none | The HELO or EHLO name. |
| `sender` | none | The MAIL FROM address. Empty or missing for a bounce, which makes SPF check the HELO name. |
| `seal` | none | `{ domain, selector, privateKey, headers?, signedAt? }`, as `Arc.seal` takes them. `authenticate` fills in the ARC-Authentication-Results payload and `cv=`. |
| `now` | `new Date()` | The time to check DKIM and ARC signature expiry against. |
| `minKeyBits` | `1024` | RSA keys shorter than this give DKIM `policy` and fail the ARC chain. |
| `hash` | WebCrypto | Creates the body hashes. See [Crypto in @portable/dkim](../dkim/README.md#crypto). |
| `organizationalDomain` | the DNS tree walk | Finds organizational domains from a public suffix list, as in [`Dmarc.check`](../dmarc/README.md#options). |
| `signal` | none | Stops reading the message and every DNS lookup. The promise rejects with `signal.reason`. |

## Result

`authenticate` resolves to a plain object. It rejects only for invalid options, a failing message stream or an aborted `signal`. DNS failures are results, such as `temperror`.

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
- `arc` reports `smtp.remote-ip` (RFC 8617 section 6). On a pass, the comment repeats what the newest sealer recorded. The sealer's text is untrusted, so only results that are keywords and domains that are host names are copied from it.
- `dmarc` reports the applied policy as `policy.dmarc` and the From domain as `header.from` (RFC 9989 section 9.1), and is left out when `dmarcSkipReason` is set.

Values that aren't a token or an address are quoted, comments keep their parentheses balanced, and no line is longer than 998 octets (RFC 5322 section 2.1.1), whatever the message, sender or HELO name holds.

## Why use this over mailauth

- It runs anywhere. mailauth uses `node:crypto`, `node:dns`, `node:os` and Buffers.
- It follows the RFCs. mailauth's default mode accepts what its `strict: true` mode rejects, and writes Received-SPF above Authentication-Results. Here RFC behavior is the only behavior. On 400 generated messages, which cover every SPF result and the common DKIM, DMARC and ARC results, it gives mailauth's strict results and the same Authentication-Results properties, except that a DKIM key record problem gives `permerror` instead of `neutral`, as in `@portable/dkim`.
- It never writes an authserv-id that isn't a token. mailauth quotes one in its default mode, so a reader that splits the field on semicolons can still be fooled by `mx.example; dkim=pass`.
- It authenticates and seals a short message faster: 445 times a second against 303 for mailauth's strict mode in one run in Node, and about the same, 243 against 251, for a 250 KB message with a DKIM signature and an ARC set.
- It has no dependencies outside `@portable/*`.

## Migrating from mailauth

| mailauth | @portable/mailauth |
| --- | --- |
| `authenticate(message, { ip, helo, sender, mta, resolver })` | `Mailauth.authenticate(message, { ip, helo, sender, authservId, resolver })`. `authservId` is required, as there is no `os.hostname()`. |
| `resolver: (name, type) => ...` | An object with `resolveTxt` and the other methods, such as `node:dns/promises`. |
| `strict: true`, `rejectRsaSha1` | The only behavior. |
| `minBitLength` | `minKeyBits` |
| `seal: { signingDomain, selector, privateKey }` | `seal: { domain, selector, privateKey }` |
| `result.headers` | `result.headers`, without Received-SPF. |
| `result.spf.status.result` | `result.spf.result` |
| `result.dkim.results[i].status.result` | `result.dkim[i].result` |
| `result.dmarc.status.result`, `result.dmarc` is `false` | `result.dmarc?.result`, `result.dmarc` is `undefined` |
| `result.dmarcSkipReason` | `result.dmarcSkipReason`, with the same values. |
| `result.arc.status.result` | `result.arc.result` |
| `result.arc.sealErrors` | `result.sealSkipReason` |
| `trustReceived` | Not supported. Pass the address and HELO name from your SMTP server. |
| `disableArc`, `disableDmarc`, `disableBimi` | Not needed: use `Arc.verify`, `Dmarc.check` or `Dkim.verify` directly for one check. BIMI isn't supported. |
| `result.bimi` | Not supported. |
| `result.receivedChain` | Not supported. |
| `dkim2` | Not supported. |
