# @portable/rdap

Looks up who holds a domain name, an IP address or an AS number over RDAP (RFC 9082 and RFC 9083), the JSON protocol that replaced WHOIS. It finds the right server in IANA's bootstrap files (RFC 9224), follows the registry's referral to the registrar, and returns dates as `Date`s and contacts as plain fields. Runs in browsers, Cloudflare Workers, Deno, Bun and Node 24+.

Replaces [whoiser](https://www.npmjs.com/package/whoiser), [whois-json](https://www.npmjs.com/package/whois-json) and [node-rdap](https://www.npmjs.com/package/node-rdap).

```sh
npm install @portable/rdap
```

```ts
import * as Rdap from '@portable/rdap';

const domain = await Rdap.domain('example.com');
domain.events.expiration; // Date
domain.status; // ['client delete prohibited', 'client transfer prohibited', 'client update prohibited']
domain.nameservers; // ['elliott.ns.cloudflare.com', 'hera.ns.cloudflare.com']
domain.entities.find((entity) => entity.roles.includes('registrar'))?.name;

const network = await Rdap.ip('8.8.8.8');
network.cidrs; // ['8.8.8.0/24']
network.entities.find((entity) => entity.roles.includes('abuse'))?.email; // 'network-abuse@google.com'

const autnum = await Rdap.asn(15169);
autnum.name; // 'GOOGLE'
```

To check whether a name is registered, catch `NotFoundError`:

```ts
async function isRegistered(name: string) {
  try {
    await Rdap.domain(name, { follow: false });
    return true;
  } catch (error) {
    if (error instanceof Rdap.NotFoundError) {
      return false;
    }
    throw error;
  }
}
```

## API

| Function | Looks up | Server comes from |
| --- | --- | --- |
| `Rdap.domain(name, options)` | A domain name, in Unicode or A-labels | IANA's DNS bootstrap file, by the longest matching label suffix |
| `Rdap.ip(address, options)` | An IPv4 or IPv6 address, or a prefix such as `192.0.2.0/24` | IANA's IPv4 or IPv6 bootstrap file, by the longest matching prefix |
| `Rdap.asn(number, options)` | An AS number from 0 to 4294967295 | IANA's ASN bootstrap file |

Each returns a plain object. These fields are on all three:

| Field | Type | Description |
| --- | --- | --- |
| `handle` | `string \| undefined` | The registry's ID for the object. |
| `status` | `readonly string[]` | RDAP status values, lowercased, such as `client transfer prohibited` or `active`. |
| `events` | `{ registration, expiration, lastChanged }` | Each is a `Date`, or `undefined` when the response has no such event. A date without a time zone is read as UTC. |
| `entities` | `readonly Entity[]` | Every contact in the response. An entity nested inside another one, such as a registrar's abuse contact, comes after it in the list. |
| `raw` | `Record<string, unknown>` | The response JSON, for fields such as `secureDNS`, `remarks` and `notices`. |

An `Entity` is `{ handle, roles, name, org, email, phone, address }`. `roles` lists RDAP roles such as `registrar`, `registrant`, `administrative`, `technical` and `abuse`. The other fields come from the entity's jCard: the first `fn`, `org` and `email`, the first `tel` that isn't a fax, with its `tel:` prefix removed, and the `adr` label or its parts joined by line breaks. Redacted values, such as `REDACTED FOR PRIVACY`, are returned as the server sent them.

`Rdap.domain` also returns `name` (A-labels, lowercased), `unicodeName`, `nameservers` (lowercased, without trailing dots) and `referral`. `Rdap.ip` returns `name`, `version` (4 or 6), `startAddress`, `endAddress`, `cidrs`, `type`, `country` and `parentHandle`. `Rdap.asn` returns `name`, `start`, `end`, `type` and `country`.

### Options

| Option | Default | Description |
| --- | --- | --- |
| `fetch` | `globalThis.fetch` | Called as `fetch(request)` with a `Request`. Pass one to add headers, set a timeout, route through a proxy, or mock responses. |
| `signal` | | Aborting rejects the lookup with `signal.reason` and cancels any bootstrap request that no other lookup is waiting for. |
| `now` | the current time | The current time, as a `Date` or a `Temporal.Instant`. A lookup compares it with the time the bootstrap files were cached to decide whether they have expired. |
| `follow` | `true` | `Rdap.domain` only. Fetches the registrar's response when the registry links to it. |

For a timeout, pass `signal: AbortSignal.timeout(5000)`.

### Registrar referrals

gTLD registries such as Verisign and PIR return the registrar, the dates and the nameservers, and link to the registrar's own RDAP response with a `related` link. The registrar's response has the registrant and the other contacts. With `follow` on, `Rdap.domain` fetches that response too. `entities` then lists the registrar's entities, plus registry entities in roles the registrar has no entity for. `status`, `events` and `nameservers` stay the registry's, because the registry is the authority for them.

`referral` is `{ url, raw }` with the registrar's JSON, or `{ url, error }` when that request failed. A failed referral doesn't fail the lookup, because registrar servers are less reliable than registries and the registry's data is still correct. A link is followed only if its type is `application/rdap+json` or missing and it points to another URL ending in `/domain/<name>`.

### Bootstrap files

The bootstrap files are fetched from `https://data.iana.org/rdap/` on first use and cached in memory for 24 hours, which is IANA's `max-age`. The cache is kept per `fetch` function, so a mocked `fetch` in a test never sees files another `fetch` loaded. Concurrent lookups share one request, and a failed request isn't cached. When a service lists both an `https` and an `http` URL, the `https` one is used.

### Errors

| Error | When |
| --- | --- |
| `InvalidInputError` | The name, address or number is malformed. No request is sent. |
| `UnsupportedError` | IANA lists no RDAP server for it, as for `.de` domains or `10.0.0.1`. |
| `NotFoundError` | The server answered 404. `url` is the URL and `response` is the response. It extends `Errors.ResponseError` but not `Rdap.ResponseError`. |
| `ResponseError` | Any other HTTP error, or a body that isn't a JSON object. `status`, `url`, the whole `response` and the parsed `body` (such as an RDAP error with `errorCode` and `title`) are on the error. |

When `fetch` rejects, such as on a network failure, the lookup rejects with the same error. An argument of the wrong type throws a `TypeError`.

Domain names go through `URL`'s IDNA conversion, then must have at least two labels of letters, digits and hyphens, each up to 63 characters and not starting or ending with a hyphen, and at most 253 characters in total. An IPv4-mapped IPv6 address (`::ffff:192.0.2.1`) is looked up as IPv4, and IPv6 is sent in the RFC 5952 form.

## Types

| Type | Description |
| --- | --- |
| `Rdap.Domain` | What `domain` returns. |
| `Rdap.Network` | What `ip` returns. |
| `Rdap.Autnum` | What `asn` returns. |
| `Rdap.Entity` | A contact, with its jCard reduced to common fields. |
| `Rdap.Events` | Registration, expiration and other dates, as `Date`s. |
| `Rdap.Referral` | The registrar's response that a registry response links to, or the error from fetching it. |

## Why use this over whoiser, whois-json and node-rdap

whoiser and whois-json speak WHOIS over TCP port 43, which browsers and Workers can't open, and parse free text whose format differs for each registry. node-rdap speaks RDAP but runs only in Node, returns the raw JSON, and has no way to cancel a lookup.

- Results are normalized: dates are `Date`s, contacts are flat objects, and the same fields come back from every registry. whois-json joins repeated keys into one space-separated string, such as all nameservers in `nameServer`.
- Registrar referrals are followed, as whoiser does for WHOIS. node-rdap returns only the registry's response, which for `.com` has no contacts.
- Unicode domain names are sent in A-labels. node-rdap converts only the TLD, so `münchen.com` is sent as `domain/münchen.com`.
- `Rdap.ip` picks the server by the longest matching prefix, as RFC 9224 requires. node-rdap takes the first match.
- The `https` URL of a bootstrap service is used even when `http` is listed first. node-rdap takes the first URL.
- Every lookup takes a `signal` and a `fetch`, and the bootstrap cache is kept per `fetch` function. node-rdap sets the timeout and cache lifetime for the whole process with `configure`.
- Prefixes (`8.8.8.0/24`) and IPv4-mapped IPv6 addresses can be looked up. node-rdap rejects the first and finds no server for the second.
- node-rdap's `domain` returns the registry's JSON. To get the same, call `Rdap.domain(name, { follow: false })` and read `.raw`.
- node-rdap's `flushCaches` and `resetCaches` have no equivalent. Pass a new `fetch` function to start with an empty bootstrap cache.
- node-rdap rejects with `RdapTimeoutError` and `RdapNetworkError`. A lookup rejects with the `TimeoutError` that `AbortSignal.timeout` aborts with, or with the error `fetch` rejected with.
- node-rdap's `nameserver` and `entity` lookups have no equivalent. Read `nameservers` and `entities` from the domain, or fetch a `self` link from `raw` yourself.
- whoiser returns one object per WHOIS server it queried. `Rdap.domain` returns one merged result.
- whoiser's `host` option has no equivalent. Pass a `fetch` that rewrites the URL.
- whoiser's `whoisTld` has no equivalent. IANA's own RDAP server answers `https://rdap.iana.org/domain/com`.
- `status` uses RDAP's words (`client transfer prohibited`), where WHOIS output uses EPP's (`clientTransferProhibited`).
- TLDs without an RDAP server, such as `.de`, `.ch` and `.io`, reject with `UnsupportedError`. whoiser and whois-json can still look them up, because WHOIS, which needs TCP, is the only source for them.

The benchmarks serve recorded responses from memory. node-rdap returns the response JSON as it is, so its numbers measure only `response.json()`.

<!-- bench:start -->
<table>
<thead><tr><th align="left">Library</th><th align="right">Ops/s</th><th align="left">Relative</th><th></th></tr></thead>
<tbody>
<tr><th colspan="4" align="left">Look up google.com (Verisign response)</th></tr>
<tr><td><code>fetch</code> and <code>response.json()</code></td><td align="right">51,500</td><td>1.4× faster</td><td><img src="../../assets/bar.svg" width="160" height="12" alt="" /></td></tr>
<tr><td>node-rdap</td><td align="right">46,400</td><td>1.2× faster</td><td><img src="../../assets/bar.svg" width="144" height="12" alt="" /></td></tr>
<tr><td><strong>@portable/rdap</strong></td><td align="right">37,800</td><td></td><td><img src="../../assets/bar-ours.svg" width="117" height="12" alt="" /></td></tr>
<tr><th colspan="4" align="left">Look up google.com and follow the registrar referral</th></tr>
<tr><td>node-rdap</td><td align="right">17,600</td><td>1.1× faster</td><td><img src="../../assets/bar.svg" width="160" height="12" alt="" /></td></tr>
<tr><td><strong>@portable/rdap</strong></td><td align="right">15,700</td><td></td><td><img src="../../assets/bar-ours.svg" width="143" height="12" alt="" /></td></tr>
<tr><th colspan="4" align="left">Look up a RIPE network with 16 entities</th></tr>
<tr><td><code>fetch</code> and <code>response.json()</code></td><td align="right">12,800</td><td>1.2× faster</td><td><img src="../../assets/bar.svg" width="160" height="12" alt="" /></td></tr>
<tr><td>node-rdap</td><td align="right">11,800</td><td>1.1× faster</td><td><img src="../../assets/bar.svg" width="148" height="12" alt="" /></td></tr>
<tr><td><strong>@portable/rdap</strong></td><td align="right">10,500</td><td></td><td><img src="../../assets/bar-ours.svg" width="131" height="12" alt="" /></td></tr>
<tr><th colspan="4" align="left">Look up an ARIN AS number</th></tr>
<tr><td><code>fetch</code> and <code>response.json()</code></td><td align="right">28,700</td><td>1.1× faster</td><td><img src="../../assets/bar.svg" width="160" height="12" alt="" /></td></tr>
<tr><td>node-rdap</td><td align="right">28,100</td><td>1.1× faster</td><td><img src="../../assets/bar.svg" width="157" height="12" alt="" /></td></tr>
<tr><td><strong>@portable/rdap</strong></td><td align="right">25,000</td><td></td><td><img src="../../assets/bar-ours.svg" width="139" height="12" alt="" /></td></tr>
</tbody>
</table>

Operations per second from `pnpm bench`, higher is better, in Node 24.22.0, on Intel(R) Xeon(R) Processor @ 2.10GHz (4 cores). Each benchmark lists only the libraries that can do the same work, fastest first. The relative speed compares each library with @portable/rdap, and the bars are scaled to the fastest library.

| Library | Version | Minified and gzipped | Runtime dependencies | Node built-ins | TypeScript types |
| --- | --- | ---: | ---: | --- | --- |
| @portable/rdap | – | 4.9 kB | 5 | none | included |
| node-rdap | 1.0.0 | 9.9 kB | 5 | `Buffer`, `events`, `net` | included |
| `fetch` and `response.json()` | – | built in | – | none | – |

Sizes cover the imports in the usage example, or the equivalent imports of each library, bundled for the browser by `scripts/bundle-size.ts`. Runtime dependencies count every package installed with the published package. A library that uses Node built-ins needs polyfills in a browser and the `nodejs_compat` flag in Cloudflare Workers.
<!-- bench:end -->
