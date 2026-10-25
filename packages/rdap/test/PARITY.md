# Test parity

This package replaces three libraries, and each one's tests were read as a list of cases:

- [node-rdap](https://github.com/dcoffey-zengenti/node-rdap) 1.0.0 (MIT), `src/**/tests/*.test.ts` at commit 2480700. It is the oracle.
- [whoiser](https://github.com/LayeredStudio/whoiser) 2.0.0-beta.10 (MIT), `src/whoiser.test.ts` and `src/utils.test.ts` at commit 68ea9a6.
- [whois-json](https://github.com/mikemaccana/whois-json) 2.0.4 (MIT), `test/tests.js` at commit 82de25f.

whoiser and whois-json are WHOIS clients: they open TCP port 43 and parse free text. Their tests query live WHOIS servers. Their cases are covered here with RDAP responses recorded from the same kinds of registries, and their text-parsing cases map to the normalization tests, because RDAP returns JSON.

Test files:

- `domain.conformance.ts` and `number.conformance.ts` run in Node and browsers against a mocked `fetch`.
- `lookup.oracle.test.ts` runs node-rdap and this package against the same mocked `fetch`. It compares the server each one queries, or how each one rejects, for a random domain under each of the 1,203 TLDs in the bootstrap file, 500 random IPv4 addresses, 500 random IPv6 addresses and 603 AS numbers, and compares `raw` with node-rdap's result for every recorded response. It then tests each deliberate difference.
- `lookup.bench.ts` compares lookups with node-rdap and with `fetch` plus `response.json()`.
- `fixtures/` holds IANA's four bootstrap files and responses recorded on 2026-10-18 from Verisign (`google.com`, `xn--mnchen-3ya.com`), PIR (`wikipedia.org`), SIDN (`sidn.nl`), Nominet (`bbc.co.uk`), AFNIC (`google.fr`), MarkMonitor and Dynadot (the registrar referrals), ARIN (`8.8.8.8`, AS15169), RIPE (`193.0.6.139`, `2001:67c:2e8::1`, AS3333) and APNIC (`1.1.1.1`). They are public registry data, unchanged.

## node-rdap

| Upstream test | Covered by | Notes |
| --- | --- | --- |
| autnum.test.ts: should return json for valid ASN | `asn > ARIN: AS15169` | |
| autnum.test.ts: should throw error for an ASN with no registry | `asn > rejects a reserved number with UnsupportedError` | |
| autnum.test.ts: should throw a validation error for an impossible ASN | `asn > rejects what is not an AS number with InvalidInputError, without a request`, `asn > throws a TypeError for a value that is not a number` | The test also covers 2^32 and `NaN`. A string throws a `TypeError`. |
| client.test.ts: domain rejects an invalid FQDN without touching the network | `names > rejects malformed names with InvalidInputError, without a request` | |
| client.test.ts: domain rejects when no RDAP server is known for the tld | `names > rejects a TLD with no RDAP server with UnsupportedError, after only the bootstrap file` | |
| client.test.ts: domain rejects when the RDAP server responds with an error status | `names > rejects an unregistered name with NotFoundError`, `responses > rejects an HTTP error with ResponseError, holding the status and the RDAP error body` | 404 has its own error class. |
| client.test.ts: domain requests the expected url and returns the parsed body | `recorded responses > Verisign without follow: one request, and the registry entities` | `raw` is the parsed body. The oracle compares it with node-rdap's. |
| client.test.ts: domain trims and lowercases the domain | `names > sends Unicode names in A-labels, and keeps the unicodeName from the server` | Lowercased, yes. Surrounding spaces are rejected instead of trimmed, so a caller sees a typo. |
| client.test.ts: ip routes an IPv4 address to the IPv4 cache | `ip > ARIN: 8.8.8.8 with its CIDR and the nested abuse contact` | Checks that `ipv4.json` is fetched. |
| client.test.ts: ip routes an IPv6 address to the IPv6 cache | `ip > RIPE: IPv4 and IPv6` | |
| client.test.ts: ip throws when the registry answers with an error status | `ip > rejects an address with no record with NotFoundError` | |
| client.test.ts: ip throws when no RDAP server is known for the address | `ip > rejects an address no registry serves with UnsupportedError` | |
| client.test.ts: autnum requests the expected url and returns the parsed body | `asn > ARIN: AS15169` | |
| client.test.ts: autnum throws when the registry answers with an error status | `responses > rejects an HTTP error with no body with ResponseError` | The error path is shared by all three lookups. |
| client.test.ts: autnum throws when no RDAP server is known for the number | `asn > matches range ends inclusively, and single numbers` | |
| config.test.ts: configure (6 tests) | Not applicable | No process-wide settings. Options are per call. |
| config.test.ts: gives up on a server that never responds | `cancellation > aborting during the lookup rejects with the reason and aborts the request` | A timeout is `signal: AbortSignal.timeout(ms)`. |
| config.test.ts: reports the url and the budget that was exceeded | Not applicable | The rejection is the signal's `TimeoutError`. |
| config.test.ts: honours a timeout changed after the module was loaded | Not applicable | No module-level timeout. |
| domain.test.ts: should return json for valid domain | `recorded responses` (all six) | `.com`, `.org`, `.nl`, `.co.uk` and `.fr`. |
| domain.test.ts: should return error for invalid TLD | `names > rejects a TLD with no RDAP server with UnsupportedError, after only the bootstrap file` | Same names: `example.badger`, `example.invalid`. |
| domain.test.ts: should return error for non-existant domain | `names > rejects an unregistered name with NotFoundError` | |
| domain.test.ts: should return error for invalid FQDN | `names > rejects malformed names with InvalidInputError, without a request` | |
| errors.test.ts: every error is an RdapError and an Error | `error names are namespaced by the package` | Each error extends its class in `@portable/errors`, as AGENTS.md requires. There is no rdap base class. |
| errors.test.ts: each subclass is distinguishable from the others | `names`, `responses` and `asn` tests | Each asserts the specific class. |
| errors.test.ts: reports its own class as the name | `error names are namespaced by the package` | |
| errors.test.ts: carries the detail a caller needs to act on | `names > rejects an unregistered name with NotFoundError`, `responses > rejects an HTTP error with ResponseError, holding the status and the RDAP error body` | `url`, `status` and `body`. |
| errors.test.ts: preserves the underlying failure on cause | `responses > passes a rejected fetch through unchanged` | The `fetch` error itself is the rejection, so there is nothing to unwrap. |
| errors.test.ts: throws a registry error carrying the parsed error body | `responses > rejects an HTTP error with ResponseError, holding the status and the RDAP error body` | |
| errors.test.ts: still throws a registry error when the server sends no body | `responses > rejects an HTTP error with no body with ResponseError` | |
| errors.test.ts: treats a malformed success body as a network error | `responses > rejects a body that is not a JSON object with ResponseError` | Also a JSON array and `null`. |
| errors.test.ts: does not re-wrap an error it raised itself | `bootstrap cache > prefers an https URL, uses an http-only one, and skips services without a URL` | An empty service list gives `UnsupportedError`, not a wrapped one. |
| ip.test.ts: should return json for valid IPv4 address | `ip > ARIN: 8.8.8.8 ...`, `ip > APNIC: 1.1.1.1` | |
| ip.test.ts: should return json for valid IPv6 address | `ip > RIPE: IPv4 and IPv6` | |
| ip.test.ts: should throw error for invalid IP address | `ip > rejects malformed addresses with InvalidInputError, without a request` | Same inputs, and 18 more. |
| ip.test.ts: should not reach the network for an invalid address | `ip > rejects malformed addresses with InvalidInputError, without a request` | |
| ip.test.ts: should throw error if an RDAP server cannot be found | `ip > rejects an address no registry serves with UnsupportedError` | `127.0.0.1` and three more. |
| lookups.test.ts: nameserver (5 tests) | Not applicable | No `nameserver()`. A domain result lists its nameservers. |
| lookups.test.ts: entity (10 tests) | Not applicable | No `entity()`. Entities come flattened inside each result, with `raw` for their `self` links. |
| cache/tests/asn.test.ts: fetches the list on a cold lookup and strips a trailing slash | `asn > matches range ends inclusively, and single numbers` | A base URL without a slash gets one. |
| cache/tests/asn.test.ts: leaves a server without a trailing slash alone | `asn > matches range ends inclusively, and single numbers` | `https://b.example` becomes `https://b.example/autnum/200`. |
| cache/tests/asn.test.ts: matches the range boundaries inclusively | `asn > matches range ends inclusively, and single numbers` | |
| cache/tests/asn.test.ts: serves a repeat lookup / an unseen number from cache | `bootstrap cache > fetches the bootstrap file once for every TLD in it` | The cache holds whole files, so every kind of lookup behaves the same. |
| cache/tests/asn.test.ts: returns null when no range contains the number | `asn > matches range ends inclusively, and single numbers` | |
| cache/tests/asn.test.ts: returns null when a matching range has no server recorded | `bootstrap cache > prefers an https URL, uses an http-only one, and skips services without a URL` | |
| cache/tests/asn.test.ts: reset() and flush() | `bootstrap cache > fetches the bootstrap file again after 24 hours`, `bootstrap cache > keeps a separate cache for each fetch function` | No `reset` or `flush`: a new `fetch` starts empty. |
| cache/tests/dns.test.ts: fetches the list on a cold lookup / leaves a server alone | `bootstrap cache > prefers an https URL, uses an http-only one, and skips services without a URL` | |
| cache/tests/dns.test.ts: serves a repeat lookup from cache | `bootstrap cache > fetches the bootstrap file once for every TLD in it` | |
| cache/tests/dns.test.ts: caches every tld in the list | `bootstrap cache > fetches the bootstrap file once for every TLD in it` | `.com`, `.nl` and `.uk` with one request. |
| cache/tests/dns.test.ts: returns null for an unknown tld | `names > rejects a TLD with no RDAP server ...` | |
| cache/tests/dns.test.ts: set() populates / does not overwrite | Not applicable | No `set()`. A custom `fetch` can serve any bootstrap file. |
| cache/tests/dns.test.ts: flush() | `bootstrap cache > keeps a separate cache for each fetch function` | |
| cache/tests/entity.test.ts (14 tests) | Not applicable | Entity lookup by handle and RFC 8521 object tags are not implemented. |
| cache/tests/index.test.ts: flushCaches, resetCaches (3 tests) | `bootstrap cache > concurrent lookups share one bootstrap request`, `bootstrap cache > fetches the bootstrap file again after 24 hours` | |
| cache/tests/ipv4.test.ts: cold lookup, trailing slash, repeat, unseen address in a known mask | `ip > ARIN ...`, `bootstrap cache > concurrent lookups share one bootstrap request` | |
| cache/tests/ipv4.test.ts: returns null when no mask matches | `ip > rejects an address no registry serves with UnsupportedError` | |
| cache/tests/ipv4.test.ts: returns null when a matching mask has no server recorded | `bootstrap cache > prefers an https URL, uses an http-only one, and skips services without a URL` | |
| cache/tests/ipv4.test.ts: reset(), flush() | `bootstrap cache > keeps a separate cache for each fetch function` | |
| cache/tests/ipv6.test.ts (8 tests) | `ip > RIPE: IPv4 and IPv6`, `ip > rejects an address no registry serves with UnsupportedError`, oracle `random IPv6 addresses ...` | Same cases as IPv4. |
| utils/tests/fqdn.test.ts (8 tests) | `names > rejects malformed names ...`, `names > accepts labels of 63 characters and names up to 253`, oracle `node-rdap test names: valid and invalid alike` | The oracle runs every name from this file through both libraries. |
| utils/tests/getTopLevelDomain.test.ts: converts special characters to punycode | `names > sends Unicode names in A-labels ...` | The whole name is converted, not only the TLD. |
| utils/tests/getTopLevelDomain.test.ts: standard input, empty input, input that is a TLD | `names > picks the registry by the longest matching label suffix`, `names > rejects malformed names ...` | A bare TLD is rejected as a domain. |
| utils/tests/inRange.test.ts (3 tests) | `asn > matches range ends inclusively, and single numbers` | |
| cli.test.ts, cli/tests/*.test.ts | Not applicable | No command-line tool. |

## whoiser

| Upstream test | Covered by | Notes |
| --- | --- | --- |
| whoisAsn(): reserved ASN | `asn > rejects a reserved number with UnsupportedError` | Skipped upstream. AS 0, 23456 and 4294967295. |
| whoisAsn(): AS15169 | `asn > ARIN: AS15169` | `ASName` is `name`. |
| whoisAsn(): AS13335 | `asn > RIPE: AS3333` | A second RIR instead of a second ARIN number. |
| Basic domain WHOIS: google.com | `recorded responses > Verisign: follows the referral to MarkMonitor ...` | Registry handle `2138514_DOMAIN_COM-VRSN`, and the expiration date from the registry. |
| Basic domain WHOIS: cloudflare.com with the host option | Not applicable | No `host`. A custom `fetch` can rewrite the URL. |
| Basic domain WHOIS: javascript.tm from the TLD server | `recorded responses > SIDN: a ccTLD with no expiration event and no referral` | A ccTLD that answers itself, with no registrar referral. |
| Domain WHOIS parsing: testä.de with an umlaut (issue #93) | `names > sends Unicode names in A-labels ...`, `names > rejects a TLD with no RDAP server ...` | `.de` has no RDAP server, so `münchen.com` covers the umlaut. |
| Domain WHOIS parsing: netflix.io, goo.gl registrar WHOIS server | `recorded responses > PIR: .org follows the referral to MarkMonitor` | The referral link replaces the `Registrar WHOIS Server` field. |
| Domain WHOIS parsing: google.eu, google.nl, jprs.jp, ownit.nyc, google.bz, google.lc, google.vc name servers | `recorded responses > SIDN ...`, `recorded responses > Nominet ...` | RDAP returns a `nameservers` array, so there is no per-registry parsing to test. |
| Domain WHOIS parsing: mañana.com and XN--MAANA-PTA.COM | `names > sends Unicode names in A-labels ...` | `münchen.com` in four spellings. |
| Domain WHOIS parsing: nic.gi registrar IANA ID | `recorded responses > Verisign without follow ...` | The registrar entity's handle is its IANA ID, `292`. |
| Domain WHOIS parsing: nic.ua contacts of every type | `normalization > flattens jCard properties into the first value of each`, `recorded responses > AFNIC ...` | Registrant, administrative and technical entities. |
| Domain WHOIS parsing: google.it, trabis.gov.tr dates and registrar | `recorded responses > Nominet ...`, `normalization > reads dates without a time zone as UTC ...` | RDAP dates are RFC 3339. A date without a zone is read as UTC instead of the machine's zone. |
| Domain WHOIS parsing: google.fr dates, statuses, registrar, registrant | `recorded responses > AFNIC: a failed referral keeps the registry result and reports the error` | The same domain over RDAP: 4 statuses, registrant `dns-admin@google.com`. |
| whoisIp(): invalid IPs | `ip > rejects malformed addresses with InvalidInputError, without a request` | `''`, `.`, `:`, `1`, `1.1.1.1.1`. |
| whoisIp(): 1.1.1.1 | `ip > APNIC: 1.1.1.1` | `route` is `cidrs`, `country` is `country`. |
| whoisIp(): 8.8.8.8 | `ip > ARIN: 8.8.8.8 ...` | |
| whoisIp(): 2606:4700:4700::1111, 2001:4860:4860::8888 | `ip > RIPE: IPv4 and IPv6` | |
| whoisTld() (6 tests) | Not applicable | No TLD lookup. `names > picks the registry by the longest matching label suffix` covers the `co.uk` case. |
| utils.test.ts: isDomain() invalid and valid domains | `names > rejects malformed names ...` | `.example.com.` is rejected for its leading dot. A trailing dot is accepted. |
| utils.test.ts: validatedTld() | Not applicable | No TLD lookup. |

## whois-json

| Upstream test | Covered by | Notes |
| --- | --- | --- |
| parseRawData: converts raw data into JS | `recorded responses > Verisign: follows the referral to MarkMonitor ...` | The same `google.com` fields from RDAP: dates, statuses, nameservers, registrar and registrant. |
| parseRawData: no spaces after delimiters | Not applicable | Text parsing. |
| parseRawData: IP Whois rawData when multiple records exist | `ip > RIPE: IPv4 and IPv6` | RDAP returns the most specific network as one object. |
| real lookups | `recorded responses > Verisign ...` | |
| Geektools output with indented values and HTML entities | Not applicable | A third-party WHOIS proxy. |

## Known upstream issues

| Issue | Test |
| --- | --- |
| node-rdap sends Unicode domain names as typed and converts only the TLD, so `münchen.com` is requested as `domain/münchen.com`, which registries reject. | `names > sends Unicode names in A-labels ...`, oracle `a Unicode name is sent in A-labels ...` |
| node-rdap picks the first bootstrap prefix that contains an address. RFC 9224 section 5.1 requires the longest match. IANA's current files have no overlapping prefixes, so it shows only with a custom bootstrap or a future file. | `ip > picks the registry by the longest matching prefix, whatever the order` |
| node-rdap uses the first URL of a bootstrap service, even when it is `http` and `https` is listed second. RFC 9224 section 3 says to prefer `https`. | `bootstrap cache > prefers an https URL, uses an http-only one, and skips services without a URL` |
| node-rdap caches a service with an empty URL and then reports no server. | `bootstrap cache > prefers an https URL, uses an http-only one, and skips services without a URL` |
| node-rdap's timeout and cache lifetime are process-wide (`configure`), and a lookup can't be cancelled. | `cancellation` tests, `bootstrap cache > keeps a separate cache for each fetch function` |
| node-rdap 0.x resolved `ip()` and `autnum()` with the RDAP error body when the registry answered with an error status. | `ip > rejects an address with no record with NotFoundError`, `responses > rejects an HTTP error ...` |
| node-rdap finds no server for an IPv4-mapped IPv6 address and rejects a prefix. | `ip > sends IPv6 as RFC 5952 recommends and an IPv4-mapped address as IPv4`, `ip > looks up a prefix` |
| node-rdap doesn't follow the registrar referral, so a `.com` lookup has no registrant. | `recorded responses > Verisign: follows the referral ...`, `referrals` tests |
| whois-json joins repeated keys into one space-separated string (`nameServer`, `domainStatus`) and merges multiple IP records into one object. | `recorded responses` tests check arrays. |
| whoiser and whois-json return dates as the registry's text (`14-Feb-1999`, `2011-Mar-22`), and a date without a time zone depends on the parser. | `normalization > reads dates without a time zone as UTC, and skips unreadable dates` |
| whoiser fails on `.de` names with an umlaut (issue #93). | `names > sends Unicode names in A-labels ...` |

The upstream issue trackers could not be read from this environment (GitHub's pages and API are blocked for repositories outside the project), so these come from the libraries' changelogs, their source, and their test comments.
