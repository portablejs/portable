# @portable/dmarc

Checks a message's SPF and DKIM results against the DMARC policy of its From domain (RFC 9989, which updates RFC 7489). Runs in browsers, Cloudflare Workers, Node 24+, Bun, and Deno.

Replaces the DMARC module of [mailauth](https://www.npmjs.com/package/mailauth).

```sh
npm install @portable/dmarc @portable/spf @portable/dns
```

```ts
import * as Dmarc from '@portable/dmarc';
import * as Dns from '@portable/dns';
import * as Spf from '@portable/spf';

const resolver = Dns.create();
const spf = await Spf.check({ ip, sender, helo }, { resolver });
const dmarc = await Dmarc.check(
  { from: 'example.com', spf, dkim: [{ result: 'pass', domain: 'example.com' }] },
  { resolver, signal: AbortSignal.timeout(10_000) },
);

if (dmarc.disposition === 'reject') {
  reject('550 5.7.1 Rejected by the DMARC policy of example.com');
}
```

In Node, `node:dns/promises` works as the resolver.

## Input

| Field | Description |
| --- | --- |
| `from` | The domain of the RFC5322.From address. U-labels are converted to A-labels. Extract it yourself: DMARC doesn't apply when the From header has no address or addresses in more than one domain (RFC 9989 section 5.3.1). |
| `spf` | The SPF result of the MAIL FROM identity, as `Spf.check` returns it. Only `result` and `domain` are read. |
| `dkim` | One `{ result, domain }` per DKIM signature, with the `d=` domain. Only `'pass'` counts. You can pass `Dkim.verify` results as they are. |

## Options

| Option | Default | Description |
| --- | --- | --- |
| `resolver` | required | Answers the lookups. `Dns.create()` from [@portable/dns](https://portablejs.com/packages/dns), `node:dns/promises`, or any object with `resolveTxt`, `resolve4`, and `resolveCname`. |
| `organizationalDomain` | the DNS tree walk | Returns a domain's organizational domain from a public suffix list, such as tldts' `getDomain`. `null` or `undefined` means the domain is its own. When you pass it, `check` looks up the From domain's record, then its organizational domain's (RFC 7489). |
| `signal` | none | Stops the check, and the promise rejects with `signal.reason`. |

`check` treats a resolver rejection with `code` `ENOTFOUND`, `ENODATA`, or `EBADNAME` as no records. Any other rejection gives `temperror` unless the message passes anyway.

`check` calls `resolve4` and `resolveCname` only to find out whether the From domain exists, when `np` would change its policy. The name doesn't exist if the `A` query rejects with `EBADNAME`, or with `ENOTFOUND` and there's no CNAME (RFC 9989 appendix A.4).

## Result

`check` rejects with a `TypeError` for a `resolver` missing one of the three methods, with `signal.reason` when `signal` aborts, and with any error `organizationalDomain` throws.

| Field | Description |
| --- | --- |
| `result` | `'pass'`, `'fail'`, `'none'`, `'temperror'`, or `'permerror'`, as Authentication-Results reports it. |
| `domain` | The From domain, as a lower-case A-label. |
| `policy` | The domain owner's policy: `p` for the From domain's own record, otherwise `sp`, or `np` when the From domain doesn't exist (the weaker one if that lookup fails). One level lower with `t=y`. Missing when no record applies. |
| `disposition` | `policy` when the result is `fail`, otherwise `'none'`. Handling a `temperror` is up to you (RFC 9989 section 5.3.6). |
| `policyDomain` | The domain whose `_dmarc` record applies: the From domain, its organizational domain, or its public suffix domain. |
| `record` | The record that applies, as `{ text, p, sp, np, adkim, aspf, t, psd, rua, ruf, fo }`. Invalid `adkim`, `aspf`, `t`, `psd`, and `fo` values get their defaults. A record with an invalid `p`, `sp`, or `np` acts as `p=none` if `rua` is valid, and is ignored otherwise. |
| `spf` | `{ domain, aligned }` for the SPF result. Set when `spf` was passed. |
| `dkim` | `{ domain, aligned }` for each signature, in input order. |
| `reason` | Why the result is `none`, `temperror`, or `permerror`. |
| `cause` | The resolver's error behind a `temperror`, or an `AggregateError` of them when more than one lookup failed. |

`none` means DMARC doesn't apply: there's no record, more than one record, a duplicate tag, no valid policy and no valid `rua`, or the From domain is an address literal.

`permerror` means `from` isn't a domain name, e.g. an empty string or a domain with a space or an invisible character.

## Organizational domains

RFC 9989 replaces the public suffix list with a DNS tree walk. It queries `_dmarc` records from the domain up toward the top-level domain, at most 8 queries. The record with the fewest labels marks the organizational domain, unless a record has `psd=n` or `psd=y`.

`check` walks only when the From domain has no record, or to check relaxed alignment for a different domain. It walks at most 10 identifiers per message. Any past that count as unknown, which gives `temperror` if nothing else aligns.

Pass `organizationalDomain` to use a public suffix list instead:

```ts
import { getDomain } from 'tldts';

await Dmarc.check({ from, spf, dkim }, { resolver, organizationalDomain: getDomain });
```

## Types

| Type | Description |
| --- | --- |
| `Dmarc.Result` | What `check` resolves to, described under [Result](#result). `Dmarc.Result.Code` is the union of `result` values. |
| `Dmarc.Resolver` | `Pick<Dns.Resolver, 'resolveTxt' \| 'resolve4' \| 'resolveCname'>`, the lookups `check` needs. |
| `Dmarc.Record` | A parsed DMARC record, the type of `Result.record`. |
| `Dmarc.Policy` | `'none' \| 'quarantine' \| 'reject'`. |
| `Dmarc.Alignment` | One SPF or DKIM identifier and whether it aligns with the From domain. |

## Why use this over mailauth

- It runs anywhere. mailauth's DMARC code imports `node:dns` and `node:net`, so it can't run in Workers or browsers.
- It follows RFC 9989 and RFC 6376's tag-list rules by default. mailauth accepts whitespace before `v=DMARC1`, uses the last duplicate tag, and case-folds tag names unless you pass `strict: true`. Results match mailauth's strict mode on 400 random zones.
- It reports the alignment of every DKIM signature, not only the first that aligned, and gives the disposition directly.
- It makes fewer DNS queries. mailauth walks above the From domain on every message and checks whether the domain exists whenever the record has `np`.
- It has no dependencies outside `@portable/*`. [@portable/spf](https://portablejs.com/packages/spf) is imported for types only.
- It's a little faster. Each benchmark run checks a subdomain that inherits its parent's record, with relaxed alignment and three identifiers, in Node with an in-memory resolver.

<!-- bench:start -->
<table>
<thead><tr><th align="left">Library</th><th align="right">Ops/s</th><th align="left">Relative</th><th></th></tr></thead>
<tbody>
<tr><th colspan="4" align="left">Check a subdomain with relaxed alignment</th></tr>
<tr><td>@portable/dmarc</td><td align="right">24,600</td><td></td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="160" height="12" alt="" /></td></tr>
<tr><td>mailauth, strict mode</td><td align="right">18,900</td><td>1.3× slower</td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="123" height="12" alt="" /></td></tr>
</tbody>
</table>

Operations per second from `pnpm bench`, higher is better, in Node 24.22.0, on Intel(R) Xeon(R) Processor @ 2.10GHz (4 cores). Each benchmark lists only the libraries that can do the same work, fastest first. The relative speed compares each library with @portable/dmarc, and the bars are scaled to the fastest library.

| Library | Version | Minified and gzipped | Runtime dependencies | Node built-ins | TypeScript types |
| --- | --- | ---: | ---: | --- | --- |
| @portable/dmarc | – | 17 kB | 10 | none | included |
| mailauth, strict mode | 7.3.0 | 446 kB | 38 | `buffer`, `crypto`, `dns`, `https`, `net`, `os`, `stream`, `string_decoder` | included |

Sizes cover the imports in the usage example, or the equivalent imports of each library, bundled for the browser by `scripts/bundle-size.ts`. Runtime dependencies count every package installed with the published package. A library that uses Node built-ins needs polyfills in a browser and the `nodejs_compat` flag in Cloudflare Workers.
<!-- bench:end -->

Differences to check when you switch from mailauth:

- `from` takes a domain, not mailauth's `headerFrom` address or addresses. Parse the From header first, e.g. with [@portable/mime-headers](https://portablejs.com/packages/mime-headers).
- mailauth returns `false` for a From header without exactly one domain. Check that before calling `check`.
- `dkim` takes every signature, not only passing ones like mailauth's `dkimDomains`. There's no `underSized` flag, so check a signature's `l=` tag yourself.
- `resolver` is an object with `resolveTxt`, `resolve4`, and `resolveCname`, such as `node:dns/promises`. mailauth's is a `(name, type)` function.
- There's no `arcResult`. [@portable/mail-auth](https://portablejs.com/packages/mail-auth) adds the ARC result to its `dmarc=` comment.
- The organizational domain (mailauth's `result.domain`) isn't reported. `policyDomain` is the domain whose `_dmarc` record applies.
- When `signal` aborts, `check` rejects. mailauth gives `temperror` when the resolver times out.
- There's no `status.header`, `info`, or `warnings`. [@portable/mail-auth](https://portablejs.com/packages/mail-auth) builds the Authentication-Results field.
- `pct` and `ri` aren't reported, because RFC 9989 made them historic.
