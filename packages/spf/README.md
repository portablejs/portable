# @portable/spf

Checks whether an SMTP client may send mail for a domain, using SPF (RFC 7208). Runs in browsers, Cloudflare Workers, Node 24+, Bun, and Deno.

Replaces the SPF module of [mailauth](https://www.npmjs.com/package/mailauth). It passes the OpenSPF RFC 7208 test suite that [pyspf](https://github.com/sdgathman/pyspf) and other implementations run.

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

In Node, you can pass `node:dns/promises` to use the system's DNS servers:

```ts
import dns from 'node:dns/promises';

await Spf.check({ ip, sender, helo }, { resolver: dns });
```

## Input

| Field | Description |
| --- | --- |
| `ip` | The client's IPv4 or IPv6 address. An IPv4-mapped IPv6 address is checked as IPv4. Rejects with a `RangeError` for an invalid address, or a `TypeError` for a non-string. |
| `sender` | The MAIL FROM address. If it's empty or missing, as for a bounce, the HELO name is checked as `postmaster@<helo>` (RFC 7208 section 2.4). A sender without `@` is read as a domain with the local-part `postmaster`. |
| `helo` | The HELO or EHLO name, used for `%{h}` and for an empty sender. |

`check` returns `none` without a lookup if the domain isn't fully qualified (e.g. `localhost` or `[192.0.2.1]`), or if both `sender` and `helo` are empty.

RFC 7208 section 2.3 recommends also checking the HELO identity. To do that, call `check` again with `sender: ''`.

## Options

| Option | Default | Description |
| --- | --- | --- |
| `resolver` | required | `Dns.create()` from [@portable/dns](https://portablejs.com/packages/dns), `node:dns/promises`, or any object with `resolve4`, `resolve6`, `resolveMx`, `resolvePtr`, and `resolveTxt`. |
| `receiver` | `'unknown'` | The checking host's name, for `%{r}` in explanations. |
| `now` | `new Date()` | The time for `%{t}` in explanations, as a `Date` or a `Temporal.Instant`. |
| `signal` | none | Aborting rejects `check` with `signal.reason` and cancels pending lookups. RFC 7208 section 4.6.4 suggests a limit of at least 20 seconds. If `AbortSignal.timeout` fires, report `temperror`. |

There is no default resolver, because `check` sends the client's IP address in DNS queries (e.g. for `exists:%{i}...`). Use your mail server's resolver, or `Dns.create()` for DNS-over-HTTPS.

A resolver rejection with `code` `ENOTFOUND`, `ENODATA`, or `EBADNAME` counts as an empty answer. Any other rejection gives `temperror`.

When a lookup is empty or its target expands to an invalid domain, an `a`, `mx`, or `exists` term doesn't match, and an `include` or `redirect=` gives `permerror`.

## Result

`check` resolves to a plain object. It rejects only for an invalid `ip`, a `resolver` without the five methods, or an aborted `signal`.

| Field | Description |
| --- | --- |
| `result` | One of the results of [RFC 7208 section 8](https://www.rfc-editor.org/rfc/rfc7208#section-8). `'pass'`: the client may send. `'fail'`: it may not, and RFC 7208 suggests rejecting. `'softfail'`: probably not, so accept and mark the message. `'neutral'`: no claim. `'none'`: no SPF record, or no domain to check. `'temperror'`: a DNS error, so retry later or answer 451. `'permerror'`: a broken record. |
| `domain` | The domain whose policy was checked, as an A-label. |
| `identity` | `'mailfrom'`, or `'helo'` when the sender was empty. Use it with `domain` for `smtp.mailfrom` or `smtp.helo` in Authentication-Results. |
| `mechanism` | The term that matched, as written in the record, such as `include:_spf.example.com` or `-all`. Missing when nothing matched. |
| `record` | The SPF record that gave the result. After a `redirect=`, it is the record of the redirect target. |
| `explanation` | For a `fail`, the TXT record that `exp=` points to, with macros expanded. An `exp=` in an included record is ignored. Missing if there's no `exp=`, the lookup fails, or the text isn't printable ASCII. The domain owner writes it, so treat it as untrusted. |
| `reason` | Why the result is `none`, `temperror`, or `permerror`, such as `More than 10 DNS-querying terms`. |
| `cause` | The resolver's error behind a `temperror`. |
| `lookups` | The number of DNS-querying terms evaluated (`include`, `a`, `mx`, `ptr`, `exists`, `redirect=`, and each `%{p}`). |
| `voidLookups` | The number of lookups that found no records. |

## Limits

The limits of RFC 7208 section 4.6.4 are fixed:

- More than 10 DNS-querying terms give `permerror`. The first TXT lookup and `exp=` don't count, and each `%{p}` counts as one.
- More than 2 void lookups (queries that return no records) give `permerror`. Address lookups of MX and PTR names don't count, and an `a` term counts only the client's address family.
- An `mx` term with more than 10 MX records gives `permerror`.
- A `ptr` term or `%{p}` validates only the first 10 PTR names.

`check` queries each name and type once, but every term that needs it still counts toward the limit.

## Macros

All of RFC 7208 section 7 is supported: `%{s}`, `%{l}`, `%{o}`, `%{d}`, `%{i}`, `%{p}`, `%{v}`, and `%{h}`; `%{c}`, `%{r}`, and `%{t}` in explanations; digit, `r`, and delimiter transformers; URL escaping for upper-case letters; and `%%`, `%_`, and `%-`.

`%{p}` works, though RFC 7208 advises against it because it is slow and the client controls its PTR records.

If the sender's local-part isn't ASCII, `%{l}` and `%{s}` can't expand (RFC 8616 section 4). A mechanism that uses them doesn't match, a `redirect=` gives `permerror`, and an `exp=` gives no explanation.

## Types

| Type | Description |
| --- | --- |
| `Spf.Resolver` | `Pick<Dns.Resolver, 'resolve4' \| 'resolve6' \| 'resolveMx' \| 'resolvePtr' \| 'resolveTxt'>`, the lookups `check` needs. |
| `Spf.Result` | What `check` resolves to, as above. `Spf.Result.Code` is the type of `result`. |

## Why use this over mailauth

- It runs in browsers and Workers. mailauth's SPF code imports `node:dns`, `node:net`, and `node:os`.
- It follows RFC 7208 by default, where mailauth needs `strict: true`. It passes all 203 tests of the RFC 7208 suite and matches mailauth's strict mode on 300 random records.
- It has no dependencies outside `@portable/*`. mailauth depends on joi, ipaddr.js, libmime, and more.
- It runs about twice as many checks a second as mailauth's default mode in Node.

<!-- bench:start -->
<table>
<thead><tr><th align="left">Library</th><th align="right">Ops/s</th><th align="left">Relative</th><th></th></tr></thead>
<tbody>
<tr><th colspan="4" align="left">Check a record with nested includes</th></tr>
<tr><td>@portable/spf</td><td align="right">20,500</td><td></td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="160" height="12" alt="" /></td></tr>
<tr><td>mailauth</td><td align="right">9,280</td><td>2.2× slower</td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="72" height="12" alt="" /></td></tr>
<tr><td>mailauth, strict mode</td><td align="right">7,660</td><td>2.7× slower</td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="60" height="12" alt="" /></td></tr>
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

- mailauth's `resolver` is one `(name, type)` function. Here it is an object with `resolve4` and the other methods.
- mailauth's `maxResolveCount` and `maxVoidCount` have no equivalent, because the RFC's limits are fixed.
- mailauth's `maxElapsedTime` returns `temperror`. With `signal: AbortSignal.timeout(ms)`, `check` rejects with a `TimeoutError`, so report `temperror` yourself.
- There is no `result.status.comment`, `result.header`, or `result.info`.
- `check` rejects with a `RangeError` for an invalid `ip`. mailauth returns `temperror`.
- A resolver answer of `[]` counts as a void lookup (RFC 7208). mailauth counts only `ENOTFOUND` and `ENODATA` rejections.
- An `EBADNAME` rejection counts as an empty answer. mailauth's default mode gives `permerror`.

These results match mailauth's strict mode but not its default mode:

- A syntax error anywhere in the record gives `permerror`, even after the matching term.
- An `a` term counts as a void lookup when the host has no address of the client's family.
- A record with leading spaces, or a tab after `v=spf1`, isn't an SPF record.
- `%{c}`, `%{r}`, and `%{t}` outside an explanation give `permerror`.
