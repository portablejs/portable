# @portable/spf

Checks whether an SMTP client may send mail for a domain, using SPF (RFC 7208). Runs in browsers, Cloudflare Workers, Deno, Bun and Node 24+.

Replaces the SPF module of [mailauth](https://www.npmjs.com/package/mailauth), and covers the cases of the OpenSPF RFC 7208 test suite that [pyspf](https://github.com/sdgathman/pyspf) and other implementations run.

```sh
npm install @portable/spf @portable/dns
```

```ts
import * as Dns from '@portable/dns'
import * as Spf from '@portable/spf'

const spf = await Spf.check(
  { ip: '192.0.2.10', sender: 'alice@example.com', helo: 'mail.example.com' },
  { resolver: Dns.createResolver(), signal: AbortSignal.timeout(20_000) },
)

if (spf.result === 'fail') reject(`550 5.7.23 ${spf.explanation ?? 'SPF check failed'}`)
```

In Node, `node:dns/promises` works as the resolver and uses the system's DNS servers:

```ts
import dns from 'node:dns/promises'

await Spf.check({ ip, sender, helo }, { resolver: dns })
```

## Input

| Field | Description |
| --- | --- |
| `ip` | The client's IPv4 or IPv6 address. An IPv4-mapped IPv6 address such as `::ffff:192.0.2.1` is checked as IPv4. A string that isn't an IP address throws a `RangeError`, and a value that isn't a string a `TypeError`. |
| `sender` | The MAIL FROM address. When it is empty or missing, as for a bounce, the HELO name is checked instead, with the sender `postmaster@<helo>` (RFC 7208 section 2.4). |
| `helo` | The HELO or EHLO name, used for `%{h}` and for an empty sender. |

To check the HELO identity of a message that has a sender, as RFC 7208 section 2.3 recommends, call `check` again with `sender: ''`.

## Options

| Option | Default | Description |
| --- | --- | --- |
| `resolver` | required | Answers the lookups. `Dns.createResolver()` from `@portable/dns`, `node:dns/promises`, or any object with `resolve4`, `resolve6`, `resolveMx`, `resolvePtr` and `resolveTxt`. |
| `receiver` | `'unknown'` | The checking host's name, for `%{r}` in explanations. |
| `signal` | none | Rejects with `signal.reason` and cancels the pending lookups. RFC 7208 section 4.6.4 suggests a time limit of at least 20 seconds, after which the result is `temperror`: catch the `TimeoutError` from `AbortSignal.timeout` and report `temperror`. |

There is no default resolver. The one you pass decides which servers see the client's IP address (`exists:%{i}...` sends it in queries), and a mail server usually has its own. Pass `Dns.createResolver()` for DNS-over-HTTPS.

A resolver rejection with `code` `ENOTFOUND`, `ENODATA` or `EBADNAME` is an empty answer, so an `a`, `mx` or `exists` term doesn't match and an `include` gives `permerror`. Any other rejection is `temperror`.

## Result

`check` resolves to a plain object. It rejects only for an invalid `ip`.

| Field | Description |
| --- | --- |
| `result` | `'pass'`, `'fail'`, `'softfail'`, `'neutral'`, `'none'`, `'temperror'` or `'permerror'`. |
| `domain` | The domain whose policy was checked. A non-ASCII domain is converted to its A-label form. |
| `identity` | `'mailfrom'`, or `'helo'` when the sender was empty. With `domain`, it gives `smtp.mailfrom` or `smtp.helo` for Authentication-Results. |
| `mechanism` | The term that matched, as written in the record, such as `include:_spf.example.com` or `-all`. Missing when nothing matched. |
| `record` | The SPF record that gave the result. After `redirect=`, the record of the redirect target. |
| `explanation` | The text of the domain's `exp=` modifier, for `fail` only. It comes from the domain owner, so treat it as untrusted text. |
| `reason` | Why the result is `none`, `temperror` or `permerror`, such as `More than 10 DNS-querying terms`. |
| `lookups` | DNS-querying terms evaluated (`include`, `a`, `mx`, `ptr`, `exists`, `redirect=`, and each `%{p}`). |
| `voidLookups` | Lookups that found no records. |

## Limits

The limits of RFC 7208 section 4.6.4 are fixed:

- More than 10 DNS-querying terms give `permerror`. The first TXT lookup and the `exp=` lookups don't count, and a `%{p}` expansion counts as one.
- More than 2 void lookups give `permerror`. A void lookup is a term's own query that returns no records. Address lookups of MX and PTR names never count, and an `a` term counts only the lookup for the client's address family.
- An `mx` term whose name has more than 10 MX records gives `permerror`.
- A `ptr` term or `%{p}` validates only the first 10 PTR names.

Each name and type is queried once per check, even when several terms ask for it, and each term still counts.

## Macros

All of RFC 7208 section 7 is supported: `%{s}`, `%{l}`, `%{o}`, `%{d}`, `%{i}`, `%{p}`, `%{v}`, `%{h}`, and `%{c}`, `%{r}` and `%{t}` in explanations, with digit, `r` and delimiter transformers, URL escaping for upper-case letters, and `%%`, `%_` and `%-`.

RFC 7208 says `%{p}` SHOULD NOT be used: it is slow and the client controls its PTR records. It works as the RFC describes, preferring a validated name equal to or under the current domain, then any validated name, then `unknown`.

When the local-part of the sender is not ASCII, a term that uses `%{l}` or `%{s}` doesn't match (RFC 8616 section 4).

## Why use this over mailauth

- It runs anywhere. mailauth's SPF code imports `node:dns`, `node:net` and `node:os`, so it can't run in Workers or a browser.
- It follows RFC 7208 by default. mailauth's default mode evaluates records lazily and counts void lookups its own way, and RFC behavior needs `strict: true`. All 203 tests of the RFC 7208 suite pass, and the results match mailauth's strict mode on the suite and on 300 random records.
- It has no dependencies of its own. mailauth pulls in joi, ipaddr.js, libmime and more for SPF.
- It is faster. On a record with nested includes and a fake resolver, it runs 11,000 to 13,000 checks a second in Node, against 9,000 for mailauth's default mode and 7,000 for its strict mode.

<!-- bench:start -->
| | @portable/spf | mailauth | mailauth, strict mode |
| --- | ---: | ---: | ---: |
| Check a record with nested includes | 20,500 | 9,280 | 7,660 |

Operations per second from `pnpm bench`, higher is better, in Node 24.22.0, on Intel(R) Xeon(R) Processor @ 2.10GHz (4 cores). A dash means the library has no equivalent.

| | @portable/spf | mailauth | mailauth, strict mode |
| --- | --- | --- | --- |
| Minified and gzipped | 13 kB | 442 kB | 442 kB |
| Runtime dependencies | 3 | 38 | 38 |
| Node built-ins used | none | `buffer`, `crypto`, `dns`, `https`, `net`, `os`, `stream`, `string_decoder` | `buffer`, `crypto`, `dns`, `https`, `net`, `os`, `stream`, `string_decoder` |
| TypeScript types | included | included | included |
| Version compared | – | 7.3.0 | 7.3.0 |

Sizes cover the imports in the usage example, or the equivalent imports of each library, bundled for the browser by `scripts/bundle-size.ts`. Runtime dependencies count every package installed with the published package. A library that uses Node built-ins needs polyfills in a browser and the `nodejs_compat` flag in Cloudflare Workers.
<!-- bench:end -->

## Migrating from mailauth

| mailauth | @portable/spf |
| --- | --- |
| `spf({ ip, sender, helo, resolver })` | `Spf.check({ ip, sender, helo }, { resolver })` |
| `resolver: dns.promises.resolve` (the default) | `resolver: dns` from `node:dns/promises`. A resolver is an object with `resolve4` and the rest, not one `(name, type)` function. |
| `mta` | `receiver` |
| `strict: true` | The only behavior. |
| `maxElapsedTime: ms` | `signal: AbortSignal.timeout(ms)`, and report its `TimeoutError` as `temperror` |
| `maxResolveCount`, `maxVoidCount` | Not supported. The RFC's limits are fixed. |
| `result.status.result` | `result.result` |
| `result.status.comment` | `result.reason` for errors. Build your own comment for the others. |
| `result.rr` | `result.record` |
| `result.explanation` | `result.explanation` |
| `result.lookups.count`, `.void` | `result.lookups`, `result.voidLookups` |
| `result.header`, `result.info` | Not built. `@portable/mailauth` will build Received-SPF and Authentication-Results headers. |

These results differ from mailauth's default mode on purpose, and match its strict mode:

- A syntax error anywhere in the record is `permerror`, even after the term that matched.
- An `a` term counts as a void lookup when the host has no address of the client's family, even if it has one of the other family.
- A record with leading spaces, or a tab after `v=spf1`, is not an SPF record.
- `%{c}`, `%{r}` and `%{t}` in a mechanism, `redirect=` or `exp=` are `permerror`. They are allowed only in the explanation text.

They differ from both modes:

- An invalid `ip` throws a `RangeError`. mailauth returns `temperror`.
- A resolver answer of `[]` is a void lookup, as RFC 7208 defines one. mailauth counts only `ENOTFOUND` and `ENODATA` rejections.
- A name the resolver rejects with `EBADNAME` is an empty answer. mailauth's default mode gives `permerror` for any term.
