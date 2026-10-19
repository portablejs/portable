# @portable/dmarc

Checks a message against the DMARC policy of its From domain, from its SPF and DKIM results (RFC 9989, the update of RFC 7489). Runs in browsers, Cloudflare Workers, Deno, Bun and Node 24+.

Replaces the DMARC module of [mailauth](https://www.npmjs.com/package/mailauth).

```sh
npm install @portable/dmarc @portable/spf @portable/dns
```

```ts
import * as Dmarc from '@portable/dmarc'
import * as Dns from '@portable/dns'
import * as Spf from '@portable/spf'

const resolver = Dns.createResolver()
const spf = await Spf.check({ ip, sender, helo }, { resolver })
const dmarc = await Dmarc.check(
  { from: 'example.com', spf, dkim: [{ result: 'pass', domain: 'example.com' }] },
  { resolver, signal: AbortSignal.timeout(10_000) },
)

if (dmarc.disposition === 'reject') reject('550 5.7.1 Rejected by the DMARC policy of example.com')
```

In Node, `node:dns/promises` works as the resolver.

## Input

| Field | Description |
| --- | --- |
| `from` | The domain of the RFC5322.From address. U-labels are converted to A-labels. Extracting it is the caller's job: when the From header has no address, or addresses in more than one domain, RFC 9989 section 5.3.1 says DMARC doesn't apply. |
| `spf` | The SPF result of the MAIL FROM identity, as `Spf.check` returns it. Only `result` and `domain` are read. For a bounce, `Spf.check` checks the HELO name, which RFC 7208 section 2.4 makes the MAIL FROM identity. |
| `dkim` | One `{ result, domain }` per DKIM signature: the verification result and the `d=` domain. Only `'pass'` counts, so a richer DKIM result object fits as is. |

## Options

| Option | Default | Description |
| --- | --- | --- |
| `resolver` | required | Answers the lookups. `Dns.createResolver()` from `@portable/dns`, `node:dns/promises`, or any object with `resolveTxt`, `resolve4` and `resolveCname`. |
| `organizationalDomain` | the DNS tree walk | A function that returns a domain's organizational domain from a public suffix list, such as tldts' `getDomain`. With it, the check follows RFC 7489: it looks up the record of the From domain, then of its organizational domain, and relaxed alignment compares the function's results. |
| `signal` | none | Stops the check. The promise rejects with `signal.reason`, as `fetch` does. Use `AbortSignal.timeout(ms)` for a time limit. |

A resolver rejection with `code` `ENOTFOUND`, `ENODATA` or `EBADNAME` means no records. Any other rejection is a DNS error, which gives `temperror` unless the message passes anyway.

`resolve4` and `resolveCname` are called only to find out whether a subdomain exists, when the record that applies has an `np` tag. A name exists unless the `A` query gives `ENOTFOUND` and the name has no CNAME (RFC 9989 appendix A.4).

## Result

`check` resolves to a plain object. It rejects only when `signal` aborts.

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

`none` means DMARC doesn't apply: there is no record, the record has no valid policy and no valid `rua`, or the From domain is an address literal. `permerror` means `from` isn't a domain name, such as an empty string or a domain with a space or an invisible character.

## Organizational domains

RFC 9989 replaces the public suffix list with a DNS tree walk. It queries `_dmarc` records from the domain up to the top-level domain, at most 8 queries, and the record with the fewest labels marks the organizational domain, unless a record says otherwise with `psd=n` or `psd=y`. A domain owner can publish `psd=n` to make a subdomain its own organization, and a public suffix operator can publish `psd=y` with a policy for names registered below it.

The check walks only when it needs to: to find the policy when the From domain has no record, and to check relaxed alignment for an identifier that isn't the From domain. Each name is queried once per check. An identifier outside the From domain's organizational domain can't align and isn't walked, and at most 10 identifiers are walked per message. An identifier past that limit counts as unknown, which gives `temperror` if nothing else aligns.

Pass `organizationalDomain` to use a public suffix list instead:

```ts
import { getDomain } from 'tldts'

await Dmarc.check({ from, spf, dkim }, { resolver, organizationalDomain: getDomain })
```

## Why use this over mailauth

- It runs anywhere. mailauth's DMARC code imports `node:dns` and `node:net`, so it can't run in Workers or a browser.
- It follows RFC 9989 and RFC 6376's tag-list rules without a mode switch. mailauth's default mode accepts whitespace before `v=DMARC1`, lets the last of duplicate tags win and case-folds tag names, and RFC behavior needs `strict: true`. The results match mailauth's strict mode on 400 random zones.
- It reports the alignment of each DKIM signature, not only the first that aligned, and gives the disposition directly.
- It makes fewer DNS queries. mailauth walks above the From domain on every message, and asks whether the domain exists whenever the record has `np`. Here the walk runs only for a relaxed alignment check of a different domain, and the existence query only when `np` would change the policy.
- It has no dependencies of its own, and `@portable/dns` and `@portable/spf` are imported for types only.
- It is about as fast. On a subdomain with an inherited record, relaxed alignment and three identifiers, it runs 18,700 checks a second in Node against 15,900 for mailauth's strict mode, with an in-memory resolver.

<!-- bench:start -->
| | @portable/dmarc | mailauth, strict mode |
| --- | ---: | ---: |
| Check a subdomain with relaxed alignment | 24,600 | 18,900 |

Operations per second from `pnpm bench`, higher is better, in Node 24.22.0, on Intel(R) Xeon(R) Processor @ 2.10GHz (4 cores). A dash means the library has no equivalent.

| | @portable/dmarc | mailauth, strict mode |
| --- | --- | --- |
| Minified and gzipped | 16 kB | 446 kB |
| Runtime dependencies | 4 | 38 |
| Node built-ins used | none | `buffer`, `crypto`, `dns`, `https`, `net`, `os`, `stream`, `string_decoder` |
| TypeScript types | included | included |
| Version compared | – | 7.3.0 |

Sizes cover the imports in the usage example, or the equivalent imports of each library, bundled for the browser by `scripts/bundle-size.ts`. Runtime dependencies count every package installed with the published package. A library that uses Node built-ins needs polyfills in a browser and the `nodejs_compat` flag in Cloudflare Workers.
<!-- bench:end -->

## Migrating from mailauth

| mailauth | @portable/dmarc |
| --- | --- |
| `dmarc({ headerFrom, spfDomains, dkimDomains, resolver })` | `Dmarc.check({ from, spf, dkim }, { resolver })` |
| `headerFrom: 'user@example.com'` or an array of addresses | `from: 'example.com'`. Parse the From header first, for example with `@portable/mime-headers`. |
| `spfDomains: [domain]` for a passing SPF result | `spf`: the `Spf.check` result. |
| `dkimDomains: [{ domain, underSized }]` for passing signatures | `dkim: [{ result, domain }]` for every signature. Each signature's alignment is reported, so look up its `l=` tag yourself. |
| `resolver: (name, type) => records` | `resolver: dns` from `node:dns/promises`, or an object with `resolveTxt`, `resolve4` and `resolveCname`. |
| `strict: true` | The only behavior. |
| `arcResult` | Not taken. `@portable/mailauth` will combine ARC and DMARC. |
| `false` for a From header without one domain | Decide before calling. A `from` that isn't a domain name gives `permerror`. |
| `result.status.result` | `result.result` |
| `result.policy` | `result.policy`. `result.disposition` is the policy for `fail` and `'none'` otherwise. |
| `result.p`, `result.sp`, `result.np`, `result.testMode`, `result.rr` | `result.record.p`, `.sp`, `.np`, `.t === 'y'`, `.text` |
| `result.policyDomain` | `result.policyDomain` |
| `result.domain` (the organizational domain) | Not reported. `policyDomain` gives where the record is. |
| `result.alignment.spf.result`, `.dkim.result` | `result.spf.aligned`, and `result.dkim.find((signature) => signature.aligned)` |
| `result.alignment.dkim.strict` | `result.record.adkim === 's'` |
| `result.error` | `result.reason` |
| A resolver that times out | `signal: AbortSignal.timeout(ms)`, which rejects instead of giving `temperror`. |
| `result.status.header`, `result.info`, `result.warnings` | Not built. `@portable/mailauth` will build Authentication-Results headers. |

These results differ from mailauth's strict mode:

- A From domain that isn't a domain name gives `permerror` instead of `false`, and a domain literal gives `none`.
- `pct` and `ri` are not reported, because RFC 9989 made them historic.
