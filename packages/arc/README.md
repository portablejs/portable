# @portable/arc

Validates and adds Authenticated Received Chain (ARC) sets (RFC 8617), with RSA and Ed25519 keys (RFC 8463). Runs in browsers, Cloudflare Workers, Node 24+, Bun, and Deno.

Replaces the ARC parts of [mailauth](https://www.npmjs.com/package/mailauth).

```sh
npm install @portable/arc @portable/dns
```

If you forward mail, as a mailing list does, verify the chain that arrived and seal the message with the result before you change it:

```ts
import * as Arc from '@portable/arc';
import * as Dns from '@portable/dns';

const resolver = Dns.create();
const arc = await Arc.verify(message, { resolver, signal: AbortSignal.timeout(10_000) });

const fields = await Arc.seal(message, {
  domain: 'lists.example.org',
  selector: 'arc',
  privateKey: env.ARC_PRIVATE_KEY,
  authResults: `lists.example.org; arc=${arc.result}; spf=pass smtp.mailfrom=example.com`,
  chainValidation: arc.result,
});
const forwarded = fields + message;
```

A message is a `ReadableStream<Uint8Array>`, a `Uint8Array`, or a string, which is encoded as UTF-8. Bare LF line ends are read as CRLF. A stream can be read once, so read it into a `Uint8Array` first when you both verify and seal it. [@portable/mail-auth](https://portablejs.com/packages/mail-auth) does both, together with SPF, DKIM, and DMARC, in one call.

## Verifying

`verify` follows RFC 8617 section 5.2: it checks the structure of every ARC set, the newest ARC-Message-Signature, and every ARC-Seal from the newest to the oldest. It resolves to:

| Field | Description |
| --- | --- |
| `result` | `'pass'`, `'fail'`, or `'none'` (no ARC fields). It is the `arc=` result of Authentication-Results and the `cv=` value for the next seal. |
| `instance` | The highest instance on the message's ARC fields, 0 when there are none. |
| `reason` | Why the result is `fail`, such as `i=1 ams body hash did not verify` or `i=2 as no key`. |
| `cause` | The resolver's error when a key lookup failed. |
| `sets` | On `pass`, each set from `i=1` to the newest, with the sealer's `domain` and `selector` and its `authResults`, the ARC-Authentication-Results text after `i=`. Empty otherwise. |

Use `sets` to decide whether to trust what an intermediary recorded. ARC proves who sealed each set, not that the sealer told the truth, so only read `authResults` of a sealer you trust:

```ts
const google = arc.result === 'pass' && arc.sets.find((set) => set.domain === 'google.com');
if (google && /\bdmarc=pass\b/.test(google.authResults)) {
  deliver();
}
```

| Option | Default | Description |
| --- | --- | --- |
| `resolver` | required | Looks up the keys: `Dns.create()`, `node:dns/promises`, or any object with `resolveTxt`. |
| `now` | `new Date()` | The time to check the ARC-Message-Signature's `x=` against, as a `Date` or a `Temporal.Instant`. |
| `minKeyBits` | `1024` | RSA keys shorter than this fail the chain (RFC 8301). |
| `hasher` | WebCrypto | Creates the body hash. See [Crypto in @portable/dkim](https://portablejs.com/packages/dkim#crypto). |
| `signal` | none | Stops reading the message and the key lookups. The promise rejects with `signal.reason`. |

The promise rejects only for invalid options, a failing message stream or an aborted `signal`. A DNS failure fails the chain, because every ARC failure is permanent (RFC 8617 section 5.2).

## Sealing

`seal` resolves to the three fields of the new set, ARC-Seal, ARC-Message-Signature, and ARC-Authentication-Results, each ending in CRLF, to put above the message's other fields. The instance is one more than the highest on the message. The ARC-Message-Signature always uses relaxed/relaxed canonicalization, and lines are folded at 76 characters.

| Option | Default | Description |
| --- | --- | --- |
| `domain` | required | The sealing domain (`d=`). A U-label domain is written as its A-label. |
| `selector` | required | The selector (`s=`). The public key is published at `<selector>._domainkey.<domain>`. |
| `privateKey` | required | A `CryptoKey`, a JWK, or a PEM `PRIVATE KEY` or `RSA PRIVATE KEY`, as `Dkim.sign` takes it. The key type sets `a=`. Passing an imported `CryptoKey` saves about 1 ms per call in Node. |
| `authResults` | required | The ARC-Authentication-Results payload: this server's authserv-id and its results, such as `mx.example.com; spf=pass smtp.mailfrom=example.org`. It may be folded with CRLF and whitespace. |
| `chainValidation` | `'none'` for a message without ARC fields | The `cv=` value: the `result` of `Arc.verify` for this message. Required when the message has ARC fields. |
| `headers` | DKIM-Signature, Delivered-To, and the `Dkim.sign` defaults | The fields the ARC-Message-Signature signs. ARC fields and Authentication-Results are left out (RFC 8617 section 4.1.2). |
| `now` | `new Date()` | The time (`t=`) of both signatures, as a `Date` or a `Temporal.Instant`. |
| `hasher` | WebCrypto | Creates the body hash. |
| `signal` | none | Stops reading the message. |

With `cv=fail` the seal covers only the new set (RFC 8617 section 5.1.2), so a broken chain is sealed as failed and stays failed. A message whose ARC fields are all malformed is sealed with `i=1` and `cv=fail`.

`seal` throws a `TypeError` or `RangeError` for invalid options, such as an `authResults` with a line break that is not folding or a `chainValidation` that doesn't match the message (`pass` or `fail` on a message without ARC fields, `none` on one with them, `pass` on one whose ARC fields are all malformed). It throws `Arc.InvalidInputError` for a message it must not seal: one without a From field, one whose newest ARC-Seal has `cv=fail`, one that already has 50 sets, or a `cv=pass` seal over sets that can't be read.

## Types

| Type | Description |
| --- | --- |
| `Arc.Resolver` | `Dkim.Resolver`, the `resolveTxt` lookup `verify` needs. |
| `Arc.Result` | What `verify` resolves to: `result`, `instance`, `reason`, `cause`, and `sets`, as above. |
| `Arc.Hasher` | An incremental hash with `update(data)` and `digest()`. The `hasher` option is a function `(hash: Arc.Hash) => Arc.Hasher`. Re-exported from [@portable/dkim](https://portablejs.com/packages/dkim). |
| `Arc.Hash` | A hash name such as `'SHA-256'`, passed to `hasher`. Re-exported from [@portable/dkim](https://portablejs.com/packages/dkim). |

## Why use this over mailauth

- It runs anywhere. mailauth uses `node:crypto`, `node:stream`, and Buffers, so it doesn't run in Workers or a browser.
- It follows RFC 8617 by default. mailauth's default mode accepts ARC-Seal syntax errors, instances such as `i=0x1`, and an ARC-Message-Signature without `c=` signed relaxed/relaxed, as the ARC drafts did. mailauth follows the RFC only with `strict: true`. This package always follows the RFC, and it gives mailauth's strict result on every message of ValiMail's ARC test suite and on 11 altered copies of chains it seals.
- Sealing is explicit. `seal` requires `chainValidation` once a chain exists, and it throws for options that would produce a set no validator accepts, such as an instance with a gap, instead of producing that set with a warning.
- It verifies faster. In Node it verifies a 250 KB message with two ARC sets about one and a half times as fast as mailauth, and seals it a little faster, as the table below shows.
- It has no dependencies outside `@portable/*`.

<!-- bench:start -->
<table>
<thead><tr><th align="left">Library</th><th align="right">Ops/s</th><th align="left">Relative</th><th></th></tr></thead>
<tbody>
<tr><th colspan="4" align="left">Verify a 250 KB message with two ARC sets</th></tr>
<tr><td>@portable/arc</td><td align="right">411</td><td></td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="160" height="12" alt="" /></td></tr>
<tr><td>mailauth</td><td align="right">252</td><td>1.6× slower</td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="98" height="12" alt="" /></td></tr>
<tr><th colspan="4" align="left">Seal a 250 KB message</th></tr>
<tr><td><code>node:crypto</code>, hashing and signing only</td><td align="right">988</td><td>4.4× faster</td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="160" height="12" alt="" /></td></tr>
<tr><td>@portable/arc</td><td align="right">223</td><td></td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="36" height="12" alt="" /></td></tr>
<tr><td>mailauth</td><td align="right">191</td><td>1.2× slower</td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="31" height="12" alt="" /></td></tr>
<tr><th colspan="4" align="left">Seal and verify a short message</th></tr>
<tr><td>mailauth</td><td align="right">288</td><td>1.1× faster</td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="160" height="12" alt="" /></td></tr>
<tr><td>@portable/arc</td><td align="right">272</td><td></td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="151" height="12" alt="" /></td></tr>
</tbody>
</table>

Operations per second from `pnpm bench`, higher is better, in Node 24.22.0, on Intel(R) Xeon(R) Processor @ 2.10GHz (4 cores). Each benchmark lists only the libraries that can do the same work, fastest first. The relative speed compares each library with @portable/arc, and the bars are scaled to the fastest library.

| Library | Version | Minified and gzipped | Runtime dependencies | Node built-ins | TypeScript types |
| --- | --- | ---: | ---: | --- | --- |
| @portable/arc | – | 20 kB | 11 | none | included |
| mailauth | 7.3.0 | 449 kB | 38 | `buffer`, `crypto`, `dns`, `https`, `net`, `stream`, `string_decoder` | included |
| `node:crypto`, hashing, and signing only | – | built in | – | Node only | – |

Sizes cover the imports in the usage example, or the equivalent imports of each library, bundled for the browser by `scripts/bundle-size.ts`. Runtime dependencies count every package installed with the published package. A library that uses Node built-ins needs polyfills in a browser and the `nodejs_compat` flag in Cloudflare Workers.
<!-- bench:end -->

Differences to check when you switch from mailauth:

- mailauth's `arc.status.comment` also holds a comment for a pass. `reason` is set only for failures, and [@portable/mail-auth](https://portablejs.com/packages/mail-auth) builds the pass comment (`i=1 spf=pass dkim=pass`).
- mailauth parses `arc.authenticationResults`. Each entry of `sets` holds `authResults` as text.
- mailauth's `arc.signature` has no equivalent. A failing ARC-Message-Signature is described in `reason`.
- mailauth's `arc.status.shouldSeal` has no equivalent. `seal` throws `Arc.InvalidInputError` when the newest seal has `cv=fail`.
- mailauth's `sealMessage` resolves to a `Buffer`, and `seal` resolves to a string.
- mailauth's `seal.i` has no equivalent. The instance is always one more than the highest on the message.
- mailauth's `seal.bodyHash` and `seal.headers` let it seal without the message. `seal` always reads the message.
- mailauth accepts `cv: 'PASS'` in upper case. `chainValidation` takes only `'none'`, `'pass'`, or `'fail'` in lower case, as `Arc.verify` returns them.
