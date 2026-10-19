# @portable/dns

DNS lookups for runtimes that have no DNS. Sends queries over DNS-over-HTTPS (RFC 8484) with `fetch`, and returns the results and error codes of `node:dns/promises`. Runs in browsers, Cloudflare Workers, Deno, Bun and Node 24+.

Replaces `node:dns/promises` where it doesn't exist, [tangerine](https://www.npmjs.com/package/tangerine) and [dohjs](https://www.npmjs.com/package/dohjs).

```sh
npm install @portable/dns
```

```ts
import * as Dns from '@portable/dns'

const resolver = Dns.createResolver()
const records = await resolver.resolveTxt('_dmarc.example.com')
const dmarc = records.map((chunks) => chunks.join('')).find((text) => text.startsWith('v=DMARC1'))
```

## Bring your own resolver

`Dns.Resolver` is a type listing the lookups that SPF, DMARC and DKIM need, with Node's method names and result shapes. The resolver from `createResolver` fits it, and so do `node:dns/promises` and `new Resolver()` from it:

```ts
import * as Dns from '@portable/dns'
import dns from 'node:dns/promises'

async function dmarcRecord(resolver: Dns.Resolver, domain: string) {
  const records = await resolver.resolveTxt(`_dmarc.${domain}`)
  return records.map((chunks) => chunks.join('')).find((text) => text.startsWith('v=DMARC1'))
}

await dmarcRecord(Dns.createResolver(), 'example.com')
await dmarcRecord(dns, 'example.com')
```

In tests, pass an object whose methods return fixed records.

## Methods

| Method | Returns |
| --- | --- |
| `resolve4(name)`, `resolve6(name)` | `string[]` of addresses. IPv6 is formatted as RFC 5952 recommends. |
| `resolveTxt(name)` | `string[][]`: one array per record, holding its strings. Join them to read SPF, DKIM or DMARC. |
| `resolveMx(name)` | `{ exchange, priority }[]` |
| `resolveCname(name)`, `resolveNs(name)`, `resolvePtr(name)` | `string[]` |
| `resolveSrv(name)` | `{ name, port, priority, weight }[]` |
| `resolveSoa(name)` | `{ nsname, hostmaster, serial, refresh, retry, expire, minttl }` |
| `resolveCaa(name)` | `{ critical, issue?, issuewild?, iodef?, ... }[]` |
| `resolveNaptr(name)` | `{ flags, service, regexp, replacement, order, preference }[]` |
| `reverse(ip)` | `string[]` of host names, from a PTR lookup under `in-addr.arpa` or `ip6.arpa`. |
| `query(name, type)` | The whole decoded response as a [`@portable/dns-packet`](https://www.npmjs.com/package/@portable/dns-packet) `DecodedPacket`, with TTLs, the authority section and the AD flag. Any record type works. It resolves for NOERROR and NXDOMAIN. |

Each method takes `{ signal }` as a last argument. Aborting the signal rejects with `signal.reason`, as `fetch` does.

When the answer holds a CNAME chain, the records of the requested type at the end of the chain are returned. Records owned by names outside the chain are ignored. The root name is returned as `''`, so a null MX (RFC 7505) is `{ exchange: '', priority: 0 }`, as in Node.

Names with non-ASCII characters are converted to punycode with the IDNA 2008 rules that `URL` uses, so `straße.de` is sent as `xn--strae-oqa.de`. Names ending in `.onion` fail with `ENOTFOUND` without a request, as RFC 7686 asks.

## Options

| Option | Default | Description |
| --- | --- | --- |
| `endpoints` | Cloudflare, then Google | DNS-over-HTTPS URLs, tried in order. |
| `fetch` | `globalThis.fetch` | Called as `fetch(url, { headers, signal })`. Pass one to add headers, use a proxy or mock responses. |
| `timeout` | `5000` | Milliseconds to wait for each endpoint, including the response body. |

Queries are GET requests with an ID of 0, as RFC 8484 recommends, so HTTP caches can store the responses and browsers send no CORS preflight. They set RD and AD, so the AD flag in `query()` results reports DNSSEC validation (RFC 6840 section 5.7).

The next endpoint is tried after a network error, a timeout, an HTTP error status, a malformed or truncated response, a response to another question, and the response codes SERVFAIL, REFUSED, NOTIMP and FORMERR. NXDOMAIN and an empty answer are final.

## Errors

Failed lookups reject with `Dns.QueryError`. Its `code`, `syscall`, `hostname` and `message` are the ones `node:dns/promises` uses, such as `queryTxt ENOTFOUND example.com`. When the failure came from `fetch` or the response, `cause` holds the original error.

| `code` | Meaning |
| --- | --- |
| `ENOTFOUND` | The name doesn't exist (NXDOMAIN). `reverse` also uses it when there is no PTR record. |
| `ENODATA` | The name exists, but has no records of that type. |
| `ESERVFAIL`, `EREFUSED`, `ENOTIMP`, `EFORMERR` | Every endpoint answered with that response code. |
| `EBADRESP` | The response was malformed, truncated, for another question, not HTTP 2xx, or had another response code. |
| `ETIMEOUT` | No endpoint answered within `timeout`. |
| `ECONNREFUSED` | `fetch` rejected. |
| `EBADNAME` | The name has an empty label (`foo..com`), a label over 63 bytes, or a character other than letters, digits, `-`, `_`, `*`, `/`, `.` and backslash escapes. Node's resolver (c-ares) accepts the same characters. |
| `EINVAL` | `reverse` was given something that isn't an IP address. |

A name that isn't a string rejects with a `TypeError`.

## Why use this over tangerine and dohjs

<!-- bench:start -->
<!-- bench:end -->

## Migrating

| node:dns/promises | @portable/dns |
| --- | --- |
| `import dns from 'node:dns/promises'` | `const dns = Dns.createResolver()` |
| `new Resolver({ timeout })`, `resolver.setServers(servers)` | `Dns.createResolver({ timeout, endpoints })` |
| `resolver.cancel()` | Pass `{ signal }` to each call and abort it. |
| `resolve4(name, { ttl: true })` | `(await resolver.query(name, 'A')).answers` has each record's `ttl`. |
| `resolve(name, type)` | The `resolve*` method for that type, or `query(name, type)`. |
| `resolveAny`, `resolveTlsa`, `resolveCert` | `query(name, type)`. Most public resolvers refuse ANY (RFC 8482). |
| `lookup`, `lookupService` | Not available. They read the hosts file and call `getaddrinfo`, which DNS-over-HTTPS can't. |

| tangerine / dohjs | @portable/dns |
| --- | --- |
| `new Tangerine({ timeout, servers })` | `Dns.createResolver({ timeout, endpoints })` |
| `new Tangerine(options, got)` | `Dns.createResolver({ fetch })` |
| `tangerine.resolve(name, 'A', { dnssecSecure: true })` | `(await resolver.query(name, 'A')).flags.ad` |
| `new DohResolver(url).query(name, type)` | `Dns.createResolver({ endpoints: [url] }).query(name, type)` |

These results differ from `node:dns/promises` on purpose:

- TXT strings are decoded as UTF-8. Node decodes them as Latin-1, so `héllo` comes back as `hÃ©llo`.
- Only records in the CNAME chain of the question are returned. Node returns every record of the type in the answer section, including records for unrelated names.
- A NOERROR answer that holds only a CNAME is `ENODATA`. Node returns `[]`.
- A response code Node has no error for, such as YXDOMAIN, is `EBADRESP`. Node reports `ENODATA`.
- SOA `refresh`, `retry` and `expire` above 2^31 stay positive. Node returns them as negative numbers.
- An IPv4-compatible IPv6 address is written `::bd60:1`, as RFC 5952 recommends. Node writes `::189.96.0.1`.
- A truncated response is an error. Node retries it over TCP, which DNS-over-HTTPS doesn't have.
