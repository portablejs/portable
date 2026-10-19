# Test parity

This package replaces three things, and each one's tests were read as a list of cases:

- `node:dns/promises`: the `test/parallel/test-dns-*` and `test/internet/test-dns-*` files of [Node](https://github.com/nodejs/node) (MIT) at `main` in October 2026.
- [tangerine](https://github.com/forwardemail/nodejs-dns-over-https-tangerine) 2.1.3 `test/test.js` (MIT), a DNS-over-HTTPS resolver with Node's `Resolver` API.
- [dohjs](https://github.com/byu-imaal/dohjs) 0.3.3 `lib/index.spec.js` and `test.sh` (GPL-3.0, so nothing is copied from it), and [@sagi.io/dns-over-https](https://github.com/sagi/dns-over-https-node) 0.0.2 `index.test.js` (MIT).

[dns-over-http](https://github.com/jwerle/dns-over-http) has no tests, and it is a DoH server, not a client.

Test files:

- `resolver.conformance.ts` runs in Node and browsers against a mocked `fetch`.
- `resolver.oracle.test.ts` runs a UDP DNS server on localhost, points `node:dns/promises` at it, and gives Node and this package the same answers. It covers random records of every type, every error response code, odd names, reverse lookups and the recorded responses, and then tests each deliberate difference on its own.
- `resolver.network.test.ts` queries Cloudflare and Google for real. It is skipped unless `DNS_NETWORK=1` is set.
- `fixtures/responses.json` holds 58 responses recorded from `cloudflare-dns.com` and `dns.google` in October 2026, for 29 questions. They include long TXT records split into strings, CNAME chains, NXDOMAIN, NODATA, a null MX and SRV, and PTR records.

Node's internet tests and tangerine's tests query live servers. Here their cases run against recorded or generated responses, and the live test covers a few of them again.

## Node `test/parallel`

| Upstream test | Covered by | Notes |
| --- | --- | --- |
| test-dns.js: `setServers` with holes, invalid addresses and ports, `getServers` | `endpoints > rejects an empty endpoint list, a bad URL and a bad timeout` | Endpoints are URLs passed to `createResolver`. There is no `setServers`. |
| test-dns.js: `resolve` with a bad `rrtype` or no name | `requests > rejects a name that is not a string with a TypeError` | There is no `resolve(name, type)`. TypeScript checks the type passed to `query`. |
| test-dns.js: `lookup` and `lookupService` argument checks | Not applicable | No `lookup` or `lookupService`: they use the hosts file and `getaddrinfo`. |
| test-dns.js: `resolveMx('foo.onion')` is ENOTFOUND | `requests > answers ENOTFOUND for .onion names without a request (RFC 7686)` | Also checks `syscall`, `hostname` and `message`. |
| test-dns.js: `resolveAny` with A, AAAA, MX, NS, PTR, SOA | `record types` and the oracle's random answers | No `resolveAny`, since public resolvers refuse ANY (RFC 8482). Each type is tested through its own method. |
| test-dns.js: `resolve4`/`resolve6` with `{ ttl: true }` | `NXDOMAIN and NODATA > query returns TTLs and the AD flag` | `query()` returns each record's TTL. |
| test-dns.js: `resolveSoa` with `serial` 3210987654 and `minttl` 3333333333 | `record types > resolveSoa returns one object and keeps 32-bit values above 2^31` | |
| test-dns-resolveany.js | `record types`, `resolveTxt decodes UTF-8 ...` | Its TXT string holds a NUL byte, which is kept. CAA `critical: 128` is in `resolveCaa keys each value by its tag`. |
| test-dns-resolveany-bad-ancount.js | `server failures > an answer count larger than the answers is EBADRESP` | |
| test-dns-resolveany-ttl-overflow.js | `record types > 257 records are all returned` | |
| test-dns-resolvesrv.js, test-dns-resolvesrv-econnrefused.js | `record types > resolveSrv returns the target as name` | |
| test-dns-resolvens-typeerror.js | `requests > rejects a name that is not a string with a TypeError` | It rejects instead of throwing, since every method is async. |
| test-dns-resolve-promises.js | `NXDOMAIN and NODATA > %s rejects NXDOMAIN with ENOTFOUND` | Upstream stubs the binding to return EPERM. The same error fields are checked with a real error. |
| test-dns-reverse-dns-only.js | `reverse > queries in-addr.arpa for IPv4 and ip6.arpa for IPv6` | |
| test-dns-channel-timeout.js | `endpoints > rejects ... a bad timeout`, `timeouts and cancellation > an endpoint that does not answer within timeout is ETIMEOUT` | `timeout` must be above 0. Node also accepts -1 and 0 as "use the default". |
| test-dns-resolver-max-timeout.js | `timeouts and cancellation` | There is no backoff between tries, so no `maxTimeout`. |
| test-dns-channel-cancel.js, test-dns-channel-cancel-promise.js, test-dns-cancel-reverse-lookup.js | `timeouts and cancellation > aborting the signal rejects with its reason ...` | An `AbortSignal` per call replaces `resolver.cancel()`, and the rejection is `signal.reason`, not ECANCELLED. |
| test-dns-multi-channel.js | `endpoints > two resolvers keep their own endpoints and fetch` | |
| test-dns-setserver-when-querying.js | Not applicable | Endpoints can't change after `createResolver`. |
| test-dns-get-server.js, test-dns-setservers-type-check.js, test-dns-setlocaladdress.js | Not applicable | No `getServers`, `setServers` or `setLocalAddress`. Endpoint URLs are checked by `new URL`. |
| test-dns-default-order-*.js, test-dns-set-default-order.js | Not applicable | Result order only applies to `lookup`. |
| test-dns-lookup*.js, test-dns-lookupService*.js, test-dns-negative-zero.js | Not applicable | `lookup` and `lookupService`. |
| test-dns-memory-error.js | Not applicable | An internal libuv error code. |
| test-dns-perf_hooks.js | Not applicable | Node's performance timeline. |
| test-dns-promises-exists.js | `a plain object of functions fits the Resolver type, as createResolver does` | |

## Node `test/internet`

| Upstream test | Covered by | Notes |
| --- | --- | --- |
| test-dns.js: `resolve4`, `resolve6` with TTLs | `record types`, `query returns TTLs and the AD flag`, recorded responses | |
| test-dns.js: `resolveMx`, `resolveNs`, `resolveSrv`, `resolvePtr`, `resolveNaptr`, `resolveSoa`, `resolveCaa`, `resolveCname`, `resolveTxt` and their `_failure` cases | `record types`, `NXDOMAIN and NODATA > %s rejects NXDOMAIN with ENOTFOUND`, `recorded responses` | |
| test-dns.js: `resolveTlsa` | Not applicable | Use `query(name, 'TLSA')`. |
| test-dns.js: `test_empty_*_records` | `NXDOMAIN and NODATA > %s rejects an empty answer with ENODATA` | |
| test-dns.js: `test_reverse_bogus` | `reverse > rejects anything that is not an IP address with EINVAL, without a request` | |
| test-dns.js: `test_reverse_failure` | `reverse > reports NXDOMAIN as ENOTFOUND with the address as hostname` | The oracle also checks that NODATA is ENOTFOUND, as in Node. |
| test-dns.js: `test_resolve_failure` | `NXDOMAIN and NODATA` | |
| test-dns.js: `lookup` tests | Not applicable | |
| test-dns-promises-resolve.js: a CNAME to a host with no TXT is ENODATA | `NXDOMAIN and NODATA > a CNAME to a name without TXT records is ENODATA` | Over UDP to a local server, Node returns `[]` here (see below). |
| test-dns-promises-resolve.js: bad `rrtype` | Not applicable | No `resolve(name, type)`. |
| test-dns-any.js | `recorded responses`, oracle | NAPTR (sip2sip.info), SRV and PTR come from recordings. No ANY. |
| test-dns-ipv4.js, test-dns-ipv6.js: `resolve4`, `resolve6`, `reverse` | `record types`, `reverse` | `lookup` cases don't apply. |
| test-dns-idna2008.js | `requests > converts internationalized names to punycode with IDNA 2008 rules` | `straße.de` becomes `xn--strae-oqa.de`. |
| test-dns-regress-6244.js: `resolve4('127.0.0.1')` | Oracle names: `'1.2.3.4'` | An address is queried as a name. |
| test-dns-txt-sigsegv.js | Oracle random TXT records | |
| test-dns-cares-domains.js | Not applicable | Node's `domain` module. |
| test-dns-setserver-in-callback-of-resolve4.js, test-dns-getDefaultResultOrder.js, test-dns-lookup.js | Not applicable | |

## tangerine

| Upstream test | Covered by | Notes |
| --- | --- | --- |
| `before`: detect a DNS blackhole | Not applicable | The default suite makes no network requests. |
| exports, instance | `a plain object of functions fits the Resolver type, as createResolver does` | |
| parallelResolution must be boolean, resolve4 parallel resolution | Not applicable | Endpoints are tried one at a time. |
| resolve4 uses serial server resolution by default | `endpoints > tries the next endpoint after a failure and stops at the first answer` | |
| cancel | `timeouts and cancellation` | |
| getServers and setServers, with `[::0]` and IPv6 | `endpoints` | |
| `setDefaultResultOrder with <host>`, `lookup("<host>")` | Not applicable | No `lookup`. |
| `reverse("<host>")` for each host | `reverse > rejects anything that is not an IP address ...`, oracle `reverse` | Names that aren't addresses are EINVAL, as in Node (tangerine #3). |
| `resolve("<host>")`, `resolve("<host>", type)`, `resolve4` ... `resolveTxt` for each host | Oracle names test, which includes tangerine's odd hosts (`..`, `.aa.`, `,.,.`, `::1`, `localhost..`), oracle random answers | Results are compared with Node exactly instead of only by shape. `localhost` isn't answered locally: DNS-over-HTTPS has no hosts file. |
| `resolveAny("<host>")` | Not applicable | No ANY. |
| lookupService | Not applicable | |
| reverse | `recorded responses` | `1.1.1.1` is `one.one.one.one`. |
| timeout | `timeouts and cancellation > an endpoint that does not answer within timeout is ETIMEOUT` | |
| supports got HTTP library | `endpoints`, every test | The `fetch` option takes any function with `fetch`'s signature. |
| creates default cache, default cache supports ttl, supports redis cache, decoding of cached Buffers | Not applicable | No cache. GET requests with ID 0 can be cached by an HTTP cache, and `query()` returns TTLs for callers who keep their own. |
| resolveCert | Not applicable | Use `query(name, 'TYPE37')`. |
| resolveTlsa | Not applicable | Use `query(name, 'TLSA')`. |
| spoofPacket (5 tests) | Not applicable | Tests pass their own `fetch` or a fake `Resolver` instead. |
| resolve HTTPS records, resolve SVCB records, HTTPS and SVCB in TYPES | Not applicable | `query(name, 'HTTPS')` returns the raw RDATA from `@portable/dns-packet`. |
| TypeScript types file exists, package.json has types | Not applicable | Types come from the source. |
| dnssecSecure (4 tests), resolve without dnssecSecure | `NXDOMAIN and NODATA > query returns TTLs and the AD flag`, `requests > sends a GET ... RD and AD set`, network test | `query(name, type).flags.ad`. |
| dnssecSecure with ecsSubnet | Not applicable | No EDNS Client Subnet option. |

## dohjs

| Upstream test | Covered by | Notes |
| --- | --- | --- |
| DNS query message should be created, has one question, of type TXT, matches expected | `requests > sends a GET with the query as unpadded base64url, an ID of 0, and RD and AD set` | |
| sendDohMsg() works | `recorded responses`, network test | |
| DohResolver should be created, has nameserver url | `endpoints > two resolvers keep their own endpoints and fetch` | |
| PUT is not a valid request method, invalid methods cause error | Not applicable | Always GET. |
| DohResolver.query() for example.com TXT contains answers | `recorded responses`, network test | |
| timeout works properly | `timeouts and cancellation` | |
| dnsPacket is exposed | Not applicable | Import `@portable/dns-packet`. |
| `test.sh` command line tests | Not applicable | No command line tool. |

## @sagi.io/dns-over-https

| Upstream test | Covered by | Notes |
| --- | --- | --- |
| getDnsQuery, getDnsWireformat | `requests > sends a GET ...` | |
| getOptions (GET and POST) | `requests > sends a GET ...`, `requests > encodes the query as base64url, never with +, / or =` | Always GET. |
| query, https, post, error | `server failures > a fetch that rejects is ECONNREFUSED ...` | |
| query, http, get | `recorded responses` | |
| query, http, get, known statusCode error; unknown statusCode error | `server failures > an HTTP error status is EBADRESP, with the status in the cause` | |

## Known upstream issues

| Issue | Test |
| --- | --- |
| Node decodes TXT strings as Latin-1, so UTF-8 text comes back garbled. tangerine uses `Buffer.toString()`, which is UTF-8. | `record types > resolveTxt decodes UTF-8 ...`, oracle `TXT is decoded as UTF-8` |
| A default `TextDecoder` strips a byte order mark at the start of a TXT string. | `record types > resolveTxt decodes UTF-8, keeps a leading BOM ...` |
| Node returns every record of the requested type in the answer, including records for names outside the CNAME chain, so a bad or poisoned answer can add an SPF record. tangerine filters by type only. | `CNAME chains > ignores records owned by names outside the chain`, oracle `records owned by names outside the CNAME chain are left out` |
| Node returns `[]` for a NOERROR answer that holds only a CNAME, and tangerine does the same after filtering. Node's own internet test expects ENODATA. | `NXDOMAIN and NODATA > a CNAME to a name without TXT records is ENODATA`, oracle |
| Node reports response codes it has no error for, such as YXDOMAIN, as ENODATA. | `server failures > YXDOMAIN is EBADRESP ...`, oracle |
| Node returns SOA `refresh`, `retry` and `expire` above 2^31 as negative numbers. | `resolveSoa returns one object and keeps 32-bit values above 2^31`, oracle |
| tangerine logs a truncated response and returns its partial data. | `server failures > a truncated response is EBADRESP, and the data in it is not used` |
| tangerine returns an SOA array when there are several records, and one object otherwise. | `resolveSoa returns one object ...` |
| tangerine leaked an `AbortController` per lookup (tangerine #12). | No set of controllers is kept. Each attempt clears its timer when it finishes. |
| `AbortSignal.timeout` holds its signal weakly in Node. A `fetch` that never settles can be garbage collected along with the timer, and the lookup never settles. Found here while writing the timeout test. | `timeouts and cancellation > an endpoint that does not answer within timeout is ETIMEOUT` |
| dohjs encodes GET queries as standard base64, so `+` and `/` appear in the URL. | `requests > encodes the query as base64url, never with +, / or =` |
| dohjs decodes the body of any HTTP status as DNS. @sagi.io/dns-over-https resolves HTTP errors as strings instead of rejecting, and decodes only the first `data` chunk. | `server failures > an HTTP error status is EBADRESP ...` |
| dohjs and @sagi.io/dns-over-https use a response for another question, such as one from a misconfigured cache, as the answer. | `server failures > a response to another question is EBADRESP` |
| CAA tags come from the network. A `__proto__` tag must not change the result's prototype. | `record types > resolveCaa keys each value by its tag` |
