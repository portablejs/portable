# @portable/arc

Validates and adds Authenticated Received Chain (ARC) sets (RFC 8617), with RSA and Ed25519 keys (RFC 8463). Runs in browsers, Cloudflare Workers, Deno, Bun and Node 24+.

Replaces the ARC parts of [mailauth](https://www.npmjs.com/package/mailauth).

```sh
npm install @portable/arc @portable/dns
```

A forwarder, such as a mailing list, validates the chain that arrived and seals the message with the result before it changes the message:

```ts
import * as Arc from '@portable/arc'
import * as Dns from '@portable/dns'

const resolver = Dns.createResolver()
const arc = await Arc.verify(message, { resolver, signal: AbortSignal.timeout(10_000) })

const fields = await Arc.seal(message, {
  domain: 'lists.example.org',
  selector: 'arc',
  privateKey: env.ARC_PRIVATE_KEY,
  authResults: `lists.example.org; arc=${arc.result}; spf=pass smtp.mailfrom=example.com`,
  chainValidation: arc.result,
})
const forwarded = fields + message
```

A message is a `ReadableStream<Uint8Array>`, a `Uint8Array` or a string, which is encoded as UTF-8. Bare LF line ends are read as CRLF. A stream can be read once, so read it into a `Uint8Array` first when you both verify and seal it. `@portable/mailauth` does both, together with SPF, DKIM and DMARC, in one call.

## Verifying

`verify` follows RFC 8617 section 5.2: it checks the structure of every ARC set, the newest ARC-Message-Signature and every ARC-Seal from the newest to the oldest. It resolves to:

| Field | Description |
| --- | --- |
| `result` | `'pass'`, `'fail'` or `'none'` (no ARC fields). It is the `arc=` result of Authentication-Results and the `cv=` value for the next seal. |
| `instance` | The highest instance on the message's ARC fields, 0 when there are none. |
| `reason` | Why the result is `fail`, such as `i=1 ams body hash did not verify` or `i=2 as no key`. |
| `sets` | On `pass`, each set from `i=1` to the newest, with the sealer's `domain` and `selector` and its `authResults`, the ARC-Authentication-Results text after `i=`. Empty otherwise. |

A receiver uses `sets` to decide whether to trust what an intermediary recorded. ARC proves who sealed each set, not that the sealer told the truth, so only read `authResults` of a sealer you trust:

```ts
const google = arc.result === 'pass' && arc.sets.find((set) => set.domain === 'google.com')
if (google && /\bdmarc=pass\b/.test(google.authResults)) deliver()
```

| Option | Default | Description |
| --- | --- | --- |
| `resolver` | required | Looks up the keys: `Dns.createResolver()`, `node:dns/promises`, or any object with `resolveTxt`. |
| `now` | `new Date()` | The time to check the ARC-Message-Signature's `x=` against. |
| `minKeyBits` | `1024` | RSA keys shorter than this fail the chain (RFC 8301). |
| `hash` | WebCrypto | Creates the body hash. See [Crypto in @portable/dkim](../dkim/README.md#crypto). |
| `signal` | none | Stops reading the message and the key lookups. The promise rejects with `signal.reason`. |

The promise rejects only for invalid options, a failing message stream or an aborted `signal`. A DNS failure fails the chain, as every ARC failure is permanent (RFC 8617 section 5.2).

## Sealing

`seal` resolves to the three fields of the new set, ARC-Seal, ARC-Message-Signature and ARC-Authentication-Results, each ending in CRLF, to put above the message's other fields. The instance is one more than the highest on the message. The ARC-Message-Signature always uses relaxed/relaxed canonicalization, and lines are folded at 76 characters.

| Option | Default | Description |
| --- | --- | --- |
| `domain` | required | The sealing domain (`d=`). A U-label domain is written as its A-label. |
| `selector` | required | The selector (`s=`). The public key is published at `<selector>._domainkey.<domain>`. |
| `privateKey` | required | A `CryptoKey`, a PEM `PRIVATE KEY` or `RSA PRIVATE KEY`, or a JWK, as `Dkim.sign` takes it. The key type sets `a=`. Passing an imported `CryptoKey` saves about 1 ms per call in Node. |
| `authResults` | required | The ARC-Authentication-Results payload: this server's authserv-id and its results, such as `mx.example.com; spf=pass smtp.mailfrom=example.org`. It may be folded with CRLF and whitespace. |
| `chainValidation` | `'none'` for a message without ARC fields | The `cv=` value: the `result` of `Arc.verify` for this message. Required when the message has ARC fields. |
| `headers` | DKIM-Signature, Delivered-To and the `Dkim.sign` defaults | The fields the ARC-Message-Signature signs. ARC fields and Authentication-Results are left out (RFC 8617 section 4.1.2). |
| `signedAt` | `new Date()` | The time (`t=`) of both signatures. |
| `hash` | WebCrypto | Creates the body hash. |
| `signal` | none | Stops reading the message. |

With `cv=fail` the seal covers only the new set (RFC 8617 section 5.1.2), so a broken chain is sealed as failed and stays failed. A message whose ARC fields are all malformed gets `i=1` with `cv=fail`.

`seal` throws a `TypeError` or `RangeError` for invalid options, such as an `authResults` with a line break that is not folding or a `chainValidation` that doesn't fit the message (`pass` or `fail` on a message without ARC fields, `none` on one with them, `pass` on one whose ARC fields are all malformed). It throws `Arc.InvalidInputError` for a message it must not seal: one without a From field, one whose newest ARC-Seal says `cv=fail`, one that already has 50 sets, or a `cv=pass` seal over sets that can't be read.

## Why use this over mailauth

- It runs anywhere. mailauth uses `node:crypto`, `node:stream` and Buffers, so it doesn't run in Workers or a browser.
- It follows RFC 8617 by default. mailauth's default mode accepts ARC-Seal syntax errors, instances such as `i=0x1`, and an ARC-Message-Signature without `c=` signed relaxed/relaxed, as the ARC drafts did. RFC behavior needs `strict: true`. Here it is the only behavior, and it gives mailauth's strict result on every message of ValiMail's ARC test suite and on chains it seals, changed in 11 ways.
- Sealing is explicit. `chainValidation` is required once a chain exists, and options that would produce a set no validator accepts, such as an instance with a gap, throw instead of producing that set with a warning.
- It verifies faster. In one run in Node, it verified a 250 KB message with two ARC sets 372 times a second, against 251 for mailauth's strict mode, and sealed it 229 times a second, against 207.
- It has no dependencies outside `@portable/*`.

<!-- bench:start -->
| | @portable/arc | mailauth | `node:crypto`, hashing and signing only |
| --- | ---: | ---: | ---: |
| Verify a 250 KB message with two ARC sets | 411 | 252 | – |
| Seal a 250 KB message | 223 | 191 | 988 |
| Seal and verify a short message | 272 | 288 | – |

Operations per second from `pnpm bench`, higher is better, in Node 24.22.0, on Intel(R) Xeon(R) Processor @ 2.10GHz (4 cores). A dash means the library has no equivalent.

| | @portable/arc | mailauth | `node:crypto`, hashing and signing only |
| --- | --- | --- | --- |
| Minified and gzipped | 19 kB | 448 kB | built in |
| Runtime dependencies | 6 | 38 | – |
| Node built-ins used | none | `buffer`, `crypto`, `dns`, `https`, `net`, `stream`, `string_decoder` | Node only |
| TypeScript types | included | included | – |
| Version compared | – | 7.3.0 | – |

Sizes cover the imports in the usage example, or the equivalent imports of each library, bundled for the browser by `scripts/bundle-size.ts`. Runtime dependencies count every package installed with the published package. A library that uses Node built-ins needs polyfills in a browser and the `nodejs_compat` flag in Cloudflare Workers.
<!-- bench:end -->

## Migrating from mailauth

| mailauth | @portable/arc |
| --- | --- |
| `const { arc } = await authenticate(message, { resolver })` | `const arc = await Arc.verify(message, { resolver })`, or `Mailauth.authenticate` from `@portable/mailauth` |
| `arc.status.result` | `arc.result` |
| `arc.status.comment` | `arc.reason`, for failures. The pass comment (`i=1 spf=pass dkim=pass`) is built by `@portable/mailauth`. |
| `arc.i` | `arc.instance` |
| `arc.authenticationResults` (parsed) | `arc.sets.at(-1).authResults` (text) |
| `arc.signature` | Not returned. A failing ARC-Message-Signature is in `arc.reason`. |
| `arc.status.shouldSeal` | `true` unless the newest seal says `cv=fail`; `seal` throws `Arc.InvalidInputError` in that case. |
| `strict: true` | The only behavior. |
| `minBitLength` | `minKeyBits` |
| `sealMessage(message, { signingDomain, selector, privateKey, authResults, cv })` | `Arc.seal(message, { domain, selector, privateKey, authResults, chainValidation })`. It resolves to a string, not a Buffer. |
| `createSeal(message, { seal })` and its `{ headers, errors, warnings }` | `Arc.seal`, which resolves to the fields and throws on errors. |
| `seal.i` | Not supported. The instance always follows the highest on the message. |
| `seal.algorithm` | Follows the key type. |
| `seal.headerList` | `headers`, an array. |
| `seal.signTime` | `signedAt` |
| `seal.bodyHash`, `seal.headers` (sealing without the message) | Not supported. Pass the message. |
| `cv: 'PASS'` | Lower case only: `'none'`, `'pass'` or `'fail'`, as `Arc.verify` returns them. |
