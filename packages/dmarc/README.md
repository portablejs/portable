# @portable/dmarc

Checks a message against the DMARC policy of its From domain, from its SPF and DKIM results (RFC 9989, the update of RFC 7489). Runs in browsers, Cloudflare Workers, Deno, Bun and Node 24+.

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
| `from` | The domain of the RFC5322.From address. U-labels are converted to A-labels. You extract it yourself, because when the From header has no address, or addresses in more than one domain, RFC 9989 section 5.3.1 says DMARC doesn't apply. |
| `spf` | The SPF result of the MAIL FROM identity, as `Spf.check` returns it. Only `result` and `domain` are read. For a bounce, `Spf.check` checks the HELO name, which RFC 7208 section 2.4 makes the MAIL FROM identity. |
| `dkim` | One `{ result, domain }` per DKIM signature: the verification result and the `d=` domain. Only `'pass'` counts, so a richer DKIM result object fits as is. |

## Options

| Option | Default | Description |
| --- | --- | --- |
| `resolver` | required | Answers the lookups. `Dns.create()` from `@portable/dns`, `node:dns/promises`, or any object with `resolveTxt`, `resolve4` and `resolveCname`. |
| `organizationalDomain` | the DNS tree walk | A function that returns a domain's organizational domain from a public suffix list, such as tldts' `getDomain`. With it, the check follows RFC 7489: it looks up the record of the From domain, then of its organizational domain, and relaxed alignment compares the function's results. |
| `signal` | none | Stops the check. The promise rejects with `signal.reason`, as `fetch` does. Use `AbortSignal.timeout(ms)` for a time limit. |

`check` treats a resolver rejection with `code` `ENOTFOUND`, `ENODATA` or `EBADNAME` as no records, and any other rejection as a DNS error, which gives `temperror` unless the message passes anyway.

`resolve4` and `resolveCname` are called only when the record that applies has an `np` tag, to find out whether a subdomain exists. A name exists unless the `A` query gives `ENOTFOUND` and the name has no CNAME (RFC 9989 appendix A.4).

## Result

`check` resolves to a plain object. It rejects with a `TypeError` for a `resolver` without one of the three methods, and otherwise only when `signal` aborts.

| Field | Description |
| --- | --- |
| `result` | `'pass'`, `'fail'`, `'none'`, `'temperror'` or `'permerror'`, as Authentication-Results reports it. |
| `domain` | The From domain that was checked, in lower case and A-label form. |
| `policy` | The policy the domain owner asks for: `p` for the From domain's own record, otherwise `sp`, or `np` when the From domain doesn't exist. With `t=y` it is one level lower. Missing when no record applies. |
| `disposition` | `policy` when the result is `fail`, and `'none'` otherwise. RFC 9989 section 5.3.6 says the policy can't be applied after a DNS error, so a `temperror` is left to you. |
| `policyDomain` | The domain whose `_dmarc` record applies: the From domain, its organizational domain, or its public suffix domain. |
| `record` | The record that applies, as `{ text, p, sp, np, adkim, aspf, t, psd, rua, ruf, fo }`, with invalid values replaced by their defaults. |
| `spf` | `{ domain, aligned }` for the SPF result. Set when `spf` was passed. |
| `dkim` | `{ domain, aligned }` for each signature, in the order they were passed. |
| `reason` | Why the result is `none`, `temperror` or `permerror`. |
| `cause` | The resolver's error behind a `temperror`, or an `AggregateError` of them when more than one lookup failed. |

`none` means DMARC doesn't apply: there is no record, the record has no valid policy and no valid `rua`, or the From domain is an address literal. `permerror` means `from` isn't a domain name, such as an empty string or a domain with a space or an invisible character.

## Organizational domains

RFC 9989 replaces the public suffix list with a DNS tree walk. It queries `_dmarc` records from the domain up to the top-level domain, at most 8 queries, and the domain of the record with the fewest labels is the organizational domain, unless a record says otherwise with `psd=n` or `psd=y`. A domain owner can publish `psd=n` to make a subdomain its own organization, and a public suffix operator can publish `psd=y` with a policy for names registered below it.

The check walks only in two cases: to find the policy when the From domain has no record, and to check relaxed alignment for an identifier that isn't the From domain. Each name is queried once per check. An identifier outside the From domain's organizational domain can't align and isn't walked, and at most 10 identifiers are walked per message. An identifier past that limit counts as unknown, which gives `temperror` if nothing else aligns.

Pass `organizationalDomain` to use a public suffix list instead:

```ts
import { getDomain } from 'tldts';

await Dmarc.check({ from, spf, dkim }, { resolver, organizationalDomain: getDomain });
```

## Types

| Type | Description |
| --- | --- |
| `Dmarc.Resolver` | `Pick<Dns.Resolver, 'resolveTxt' \| 'resolve4' \| 'resolveCname'>`, the lookups `check` needs. |
| `Dmarc.Record` | A parsed DMARC record, as `Result.record` holds it. |
| `Dmarc.Policy` | `'none' \| 'quarantine' \| 'reject'`. |
| `Dmarc.Alignment` | One SPF or DKIM identifier and whether it aligns with the From domain. |

## Why use this over mailauth

- It runs anywhere. mailauth's DMARC code imports `node:dns` and `node:net`, so it can't run in Workers or a browser.
- It follows RFC 9989 and RFC 6376's tag-list rules without a mode switch. mailauth's default mode accepts whitespace before `v=DMARC1`, uses the last of duplicate tags and case-folds tag names, and mailauth follows the RFCs only with `strict: true`. The results match mailauth's strict mode on 400 random zones.
- It reports the alignment of each DKIM signature, not only the first that aligned, and gives the disposition directly.
- It makes fewer DNS queries. mailauth walks above the From domain on every message, and asks whether the domain exists whenever the record has `np`. `check` walks only for a relaxed alignment check of a different domain, and asks whether the domain exists only when `np` would change the policy.
- It has no dependencies outside `@portable/*`, and `@portable/spf` is imported for types only.
- It is a little faster. In the benchmark below, each run checks a subdomain that inherits its parent's record, with relaxed alignment and three identifiers, in Node with an in-memory resolver.

<!-- bench:start -->
| | @portable/dmarc | mailauth, strict mode |
| --- | ---: | ---: |
| Check a subdomain with relaxed alignment | 24,600 | 18,900 |

Operations per second from `pnpm bench`, higher is better, in Node 24.22.0, on Intel(R) Xeon(R) Processor @ 2.10GHz (4 cores). A dash means the library has no equivalent.

| | @portable/dmarc | mailauth, strict mode |
| --- | --- | --- |
| Minified and gzipped | 17 kB | 446 kB |
| Runtime dependencies | 10 | 38 |
| Node built-ins used | none | `buffer`, `crypto`, `dns`, `https`, `net`, `os`, `stream`, `string_decoder` |
| TypeScript types | included | included |
| Version compared | – | 7.3.0 |

Sizes cover the imports in the usage example, or the equivalent imports of each library, bundled for the browser by `scripts/bundle-size.ts`. Runtime dependencies count every package installed with the published package. A library that uses Node built-ins needs polyfills in a browser and the `nodejs_compat` flag in Cloudflare Workers.
<!-- bench:end -->

Differences to check when you switch from mailauth:

- mailauth's `headerFrom` takes an address or an array of addresses. `from` takes the domain, so parse the From header first, for example with `@portable/mime-headers`.
- mailauth returns `false` for a From header without exactly one domain. Decide that before calling `check`: a `from` that isn't a domain name gives `permerror`, and a domain literal gives `none`.
- mailauth's `dkimDomains` takes only passing signatures, with an `underSized` flag. `dkim` takes every signature and reports the alignment of each, so check a signature's `l=` tag yourself.
- mailauth's `resolver` is one `(name, type)` function. `check` takes an object with `resolveTxt`, `resolve4` and `resolveCname`, such as `node:dns/promises`.
- mailauth's `arcResult` has no equivalent. `@portable/mail-auth` adds the ARC result to the comment of its `dmarc=` result.
- mailauth's `result.domain`, the organizational domain, is not reported. `policyDomain` gives the domain that holds the record.
- mailauth gives `temperror` when the resolver times out. A `signal` such as `AbortSignal.timeout(ms)` makes `check` reject instead.
- mailauth's `status.header`, `info` and `warnings` have no equivalent. `@portable/mail-auth` builds the Authentication-Results field.
- `pct` and `ri` are not reported, because RFC 9989 made them historic.
