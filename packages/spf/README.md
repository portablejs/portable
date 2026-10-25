# @portable/spf

Checks whether an SMTP client may send mail for a domain, using SPF (RFC 7208). Runs in browsers, Cloudflare Workers, Deno, Bun and Node 24+.

Replaces the SPF module of [mailauth](https://www.npmjs.com/package/mailauth), and covers the cases of the OpenSPF RFC 7208 test suite that [pyspf](https://github.com/sdgathman/pyspf) and other implementations run.

```sh
npm install @portable/spf @portable/dns
```

```ts
import * as Dns from '@portable/dns';
import * as Spf from '@portable/spf';

const spf = await Spf.check(
  { ip: '192.0.2.10', sender: 'alice@example.com', helo: 'mail.example.com' },
  { resolver: Dns.create(), signal: AbortSignal.timeout(20_000) },
);

if (spf.result === 'fail') {
  reject(`550 5.7.23 ${spf.explanation ?? 'SPF check failed'}`);
}
```

In Node, `node:dns/promises` works as the resolver and uses the system's DNS servers:

```ts
import dns from 'node:dns/promises';

await Spf.check({ ip, sender, helo }, { resolver: dns });
```

## Input

| Field | Description |
| --- | --- |
| `ip` | The client's IPv4 or IPv6 address. An IPv4-mapped IPv6 address such as `::ffff:192.0.2.1` is checked as IPv4. `check` rejects with a `RangeError` for a string that isn't an IP address, and with a `TypeError` for a value that isn't a string. |
| `sender` | The MAIL FROM address. When it is empty or missing, as for a bounce, the HELO name is checked instead, with the sender `postmaster@<helo>` (RFC 7208 section 2.4). |
| `helo` | The HELO or EHLO name, used for `%{h}` and for an empty sender. |

To check the HELO identity of a message that has a sender, as RFC 7208 section 2.3 recommends, call `check` again with `sender: ''`.

## Options

| Option | Default | Description |
| --- | --- | --- |
| `resolver` | required | Answers the lookups. `Dns.create()` from `@portable/dns`, `node:dns/promises`, or any object with `resolve4`, `resolve6`, `resolveMx`, `resolvePtr` and `resolveTxt`. |
| `receiver` | `'unknown'` | The checking host's name, for `%{r}` in explanations. |
| `now` | `new Date()` | The time for `%{t}` in explanations, as a `Date` or a `Temporal.Instant`. |
| `signal` | none | Aborting rejects `check` with `signal.reason` and cancels the pending lookups. RFC 7208 section 4.6.4 suggests a time limit of at least 20 seconds, after which the result is `temperror`: catch the `TimeoutError` from `AbortSignal.timeout` and report `temperror`. |

There is no default resolver. `check` sends the client's IP address in DNS queries, for example for `exists:%{i}...`, so the resolver you pass determines which DNS servers see that address. A mail server usually runs its own resolver. Pass `Dns.create()` for DNS-over-HTTPS.

`check` treats a resolver rejection with `code` `ENOTFOUND`, `ENODATA` or `EBADNAME` as an empty answer, so an `a`, `mx` or `exists` term doesn't match and an `include` gives `permerror`. It treats any other rejection as `temperror`.

## Result

`check` resolves to a plain object. It rejects only for an invalid `ip` or a `resolver` that lacks any of the five methods, or with `signal.reason` when `signal` aborts.

| Field | Description |
| --- | --- |
| `result` | `'pass'`, `'fail'`, `'softfail'`, `'neutral'`, `'none'`, `'temperror'` or `'permerror'`. |
| `domain` | The domain whose policy was checked. A non-ASCII domain is converted to its A-label form. |
| `identity` | `'mailfrom'`, or `'helo'` when the sender was empty. With `domain`, it gives `smtp.mailfrom` or `smtp.helo` for Authentication-Results. |
| `mechanism` | The term that matched, as written in the record, such as `include:_spf.example.com` or `-all`. Missing when nothing matched. |
| `record` | The SPF record that gave the result. After a `redirect=`, it is the record of the redirect target. |
| `explanation` | The text of the domain's `exp=` modifier, for `fail` only. It comes from the domain owner, so treat it as untrusted text. |
| `reason` | Why the result is `none`, `temperror` or `permerror`, such as `More than 10 DNS-querying terms`. |
| `cause` | The resolver's error behind a `temperror`. |
| `lookups` | The number of DNS-querying terms evaluated (`include`, `a`, `mx`, `ptr`, `exists`, `redirect=`, and each `%{p}`). |
| `voidLookups` | The number of lookups that found no records. |

## Limits

The limits of RFC 7208 section 4.6.4 are fixed:

- More than 10 DNS-querying terms give `permerror`. The first TXT lookup and the `exp=` lookups don't count, and a `%{p}` expansion counts as one.
- More than 2 void lookups give `permerror`. A void lookup is a term's own query that returns no records. Address lookups of MX and PTR names never count, and an `a` term counts only the lookup for the client's address family.
- An `mx` term whose name has more than 10 MX records gives `permerror`.
- A `ptr` term or `%{p}` validates only the first 10 PTR names.

`check` queries each name and type once, even when several terms need it, and each of those terms still counts toward the lookup limit.

## Macros

All of RFC 7208 section 7 is supported: `%{s}`, `%{l}`, `%{o}`, `%{d}`, `%{i}`, `%{p}`, `%{v}`, `%{h}`, and `%{c}`, `%{r}` and `%{t}` in explanations, with digit, `r` and delimiter transformers, URL escaping for upper-case letters, and `%%`, `%_` and `%-`.

RFC 7208 says `%{p}` SHOULD NOT be used: it is slow and the client controls its PTR records. It works as the RFC describes, preferring a validated name equal to or under the current domain, then any validated name, then `unknown`.

When the local-part of the sender is not ASCII, a term that uses `%{l}` or `%{s}` doesn't match (RFC 8616 section 4).

## Types

| Type | Description |
| --- | --- |
| `Spf.Resolver` | `Pick<Dns.Resolver, 'resolve4' \| 'resolve6' \| 'resolveMx' \| 'resolvePtr' \| 'resolveTxt'>`, the lookups `check` needs. |
| `Spf.Result` | What `check` resolves to, as above. `Spf.Result.Code` is the type of `result`. |

## Why use this over mailauth

- It runs in browsers and Workers as well as Node. mailauth's SPF code imports `node:dns`, `node:net` and `node:os`, so it can't run in Workers or a browser.
- It follows RFC 7208 by default. mailauth's default mode evaluates records lazily and counts void lookups its own way, and you need `strict: true` to get RFC behavior. All 203 tests of the RFC 7208 suite pass, and the results match mailauth's strict mode on the suite and on 300 random records.
- It has no dependencies outside `@portable/*`. mailauth depends on joi, ipaddr.js, libmime and more for SPF.
- It is faster. On a record with nested includes and a fake resolver, it runs about twice as many checks a second as mailauth's default mode in Node, as the table below shows.

<!-- bench:start -->
<table>
<thead><tr><th align="left">Library</th><th align="right">Ops/s</th><th align="left">Relative</th><th></th></tr></thead>
<tbody>
<tr><th colspan="4" align="left">Check a record with nested includes</th></tr>
<tr><td>@portable/spf</td><td align="right">20,500</td><td></td><td><img src="https://portablejs.com/bar.svg" width="160" height="12" alt="" /></td></tr>
<tr><td>mailauth</td><td align="right">9,280</td><td>2.2× slower</td><td><img src="https://portablejs.com/bar.svg" width="72" height="12" alt="" /></td></tr>
<tr><td>mailauth, strict mode</td><td align="right">7,660</td><td>2.7× slower</td><td><img src="https://portablejs.com/bar.svg" width="60" height="12" alt="" /></td></tr>
</tbody>
</table>

Operations per second from `pnpm bench`, higher is better, in Node 24.22.0, on Intel(R) Xeon(R) Processor @ 2.10GHz (4 cores). Each benchmark lists only the libraries that can do the same work, fastest first. The relative speed compares each library with @portable/spf, and the bars are scaled to the fastest library.

| Library | Version | Minified and gzipped | Runtime dependencies | Node built-ins | TypeScript types |
| --- | --- | ---: | ---: | --- | --- |
| @portable/spf | – | 15 kB | 9 | none | included |
| mailauth | 7.3.0 | 442 kB | 38 | `buffer`, `crypto`, `dns`, `https`, `net`, `os`, `stream`, `string_decoder` | included |
| mailauth, strict mode | 7.3.0 | 442 kB | 38 | `buffer`, `crypto`, `dns`, `https`, `net`, `os`, `stream`, `string_decoder` | included |

Sizes cover the imports in the usage example, or the equivalent imports of each library, bundled for the browser by `scripts/bundle-size.ts`. Runtime dependencies count every package installed with the published package. A library that uses Node built-ins needs polyfills in a browser and the `nodejs_compat` flag in Cloudflare Workers.
<!-- bench:end -->

- mailauth's `resolver` is one `(name, type)` function. The `resolver` option of `Spf.check` is an object with `resolve4` and the other methods, such as `dns` from `node:dns/promises`.
- mailauth's `strict: true` is the only behavior, and its `maxResolveCount` and `maxVoidCount` options have no equivalent, because the RFC's limits are fixed.
- mailauth's `maxElapsedTime` returns `temperror` when time runs out. With `signal: AbortSignal.timeout(ms)`, `check` rejects with a `TimeoutError`, which you report as `temperror`.
- `check` builds no comment like mailauth's `result.status.comment` and no `result.header` or `result.info`.
- These results differ from mailauth's default mode and match its strict mode: a syntax error anywhere in the record is `permerror`, even after the term that matched.
- An `a` term counts as a void lookup when the host has no address of the client's family, even if it has one of the other family. mailauth's default mode doesn't count it, and its strict mode does.
- A record with leading spaces, or a tab after `v=spf1`, is not an SPF record. mailauth's default mode accepts it, and its strict mode doesn't.
- `%{c}`, `%{r}` and `%{t}` in a mechanism, `redirect=` or `exp=` are `permerror`, because they are allowed only in the explanation text. mailauth's default mode accepts them, and its strict mode doesn't.
- `check` rejects with a `RangeError` for an invalid `ip`. mailauth returns `temperror` in both modes.
- A resolver answer of `[]` is a void lookup, as RFC 7208 defines one. mailauth counts only `ENOTFOUND` and `ENODATA` rejections.
- `check` treats an `EBADNAME` rejection from the resolver as an empty answer. mailauth's default mode gives `permerror` for any term.
