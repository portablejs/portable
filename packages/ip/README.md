# @portable/ip

Parses, formats, compares and classifies IPv4 and IPv6 addresses and CIDR blocks. Runs in browsers, Cloudflare Workers, Node 24+, Bun, and Deno.

Replaces [ip](https://www.npmjs.com/package/ip), [ipaddr.js](https://www.npmjs.com/package/ipaddr.js), [is-ip](https://www.npmjs.com/package/is-ip), [ip-cidr](https://www.npmjs.com/package/ip-cidr), [cidr-tools](https://www.npmjs.com/package/cidr-tools) and [ip-range-check](https://www.npmjs.com/package/ip-range-check) for parsing, validation, CIDR matching and classification.

```sh
npm install @portable/ip
```

```ts
import * as Ip from '@portable/ip';

const address = Ip.unmap(request.headers.get('cf-connecting-ip')!);
if (Ip.range(address) !== 'unicast') {
  throw new Error('Refusing to fetch an internal address.');
}

Ip.format('2001:0DB8:0:0:0:0:0:1'); // '2001:db8::1'
Ip.contains('10.0.0.0/8', '10.1.2.3'); // true
Ip.reverseName('192.0.2.1'); // '1.2.0.192.in-addr.arpa'
```

## API

Every function that takes an address accepts an `Address` or a string, which it parses with `parse`.

```ts
type Address =
  | { version: 4; bytes: Uint8Array }
  | { version: 6; bytes: Uint8Array; zone?: string | undefined };
type Cidr = { address: Address; prefix: number };
```

`bytes` is the address in network order: 4 bytes for IPv4, 16 for IPv6. `zone` is the part after `%` in `fe80::1%eth0`.

| Function | Returns |
| --- | --- |
| `parse(text)` | An `Address`. Throws `InvalidInputError` for anything else. |
| `canParse(text, { version })` | Whether `parse` accepts `text`, optionally only for IPv4 or IPv6. Returns `false` for a non-string. |
| `format(address)` | Text: dotted decimal for IPv4, RFC 5952 for IPv6, with `%zone` if present. |
| `fromBytes(bytes)` | An `Address` built from a copy of 4 or 16 bytes. Throws `InvalidInputError` for any other length. |
| `compare(a, b)` | A negative number, zero or a positive number: IPv4 before IPv6, then by bytes, then by zone. Pass it to `Array.prototype.sort`. |
| `unmap(address)` | The IPv4 address inside an IPv4-mapped address (`::ffff:192.0.2.1`), and any other address unchanged. |
| `toIpv6(address)` | The IPv4-mapped form of an IPv4 address, and an IPv6 address unchanged. |
| `reverseName(address)` | The PTR lookup name under `in-addr.arpa` or `ip6.arpa`. |
| `parseCidr(text)` | A `Cidr` with the host bits of its address cleared. Throws `InvalidInputError` for malformed text, a zone, or a prefix out of range. |
| `formatCidr(cidr)` | `address/prefix` text. |
| `contains(cidr, address)` | Whether the block contains the address. Throws `RangeError` for a `Cidr` object whose prefix isn't an integer from 0 to 32 or 128. |
| `range(address)` | The name of the special-purpose block the address is in (below), or `'unicast'`. |

### Strict parsing

`parse` accepts IPv4 only as four decimal numbers from 0 to 255 without leading zeros. `inet_aton` reads `0177.0.0.1` as octal (127.0.0.1), `0x7f.1` as hex, `2130706433` as an integer and `127.1` as two parts, while other parsers read `0177` as decimal 177 or reject it. CVE-2023-42282 and CVE-2024-29415 let `127.1` and `0x7f.1` pass `ip`'s public-address check because the check read them one way and the network stack read them another. `parse` throws `InvalidInputError` for those spellings, so treat a parse error as a refusal.

The WHATWG `URL` parser converts those spellings to dotted decimal, so `new URL('http://0x7f.1/').hostname` is `'127.0.0.1'`. Parse the `hostname` of a `URL`, after removing the brackets around an IPv6 host, rather than the raw text.

IPv6 addresses follow RFC 4291: one to four hex digits per group, at most one `::`, which replaces at least one group, an optional dotted IPv4 address in the last 32 bits (also without leading zeros), and an optional zone of letters, digits, `.`, `_`, `~` and `-`.

### Ranges

`range` uses the block names of the IANA IPv4 and IPv6 Special-Purpose Address Registries. Check `unmap(address)` rather than `address` when the address may be IPv4-mapped, because `range('::ffff:127.0.0.1')` returns `'ipv4Mapped'`, not `'loopback'`. To refuse internal destinations, allow only `'unicast'`.

| Range | IPv4 | IPv6 |
| --- | --- | --- |
| `thisNetwork` | `0.0.0.0/8` | |
| `unspecified` | | `::/128` |
| `loopback` | `127.0.0.0/8` | `::1/128` |
| `private` | `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16` | |
| `uniqueLocal` | | `fc00::/7` |
| `sharedAddressSpace` | `100.64.0.0/10` | |
| `linkLocal` | `169.254.0.0/16` | `fe80::/10` |
| `deprecatedSiteLocal` | | `fec0::/10` |
| `ietfProtocolAssignments` | `192.0.0.0/24` | `2001::/23` |
| `documentation` | `192.0.2.0/24`, `198.51.100.0/24`, `203.0.113.0/24` | `2001:db8::/32`, `3fff::/20` |
| `benchmarking` | `198.18.0.0/15` | `2001:2::/48` |
| `as112` | `192.31.196.0/24`, `192.175.48.0/24` | `2001:4:112::/48`, `2620:4f:8000::/48` |
| `amt` | `192.52.193.0/24` | `2001:3::/32` |
| `6to4RelayAnycast` | `192.88.99.0/24` | |
| `6to4` | | `2002::/16` |
| `teredo` | | `2001::/32` |
| `ipv4Mapped` | | `::ffff:0:0/96` |
| `ipv4Translated` | | `::ffff:0:0:0/96` |
| `ipv4Ipv6Translation` | | `64:ff9b::/96`, `64:ff9b:1::/48` |
| `discard` | | `100::/64` |
| `dummy` | | `100:0:0:1::/64` |
| `deprecatedOrchid` | | `2001:10::/28` |
| `orchidV2` | | `2001:20::/28` |
| `droneRemoteIdProtocolEntityTags` | | `2001:30::/28` |
| `segmentRouting` | | `5f00::/16` |
| `multicast` | `224.0.0.0/4` | `ff00::/8` |
| `broadcast` | `255.255.255.255/32` | |
| `reserved` | `240.0.0.0/4` | everything outside `2000::/3` not named above |
| `unicast` | every other address | every other address in `2000::/3` |

When blocks overlap, `range` returns the most specific one, so `2001:2::1` is `benchmarking`, not `ietfProtocolAssignments`.

### IPv4-mapped addresses

A dual-stack socket reports an IPv4 client as `::ffff:192.0.2.1`. `contains` treats the two forms as one address, as Node's `BlockList` does, so `Ip.contains('127.0.0.0/8', '::ffff:7f00:1')` is `true`. `compare`, `range` and `reverseName` treat them as different addresses, so call `unmap` first. `format` writes mapped addresses in mixed notation, `::ffff:192.0.2.1`, as RFC 5952 section 5 recommends.

`::192.0.2.1` is an IPv4-compatible address, deprecated by RFC 4291, and is not treated as mapped. Its range is `'reserved'`.

## Types

| Type | Description |
| --- | --- |
| `Ip.Address` | `{ version, bytes, zone? }`, an IPv4 or IPv6 address with its bytes in network order. |
| `Ip.Cidr` | `{ address, prefix }`, a network address and its prefix length. |
| `Ip.Range` | The name of the special-purpose block an address belongs to, from the IANA registries. |

## Why use this over ip or ipaddr.js

ip's `isPublic` and `isPrivate` accepted octal, hex and short IPv4 spellings and misread them (CVE-2023-42282 and CVE-2024-29415). ip is unmaintained and needs `Buffer` and `os`. ipaddr.js parses those same spellings by default and its `isValid` accepts them.

- Parsing eight mixed addresses took about 1.3 µs, 12 times faster than ipaddr.js and 2.3 times faster than Node's `net.isIP`, which only validates.
- Parsing an address and checking it against a CIDR block was 11 times faster than ipaddr.js and 1.5 times faster than Node's `BlockList.check`.
- `contains` returns `false` for a block of the other IP version. ipaddr.js's `match` throws.
- `range` names come from the IANA registries. ipaddr.js reports `100:0:0:1::/64` and every IPv6 address outside `2000::/3` that it doesn't name, such as `4000::1`, as `unicast`, and ip's `isPrivate` misses `198.18.0.0/15`.
- The IPv4 part of an IPv6 address can't have leading zeros. ipaddr.js reads `::ffff:0177.0.0.1` as `177.0.0.1` and `0177.0.0.1` as `127.0.0.1`.
- ip and ipaddr.js do subnet arithmetic, such as broadcast and last addresses, masks from prefix lengths, and merging or excluding blocks. This package doesn't.
- ipaddr.js keeps a CIDR block's address as written, and `parseCidr` clears the host bits, so `192.168.1.134/26` formats as `192.168.1.128/26`.
- ipaddr.js accepts a zone in a CIDR block, such as `fe80::1%eth0/64`, and `parseCidr` throws for it.
- ipaddr.js's `toIPv4Address` throws for an address that isn't IPv4-mapped, and `unmap` returns it unchanged.
- ipaddr.js and ip write `::ffff:c000:201` where `format` writes `::ffff:192.0.2.1`, and Node's `inet_ntop` writes `::192.0.2.1` where `format` writes `::c000:201`.
- Node's `isIP` accepts a zone that contains `:`, and `parse` rejects it.

<!-- bench:start -->
<table>
<thead><tr><th align="left">Library</th><th align="right">Ops/s</th><th align="left">Relative</th><th></th></tr></thead>
<tbody>
<tr><th colspan="4" align="left">Parse 8 addresses</th></tr>
<tr><td>@portable/ip</td><td align="right">796,000</td><td></td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="160" height="12" alt="" /></td></tr>
<tr><td><code>node:net</code></td><td align="right">350,000</td><td>2.3× slower</td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="70" height="12" alt="" /></td></tr>
<tr><td>ip</td><td align="right">112,000</td><td>7.1× slower</td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="23" height="12" alt="" /></td></tr>
<tr><td>ipaddr.js</td><td align="right">65,100</td><td>12× slower</td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="13" height="12" alt="" /></td></tr>
<tr><th colspan="4" align="left">Check 8 addresses against a CIDR block</th></tr>
<tr><td>@portable/ip</td><td align="right">683,000</td><td></td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="160" height="12" alt="" /></td></tr>
<tr><td><code>node:net</code></td><td align="right">441,000</td><td>1.5× slower</td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="103" height="12" alt="" /></td></tr>
<tr><td>ipaddr.js</td><td align="right">63,700</td><td>11× slower</td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="15" height="12" alt="" /></td></tr>
<tr><th colspan="4" align="left">Tell public from internal addresses, 8 of them</th></tr>
<tr><td>@portable/ip</td><td align="right">517,000</td><td></td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="160" height="12" alt="" /></td></tr>
<tr><td>ip</td><td align="right">196,000</td><td>2.6× slower</td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="61" height="12" alt="" /></td></tr>
<tr><td>ipaddr.js</td><td align="right">46,700</td><td>11× slower</td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="14" height="12" alt="" /></td></tr>
</tbody>
</table>

Operations per second from `pnpm bench`, higher is better, in Node 24.22.0, on Intel(R) Xeon(R) Processor @ 2.10GHz (4 cores). Each benchmark lists only the libraries that can do the same work, fastest first. The relative speed compares each library with @portable/ip, and the bars are scaled to the fastest library.

| Library | Version | Minified and gzipped | Runtime dependencies | Node built-ins | TypeScript types |
| --- | --- | ---: | ---: | --- | --- |
| @portable/ip | – | 2.4 kB | 2 | none | included |
| ipaddr.js | 2.5.0 | 4.1 kB | 0 | none | included |
| ip | 2.0.1 | 2.6 kB | 0 | `buffer`, `os` | `@types/ip` |
| `node:net` | – | built in | – | Node only | – |

Sizes cover the imports in the usage example, or the equivalent imports of each library, bundled for the browser by `scripts/bundle-size.ts`. Runtime dependencies count every package installed with the published package. A library that uses Node built-ins needs polyfills in a browser and the `nodejs_compat` flag in Cloudflare Workers.
<!-- bench:end -->
