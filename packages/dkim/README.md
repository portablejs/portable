# @portable/dkim

Signs and verifies DKIM signatures (RFC 6376), with RSA and Ed25519 keys (RFC 8463) and the algorithm rules of RFC 8301. Runs in browsers, Cloudflare Workers, Deno, Bun and Node 24+.

Replaces the DKIM parts of [mailauth](https://www.npmjs.com/package/mailauth) and the DKIM signer of [nodemailer](https://www.npmjs.com/package/nodemailer).

```sh
npm install @portable/dkim @portable/dns
```

```ts
import * as Dns from '@portable/dns'
import * as Dkim from '@portable/dkim'

const field = await Dkim.sign(message, {
  domain: 'example.com',
  selector: 'mail',
  privateKey: env.DKIM_PRIVATE_KEY,
})
const signed = field + message

const results = await Dkim.verify(signed, {
  resolver: Dns.createResolver(),
  signal: AbortSignal.timeout(10_000),
})
for (const r of results) console.log(`dkim=${r.result} header.d=${r.domain} header.s=${r.selector}`)
```

A message is a `ReadableStream<Uint8Array>`, a `Uint8Array` or a string, which is encoded as UTF-8. Bare LF line ends are read as CRLF, so a message stored with LF line ends signs and verifies the same as one with CRLF.

In Node, `node:dns/promises` works as the resolver and uses the system's DNS servers:

```ts
import dns from 'node:dns/promises'

await Dkim.verify(message, { resolver: dns })
```

## Signing

`sign` resolves to the DKIM-Signature field, ending in CRLF, to put above the message's other fields. It always writes `t=` and never `l=`, and folds lines at 76 characters.

| Option | Default | Description |
| --- | --- | --- |
| `domain` | required | The signing domain (`d=`). A U-label domain is written as its A-label. |
| `selector` | required | The selector (`s=`). The public key is published at `<selector>._domainkey.<domain>`. |
| `privateKey` | required | A `CryptoKey` that can sign (RSASSA-PKCS1-v1_5 with SHA-256, or Ed25519), a PEM `PRIVATE KEY` (PKCS #8) or `RSA PRIVATE KEY` (PKCS #1), or a JWK. The key type sets `a=` to `rsa-sha256` or `ed25519-sha256`. |
| `headers` | mailauth's list, from `From` to `BIMI-Selector` | The fields to sign, matched without regard to case. Every field of a listed name is signed. A name listed n times appears in `h=` at least n times, so listing a name more often than the message has it over-signs it, and a field of that name added later breaks the signature (RFC 6376 section 8.15). |
| `canonicalization` | `'relaxed/relaxed'` | `'relaxed/relaxed'`, `'relaxed/simple'`, `'simple/relaxed'` or `'simple/simple'`. |
| `identity` | none | The agent or user identifier (`i=`), such as `user@mail.example.com` or `@example.com`. Its domain must be `domain` or a subdomain. It is written as dkim-quoted-printable. |
| `signedAt` | `new Date()` | The signature time (`t=`). |
| `expiresAt` | none | The expiry (`x=`), at least a second after `signedAt`. |
| `hash` | WebCrypto | Creates the body hash. See [Crypto](#crypto). |

`sign` throws a `TypeError` or `RangeError` for an invalid option, such as a domain that isn't a host name, an RSA key under 1024 bits or a header list without `From`. It throws `Dkim.InvalidInputError` for a message without a From field.

## Verifying

`verify` resolves to one result per DKIM-Signature field, in header order. A message without signatures gives an empty array. Keys are looked up while the body is read, each key once, and the body is read once whatever the number of signatures.

| Option | Default | Description |
| --- | --- | --- |
| `resolver` | required | Looks up the keys. `Dns.createResolver()` from `@portable/dns`, `node:dns/promises`, or any object with `resolveTxt`. |
| `now` | `new Date()` | The time to check `x=` against. |
| `minKeyBits` | `1024` | RSA keys shorter than this give `policy` (RFC 8301 section 3.2). |
| `hash` | WebCrypto | Creates the body hash. See [Crypto](#crypto). |
| `signal` | none | Stops reading the message and the key lookups, and `verify` rejects with `signal.reason`. |

There is no default resolver, so you decide which servers see the lookups. A resolver rejection with `code` `ENOTFOUND`, `ENODATA` or `EBADNAME` means there is no key, and any other rejection is `temperror`.

`verify` rejects only for invalid options, a message stream that fails, and an aborted `signal`.

| Field | Description |
| --- | --- |
| `result` | The RFC 8601 result, described below. |
| `domain` | The signing domain (`d=`) in lower-case A-label form, for `header.d`. |
| `selector` | The selector (`s=`) in lower-case A-label form, for `header.s`. |
| `algorithm` | `a=` in lower case, such as `rsa-sha256`. |
| `identity` | The `i=` value decoded, with its domain as an A-label, or `@` and the domain when there is no `i=`. For `header.i`. |
| `signature` | `b=` without whitespace, for `header.b` (RFC 6008). |
| `reason` | Why the result is not `pass`, such as `body hash did not verify` or `no key`. |
| `testing` | The key has `t=y`: the domain is testing DKIM, and a pass should count as unsigned mail. |
| `bodyLength` | The `l=` value, when there is one. |
| `unsignedBodyBytes` | With `l=`, how many canonicalized body bytes follow the signed part. Anyone could have added them. |

| Result | When |
| --- | --- |
| `pass` | The body hash and the signature verify. |
| `fail` | The body hash or the signature doesn't verify. |
| `policy` | rsa-sha1, or an RSA key shorter than `minKeyBits`. |
| `neutral` | The signature can't be processed: a syntax error, a missing tag, an unknown version, algorithm or canonicalization, an `i=` outside `d=`, a `From` field that isn't signed, an `l=` longer than the body, or an expired signature. |
| `permerror` | The key record: no key, a revoked or invalid key, a syntax error, an unknown version or key type, a key not for email, or a key that doesn't allow the signature's algorithm or `i=`. |
| `temperror` | The key lookup failed. |

## Crypto

RSA and Ed25519 signing and verification use WebCrypto (`crypto.subtle`), which every supported runtime has. There are no crypto dependencies.

The body hash is different. `crypto.subtle.digest` can't hash incrementally, so by default the canonicalized body is collected and hashed with one call. Mail is bounded by MTA size limits, usually 25 to 50 MB, so this stays within what a mail server already holds. A signer has to buffer the message anyway, because the DKIM-Signature field goes before the body and contains the body hash, so only verification would gain from streaming. If WebCrypto adds streaming digests, the default can switch to one without an API change.

To verify in constant memory, pass an incremental SHA-256 as `hash`, a function that returns `{ update(bytes), digest() }`. That is the shape of `sha256.create()` in `@noble/hashes`:

```ts
import { sha256 } from '@noble/hashes/sha2.js'

await Dkim.verify(request.body!, { resolver, hash: () => sha256.create() })
```

## Why use this over mailauth and nodemailer

- It runs anywhere. mailauth and nodemailer use `node:crypto`, `node:stream` and Buffers, so they don't run in Workers or a browser.
- It follows the RFCs by default. mailauth's default mode accepts signatures that RFC 6376 rejects, such as a missing `v=`, a duplicate tag or rsa-sha1, and RFC behavior needs `strict: true`. Its signatures pass in mailauth's strict mode, mailauth's and nodemailer's pass here, and the two verifiers agree on 12 kinds of changed message.
- It refuses what it can't sign safely. nodemailer silently removes tag delimiters from the domain and sends the message unsigned when the key is unusable. `sign` throws for both.
- It has no dependencies outside `@portable/*`. mailauth pulls in libmime, punycode.js, tldts, joi and more.
- It verifies faster. In one run in Node, it verified a 250 KB message 170 times a second, against 35 for mailauth's strict mode, and signed it 56 times a second, against 54 for mailauth and 62 for nodemailer.

## Migrating from mailauth

| mailauth | @portable/dkim |
| --- | --- |
| `dkimVerify(message, { resolver })` | `Dkim.verify(message, { resolver })` |
| `resolver: dns.promises.resolve` (the default) | `resolver: dns` from `node:dns/promises`. A resolver is an object with `resolveTxt`, not one `(name, type)` function. |
| `curTime` | `now` |
| `minBitLength` | `minKeyBits` |
| `strict: true`, `rejectRsaSha1: true` | The only behavior. |
| `result.results` | The array itself. |
| `result.status.result` | `result.result`. Key record problems are `permerror`, where mailauth gives `neutral`. |
| `result.status.comment` | `result.reason` |
| `result.signingDomain`, `result.selector`, `result.algo` | `result.domain`, `result.selector`, `result.algorithm` |
| `result.status.testing` | `result.testing` |
| `result.canonBodyLengthLimit`, `result.status.underSized` | `result.bodyLength`, `result.unsignedBodyBytes` |
| `result.status.aligned`, `result.headerFrom` | Not computed. Alignment is DMARC's job (`@portable/dmarc`). |
| `result.info`, `result.mimeStructureStart` | Not built. |
| `dkimSign(message, { signatureData: [{ signingDomain, selector, privateKey }] })` | `Dkim.sign(message, { domain, selector, privateKey })`, once per signature. |
| `signTime`, `expires` | `signedAt`, `expiresAt` |
| `headerList` | `headers`, an array |
| `algorithm` | Follows the key type. |
| `maxBodyLength` | Not supported. `l=` lets anyone append to the body. |
| `signatures`, `errors`, `warnings` | `sign` resolves to the field and throws on errors. |

## Migrating from nodemailer

| nodemailer | @portable/dkim |
| --- | --- |
| `dkim: { domainName, keySelector, privateKey }` | `Dkim.sign(message, { domain: domainName, selector: keySelector, privateKey })`, then prepend the field. |
| `headerFieldNames: 'from:to:subject'` | `headers: ['From', 'To', 'Subject']` |
| `skipFields` | Leave the names out of `headers`. |
| `hashAlgo` | Not supported. DKIM uses SHA-256 (RFC 8301). |
| `cacheDir`, `cacheTreshold` | Not needed. The body is hashed as it streams, and the caller keeps the message. |
| `keys: [...]` | Call `sign` once per key and prepend each field. |
