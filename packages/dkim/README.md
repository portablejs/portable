# @portable/dkim

Signs and verifies DKIM signatures (RFC 6376) with RSA and Ed25519 keys (RFC 8463, RFC 8301). Runs in browsers, Cloudflare Workers, Node 24+, Bun, and Deno.

Replaces the DKIM parts of [mailauth](https://www.npmjs.com/package/mailauth) and the DKIM signer of [nodemailer](https://www.npmjs.com/package/nodemailer).

```sh
npm install @portable/dkim @portable/dns
```

```ts
import * as Dns from '@portable/dns';
import * as Dkim from '@portable/dkim';

const field = await Dkim.sign(message, {
  domain: 'example.com',
  selector: 'mail',
  privateKey: env.DKIM_PRIVATE_KEY,
});
const signed = field + message;

const results = await Dkim.verify(signed, {
  resolver: Dns.create(),
  signal: AbortSignal.timeout(10_000),
});
for (const r of results) {
  console.log(`dkim=${r.result} header.d=${r.domain} header.s=${r.selector}`);
}
```

A message is a `ReadableStream<Uint8Array>`, a `Uint8Array`, or a UTF-8 string. Bare LF line ends are read as CRLF.

`field + message` works only for a string. `sign` reads a stream to the end, so you can't send it afterwards. Instead, read the message into bytes with `Streams.toBytes` from [@portable/streams](https://portablejs.com/packages/streams), sign the bytes, and send `Bytes.concat([new TextEncoder().encode(field), bytes])` (see the [@portable/mail](https://portablejs.com/packages/mail) README).

In Node, you can use `node:dns/promises` as the resolver to use the system's DNS servers:

```ts
import dns from 'node:dns/promises';

await Dkim.verify(message, { resolver: dns });
```

## Signing

`sign` resolves to the DKIM-Signature field, ending in CRLF, to put above the message's other fields. It always writes `t=`, never `l=`, and folds lines at 76 characters.

| Option | Default | Description |
| --- | --- | --- |
| `domain` | required | The signing domain (`d=`). A U-label domain is written as its A-label. |
| `selector` | required | The selector (`s=`). The public key is published at `<selector>._domainkey.<domain>`. |
| `privateKey` | required | A `CryptoKey` that can sign (RSASSA-PKCS1-v1_5 with SHA-256, or Ed25519), a PEM `PRIVATE KEY` (PKCS #8) or `RSA PRIVATE KEY` (PKCS #1), or a JWK. The key type sets `a=`. A PEM string is imported on every call, so to sign many messages, import it once with `WebCrypto.importPem` from [@portable/web-crypto](https://portablejs.com/packages/web-crypto). |
| `headers` | mailauth's list, below | The fields to sign, case-insensitive. Every field of a listed name is signed. List a name more times than the message has it to over-sign it, so that adding one later breaks the signature (RFC 6376 section 8.15). |
| `canonicalization` | `'relaxed/relaxed'` | `'relaxed/relaxed'`, `'relaxed/simple'`, `'simple/relaxed'`, or `'simple/simple'`. |
| `identity` | none | The agent or user identifier (`i=`), such as `user@mail.example.com` or `@example.com`. Its domain must be `domain` or a subdomain. |
| `now` | `new Date()` | The signature time (`t=`), as a `Date` or a `Temporal.Instant`. |
| `expiresAt` | none | The expiry (`x=`), a `Date` or a `Temporal.Instant`. It must be at least one second after `now`. |
| `hasher` | WebCrypto | Creates the body hash. See [Crypto](#crypto). |
| `signal` | none | Stops reading the message, and `sign` rejects with `signal.reason`. |

The default `headers` are From, Sender, Reply-To, Subject, Date, Message-ID, To, Cc, MIME-Version, Content-Type, Content-Transfer-Encoding, Content-ID, Content-Description, Resent-Date, Resent-From, Resent-Sender, Resent-To, Resent-Cc, Resent-Message-ID, In-Reply-To, References, List-Id, List-Help, List-Unsubscribe, List-Subscribe, List-Post, List-Owner, List-Archive, and BIMI-Selector. Each name appears once, so nothing is over-signed.

`sign` throws a `TypeError` or `RangeError` for an invalid option, such as a domain that isn't a host name, an RSA key under 1024 bits, or `headers` without `From`. It throws `Dkim.InvalidInputError` for a message without a From field.

## Verifying

`verify` resolves to one result per DKIM-Signature field, in header order, or an empty array if there are none.

| Option | Default | Description |
| --- | --- | --- |
| `resolver` | required | Looks up the keys. `Dns.create()` from [@portable/dns](https://portablejs.com/packages/dns), `node:dns/promises`, or any object with `resolveTxt`. |
| `now` | `new Date()` | The time to check `x=` against, as a `Date` or a `Temporal.Instant`. |
| `minKeyBits` | `1024` | RSA keys shorter than this give `policy` (RFC 8301 section 3.2). |
| `hasher` | WebCrypto | Creates the body hash. See [Crypto](#crypto). |
| `signal` | none | Stops reading the message and the key lookups, and `verify` rejects with `signal.reason`. |

`verify` treats a resolver rejection with `code` `ENOTFOUND`, `ENODATA`, or `EBADNAME` as no key, and any other rejection as `temperror`. It rejects only for invalid options, a failing message stream, or an aborted `signal`.

`verify` and `sign` hold the whole header section in memory with no size limit, so limit untrusted input first, e.g. with `Streams.limitBytes`.

| Field | Description |
| --- | --- |
| `result` | The RFC 8601 result, described below. |
| `domain` | The signing domain (`d=`) as a lower-case A-label, for `header.d`. Empty when the tag is missing. |
| `selector` | The selector (`s=`) in lower-case A-label form, for `header.s`. |
| `algorithm` | `a=` in lower case, such as `rsa-sha256`. |
| `identity` | The decoded `i=` with an A-label domain, or `@` and the domain when there's no `i=`. For `header.i`. |
| `signature` | `b=` without whitespace, for `header.b` (RFC 6008). |
| `reason` | Why the result is not `pass`, such as `body hash did not verify` or `no key`. |
| `cause` | The resolver's error behind a `temperror`. |
| `testing` | The key has `t=y`, so treat a pass as unsigned mail. |
| `bodyLength` | The `l=` value, when there is one. |
| `unsignedBodyBytes` | With `l=`, the number of canonicalized body bytes after the signed part, which anyone could have added. |

| Result | When |
| --- | --- |
| `pass` | The body hash and the signature verify. |
| `fail` | The body hash or the signature doesn't verify. |
| `policy` | rsa-sha1, or an RSA key shorter than `minKeyBits`. |
| `neutral` | The signature can't be processed: a syntax error; a missing tag; an unknown version, algorithm, or canonicalization; an `i=` outside `d=`; a `From` field that isn't signed; an `l=` longer than the body; or an expired signature. |
| `permerror` | The key record: no key, a key that is revoked or invalid, a syntax error, an unknown key version or type, a key not for email, or a key that doesn't allow the signature's algorithm or `i=`. |
| `temperror` | The key lookup failed. |

## Crypto

Signing and verification use WebCrypto (`crypto.subtle`), with no crypto dependencies.

`crypto.subtle.digest` can't hash incrementally, so by default the canonicalized body is held in memory and hashed at once. To verify in constant memory, pass `hasher`, a function that takes the hash name (`'SHA-256'`) and returns an incremental hash with `update(bytes)` and `digest()`, such as `sha256.create()` from @noble/hashes:

```ts
import { sha256 } from '@noble/hashes/sha2.js';

await Dkim.verify(request.body!, { resolver, hasher: () => sha256.create() });
```

## Types

| Type | Description |
| --- | --- |
| `Dkim.Result` | One element of what `verify` resolves to, with the fields above. |
| `Dkim.Result.Code` | `'pass' \| 'fail' \| 'policy' \| 'neutral' \| 'temperror' \| 'permerror'`. |
| `Dkim.Message` | What `sign` and `verify` read: a `ReadableStream<Uint8Array>`, a `Uint8Array`, or a UTF-8 string. |
| `Dkim.Resolver` | `Pick<Dns.Resolver, 'resolveTxt'>`, the lookup `verify` needs. |
| `Dkim.Hasher` | An incremental hash with `update(data)` and `digest()`. The `hasher` option is a function `(hash: Dkim.Hash) => Dkim.Hasher`. Re-exported from [@portable/web-crypto](https://portablejs.com/packages/web-crypto). |
| `Dkim.Hash` | A hash name such as `'SHA-256'`, passed to `hasher`. Re-exported from [@portable/web-crypto](https://portablejs.com/packages/web-crypto). |

## Why use this over mailauth and nodemailer

- It runs anywhere. mailauth and nodemailer use `node:crypto`, `node:stream`, and Buffers, so they don't run in Workers or browsers.
- It follows the RFCs by default. mailauth accepts signatures that RFC 6376 rejects (e.g. a missing `v=`, a duplicate tag, or rsa-sha1) unless you pass `strict: true`. Its strict mode accepts `sign`'s signatures, and `verify` accepts signatures from mailauth and nodemailer. The two verifiers agree on 12 kinds of changed message.
- `sign` throws for a bad domain or an unusable key. nodemailer strips tag delimiters from the domain and sends the message unsigned when the key is unusable.
- mailauth pulls in libmime, punycode.js, tldts, joi, and more.
- In Node, it verifies a 250 KB message about three times as fast as mailauth and signs about as fast as nodemailer.

<!-- bench:start -->
<table>
<thead><tr><th align="left">Library</th><th align="right">Ops/s</th><th align="left">Relative</th><th></th></tr></thead>
<tbody>
<tr><th colspan="4" align="left">Sign a 250 KB message</th></tr>
<tr><td><code>node:crypto</code>, hash and sign only</td><td align="right">1,680</td><td>5.9× faster</td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="160" height="12" alt="" /></td></tr>
<tr><td>nodemailer</td><td align="right">328</td><td>1.1× faster</td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="31" height="12" alt="" /></td></tr>
<tr><td>@portable/dkim</td><td align="right">287</td><td></td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="27" height="12" alt="" /></td></tr>
<tr><td>mailauth</td><td align="right">133</td><td>2.2× slower</td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="13" height="12" alt="" /></td></tr>
<tr><th colspan="4" align="left">Verify a 250 KB message</th></tr>
<tr><td>@portable/dkim</td><td align="right">403</td><td></td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="160" height="12" alt="" /></td></tr>
<tr><td>mailauth</td><td align="right">133</td><td>3.0× slower</td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="53" height="12" alt="" /></td></tr>
<tr><th colspan="4" align="left">Sign and verify a short message</th></tr>
<tr><td>mailauth</td><td align="right">550</td><td>1.1× faster</td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="160" height="12" alt="" /></td></tr>
<tr><td>@portable/dkim</td><td align="right">501</td><td></td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="146" height="12" alt="" /></td></tr>
</tbody>
</table>

Operations per second from `pnpm bench`, higher is better, in Node 24.22.0, on Intel(R) Xeon(R) Processor @ 2.10GHz (4 cores). Each benchmark lists only the libraries that can do the same work, fastest first. The relative speed compares each library with @portable/dkim, and the bars are scaled to the fastest library.

| Library | Version | Minified and gzipped | Runtime dependencies | Node built-ins | TypeScript types |
| --- | --- | ---: | ---: | --- | --- |
| @portable/dkim | – | 19 kB | 10 | none | included |
| mailauth | 7.3.0 | 449 kB | 38 | `buffer`, `crypto`, `dns`, `https`, `net`, `stream`, `string_decoder` | included |
| nodemailer | 10.2.1 | 4.4 kB | 0 | `Buffer`, `crypto`, `fs`, `path`, `stream` | none |
| `node:crypto`, hash, and sign only | – | built in | – | Node only | – |

Sizes cover the imports in the usage example, or the equivalent imports of each library, bundled for the browser by `scripts/bundle-size.ts`. Runtime dependencies count every package installed with the published package. A library that uses Node built-ins needs polyfills in a browser and the `nodejs_compat` flag in Cloudflare Workers.
<!-- bench:end -->

Differences to check when you switch:

- `resolver` is an object with `resolveTxt`, such as `node:dns/promises`. mailauth's is a `(name, type)` function.
- Key record problems are `permerror`. mailauth reports them as `neutral`.
- There's no `status.aligned` or `headerFrom`, because alignment is part of DMARC ([@portable/dmarc](https://portablejs.com/packages/dmarc)). There's no `info` or `mimeStructureStart` either.
- `sign` takes one key. To sign with several (mailauth's `dkimSign`, nodemailer's `keys`), call it once per key and prepend each field.
- `sign` throws instead of reporting `errors` and `warnings` like mailauth's `dkimSign`.
- There's no `maxBodyLength`, because `l=` lets anyone append to the body.
- There's no `skipFields`, so leave the names out of `headers`.
- There's no `hashAlgo`. DKIM uses SHA-256 (RFC 8301).
- There's no `cacheDir` or `cacheTreshold`. `sign` writes nothing to disk and keeps the canonicalized body in memory unless you pass an incremental `hasher`.
