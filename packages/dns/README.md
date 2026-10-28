# @portable/dns

Looks up DNS records in runtimes without a DNS API. Sends queries over DNS-over-HTTPS (RFC 8484) with `fetch`, and returns the results and error codes of `node:dns/promises`. Runs in browsers, Cloudflare Workers, Node 24+, Bun, and Deno.

Replaces [tangerine](https://www.npmjs.com/package/tangerine) and [dohjs](https://www.npmjs.com/package/dohjs), and `node:dns/promises` in runtimes that don't have it.

```sh
npm install @portable/dns
```

```ts
import * as Dns from '@portable/dns';

const resolver = Dns.create();
const records = await resolver.resolveTxt('_dmarc.example.com');
const dmarc = records.map((chunks) => chunks.join('')).find((text) => text.startsWith('v=DMARC1'));
```

## Bring your own resolver

`Dns.Resolver` is a type listing the lookups that SPF, DMARC, and DKIM need, with Node's method names and result shapes. The resolver from `create` matches it, and so do `node:dns/promises` and a `new Resolver()` from that module:

```ts
import * as Dns from '@portable/dns';
import dns from 'node:dns/promises';

async function dmarcRecord(resolver: Dns.Resolver, domain: string) {
  const records = await resolver.resolveTxt(`_dmarc.${domain}`);
  return records.map((chunks) => chunks.join('')).find((text) => text.startsWith('v=DMARC1'));
}

await dmarcRecord(Dns.create(), 'example.com');
await dmarcRecord(dns, 'example.com');
```

In tests, pass an object whose methods return fixed records. `Dns.Resolver` lists every method, so implement the ones the code under test calls and cast the object:

```ts
const resolver = {
  resolveTxt: async () => [['v=DMARC1; p=reject']],
} as Partial<Dns.Resolver> as Dns.Resolver;
```

## Methods

| Method | Returns |
| --- | --- |
| `resolve4(name)`, `resolve6(name)` | `string[]` of addresses. IPv6 is formatted as RFC 5952 recommends. |
| `resolveTxt(name)` | `string[][]`: one array per record, holding its strings. Join them to read SPF, DKIM, or DMARC. |
| `resolveMx(name)` | `{ exchange, priority }[]` |
| `resolveCname(name)`, `resolveNs(name)`, `resolvePtr(name)` | `string[]` |
| `resolveSrv(name)` | `{ name, port, priority, weight }[]` |
| `resolveSoa(name)` | `{ nsname, hostmaster, serial, refresh, retry, expire, minttl }` |
| `resolveCaa(name)` | `{ critical, issue?, issuewild?, iodef?, ... }[]`, where `critical` is the flags byte (128 when issuer-critical) and each other key is the record's tag. |
| `resolveNaptr(name)` | `{ flags, service, regexp, replacement, order, preference }[]` |
| `reverse(ip)` | `string[]` of host names, from a PTR lookup under `in-addr.arpa` or `ip6.arpa`. |
| `query(name, type)` | The whole decoded response as a [@portable/dns-packet](https://portablejs.com/packages/dns-packet) `DecodedPacket`, with TTLs, the authority section, and the AD flag. Any record type works. It resolves for NOERROR and NXDOMAIN. |

Each method takes `{ signal }` as a last argument. When the signal aborts, the method rejects with `signal.reason`, as `fetch` does.

When the answer holds a CNAME chain, the records of the requested type at the end of the chain are returned. Records owned by names outside the chain are ignored. The root name is returned as `''`, so a null MX (RFC 7505) is `{ exchange: '', priority: 0 }`, as in Node.

Names with non-ASCII characters are converted to punycode with the IDNA 2008 rules that `URL` uses, so `straße.de` is sent as `xn--strae-oqa.de`. A lookup of a name ending in `.onion` rejects with `ENOTFOUND` without sending a request, as RFC 7686 recommends.

## Options

| Option | Default | Description |
| --- | --- | --- |
| `endpoints` | Cloudflare, then Google | DNS-over-HTTPS URLs, tried in order. |
| `fetch` | `globalThis.fetch` | Called as `fetch(request)` with a `Request`. Pass one to add headers, use a proxy, or mock responses. |
| `timeout` | `5000` | Milliseconds to wait for each endpoint, including the response body. A lookup that tries every endpoint can take `timeout` × the number of endpoints. To limit the whole lookup, pass `{ signal: AbortSignal.timeout(ms) }`. |

`create` throws a `RangeError` when `endpoints` is empty, or when `timeout` isn't above 0 or is over 2147483647. It throws a `TypeError` when an endpoint isn't a valid URL.

Queries are GET requests with an ID of 0, as RFC 8484 recommends, so HTTP caches can store the responses and browsers send no CORS preflight. They set RD and AD, so the AD flag in `query()` results reports DNSSEC validation (RFC 6840 section 5.7).

The next endpoint is tried after a network error, a timeout, an HTTP error status, a response that is malformed or truncated, a response to another question, and the response codes SERVFAIL, REFUSED, NOTIMP, and FORMERR. NXDOMAIN and an empty answer are final.

## Errors

Failed lookups reject with `Dns.QueryError`. Its `code`, `syscall`, `hostname`, and `message` are the ones `node:dns/promises` uses, such as `queryTxt ENOTFOUND example.com`. When the failure came from `fetch`, `cause` holds the original error. When the DoH server answered with an error status, `cause` is an `Errors.ResponseError` whose `response` is the whole `Response`. When every endpoint fails, `code` describes the last endpoint's failure.

| `code` | Meaning |
| --- | --- |
| `ENOTFOUND` | The name doesn't exist (NXDOMAIN). `reverse` also uses it when there is no PTR record. |
| `ENODATA` | The name exists, but has no records of that type. |
| `ESERVFAIL`, `EREFUSED`, `ENOTIMP`, `EFORMERR` | The endpoint answered with that response code. |
| `EBADRESP` | The response was malformed, truncated, for another question, not HTTP 2xx, or had another response code. |
| `ETIMEOUT` | The endpoint didn't answer within `timeout`. |
| `ECONNREFUSED` | `fetch` rejected. |
| `EBADNAME` | The name has an empty label (`foo..com`), a label over 63 bytes, or a character other than letters, digits, `-`, `_`, `*`, `/`, `.`, and backslash escapes. Node's resolver (c-ares) accepts the same characters. |
| `EINVAL` | `reverse` was given something that isn't an IP address, or an IPv6 address with a zone ID. |

Each method rejects with a `TypeError` for a name that isn't a string.

`Dns.isNotFound(error)` returns `true` when `error.code` is `ENOTFOUND`, `ENODATA`, or `EBADNAME`, which means the name has no records. It returns `false` for any other error. It reads `code`, so it also works for errors from `node:dns/promises` and from another copy of this package. Other `QueryError` codes, except `EINVAL`, are temporary DNS failures that you can retry. An aborted lookup rejects with `signal.reason` instead of a `QueryError`.

```ts
const records = await resolver.resolveTxt('_dmarc.example.com').catch((error) => {
  if (Dns.isNotFound(error)) {
    return [];
  }
  throw error;
});
```

## Types

| Type | Description |
| --- | --- |
| `Dns.Resolver` | One method per lookup, with Node's names and result shapes. The resolver from `create` and `node:dns/promises` both match it. |
| `Dns.Resolver.CallOptions` | The options each lookup takes: `signal`. |
| `Dns.DohResolver` | The type of the object `create` returns: a `Resolver` with `query`. |
| `Dns.MxRecord` | `{ exchange, priority }`, from `resolveMx`. |
| `Dns.SrvRecord` | `{ name, port, priority, weight }`, from `resolveSrv`. |
| `Dns.SoaRecord` | The object `resolveSoa` returns. |
| `Dns.CaaRecord` | One record from `resolveCaa`. |
| `Dns.NaptrRecord` | One record from `resolveNaptr`. |

## Why use this over node:dns/promises, tangerine, and dohjs

`node:dns/promises` needs a DNS socket, which Cloudflare Workers and browsers don't have, and tangerine builds on Node's `Resolver`. This package needs only `fetch`.

- Only records in the question's CNAME chain are returned. Node returns every record of the type in the answer, so a bad or poisoned answer can add an SPF record. tangerine also filters by type only.
- A truncated response fails with `EBADRESP`. tangerine logs it and returns the partial data.
- TXT strings are decoded as UTF-8, and SOA values above 2^31 stay positive. Node decodes TXT as Latin-1 and returns those SOA values as negative numbers.
- Each lookup clears its timer when it finishes. tangerine leaked an `AbortController` per lookup (tangerine #12).

<!-- bench:start -->
<table>
<thead><tr><th align="left">Library</th><th align="right">Ops/s</th><th align="left">Relative</th><th></th></tr></thead>
<tbody>
<tr><th colspan="4" align="left">Resolve the TXT records of gmail.com</th></tr>
<tr><td>@portable/dns</td><td align="right">47,300</td><td></td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="160" height="12" alt="" /></td></tr>
<tr><td>tangerine</td><td align="right">37,800</td><td>1.3× slower</td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="128" height="12" alt="" /></td></tr>
<tr><td><code>node:dns/promises</code> over local UDP</td><td align="right">19,800</td><td>2.4× slower</td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="67" height="12" alt="" /></td></tr>
<tr><th colspan="4" align="left">Resolve the MX records of gmail.com</th></tr>
<tr><td>@portable/dns</td><td align="right">56,900</td><td></td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="160" height="12" alt="" /></td></tr>
<tr><td>tangerine</td><td align="right">36,200</td><td>1.6× slower</td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="102" height="12" alt="" /></td></tr>
<tr><td><code>node:dns/promises</code> over local UDP</td><td align="right">16,300</td><td>3.5× slower</td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="46" height="12" alt="" /></td></tr>
<tr><th colspan="4" align="left">Resolve the A records of www.microsoft.com</th></tr>
<tr><td>@portable/dns</td><td align="right">52,700</td><td></td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="160" height="12" alt="" /></td></tr>
<tr><td>tangerine</td><td align="right">36,800</td><td>1.4× slower</td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="112" height="12" alt="" /></td></tr>
<tr><td><code>node:dns/promises</code> over local UDP</td><td align="right">19,800</td><td>2.7× slower</td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="60" height="12" alt="" /></td></tr>
</tbody>
</table>

Operations per second from `pnpm bench`, higher is better, in Node 24.22.0, on Intel(R) Xeon(R) Processor @ 2.10GHz (4 cores). Each benchmark lists only the libraries that can do the same work, fastest first. The relative speed compares each library with @portable/dns, and the bars are scaled to the fastest library.

| Library | Version | Minified and gzipped | Runtime dependencies | Node built-ins | TypeScript types |
| --- | --- | ---: | ---: | --- | --- |
| @portable/dns | – | 10 kB | 7 | none | included |
| tangerine | 2.1.3 | 556 kB | 87 | `assert`, `async_hooks`, `buffer`, `console`, `crypto`, `diagnostics_channel`, `dns`, `events`, `fs`, `http`, `http2`, `https`, `net`, `os`, `path`, `perf_hooks`, `process`, `querystring`, `sqlite`, `stream`, `string_decoder`, `timers`, `tls`, `url`, `util`, `worker_threads`, `zlib` | included |
| `node:dns/promises` over local UDP | – | built in | – | Node only | – |

Sizes cover the imports in the usage example, or the equivalent imports of each library, bundled for the browser by `scripts/bundle-size.ts`. Runtime dependencies count every package installed with the published package. A library that uses Node built-ins needs polyfills in a browser and the `nodejs_compat` flag in Cloudflare Workers.
<!-- bench:end -->

Other differences to check when you switch from `node:dns/promises`:

- Node's `resolver.cancel()` has no equivalent. Pass `{ signal }` to each call and abort it.
- Node's `ttl: true` option has no equivalent. The records in `(await resolver.query(name, 'A')).answers` each have a `ttl`.
- Node's `resolve(name, type)`, `resolveAny`, `resolveTlsa`, and `resolveCert` have no equivalent. Call `query(name, type)`. Most public resolvers refuse ANY (RFC 8482).
- Node's `lookup` and `lookupService` have no equivalent, because they read the hosts file and call `getaddrinfo`, which DNS-over-HTTPS can't do.
- Node returns `[]` for a NOERROR answer that holds only a CNAME. This package rejects with `ENODATA`.
- Node reports a response code it has no error for, such as YXDOMAIN, as `ENODATA`. This package reports it as `EBADRESP`.
- Node writes an IPv4-compatible IPv6 address as `::189.96.0.1`. This package writes `::bd60:1`, as RFC 5952 recommends.
- Node retries a truncated response over TCP. DNS-over-HTTPS has no TCP fallback, so this package rejects with `EBADRESP`.
