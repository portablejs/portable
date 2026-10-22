# @portable/ip

Parses, formats, compares and classifies IPv4 and IPv6 addresses and CIDR blocks. Runs in browsers, Cloudflare Workers, Deno, Bun and Node 24+, with no dependencies.

Replaces [ip](https://www.npmjs.com/package/ip), [ipaddr.js](https://www.npmjs.com/package/ipaddr.js), [is-ip](https://www.npmjs.com/package/is-ip), [ip-cidr](https://www.npmjs.com/package/ip-cidr), [cidr-tools](https://www.npmjs.com/package/cidr-tools) and [ip-range-check](https://www.npmjs.com/package/ip-range-check) for parsing, validation, CIDR matching and classification.

```sh
npm install @portable/ip
```

```ts
import * as Ip from '@portable/ip'

const address = Ip.unmap(request.headers.get('cf-connecting-ip')!)
if (Ip.range(address) !== 'unicast') throw new Error('Refusing to fetch an internal address.')

Ip.format('2001:0DB8:0:0:0:0:0:1') // '2001:db8::1'
Ip.contains('10.0.0.0/8', '10.1.2.3') // true
Ip.reverseName('192.0.2.1') // '1.2.0.192.in-addr.arpa'
```

## API

Every function that takes an address accepts an `Address` or a string, which it parses with `parse`.

```ts
type Address =
  | { version: 4; bytes: Uint8Array }
  | { version: 6; bytes: Uint8Array; zone?: string | undefined }
type Cidr = { address: Address; prefix: number }
```

`bytes` is the address in network order: 4 bytes for IPv4, 16 for IPv6. `zone` is the part after `%` in `fe80::1%eth0`.

| Function | Returns |
| --- | --- |
| `parse(text)` | An `Address`. Throws `InvalidInputError` for anything else. |
| `canParse(text, { version })` | Whether `parse` accepts `text`, optionally only for IPv4 or IPv6. Returns `false` for a non-string. |
| `format(address)` | Text: dotted decimal for IPv4, RFC 5952 for IPv6, with `%zone` if present. |
| `fromBytes(bytes)` | An `Address` built from a copy of 4 or 16 bytes. Throws `InvalidInputError` for any other length. |
| `compare(a, b)` | A negative number, zero or a positive number: IPv4 before IPv6, then by bytes, then by zone. Fits `Array.prototype.sort`. |
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

`range` uses the block names of the IANA IPv4 and IPv6 Special-Purpose Address Registries. Check `unmap(address)` rather than `address` when the address may be IPv4-mapped, because `::ffff:127.0.0.1` returns `'ipv4Mapped'`, not `'loopback'`. To refuse internal destinations, allow only `'unicast'`.

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

When blocks overlap, `range` returns the most specific one, so `2001:db8::1` is `documentation`, not `ietfProtocolAssignments`.

### IPv4-mapped addresses

A dual-stack socket reports an IPv4 client as `::ffff:192.0.2.1`. `contains` treats the two forms as one address, as Node's `BlockList` does, so `Ip.contains('127.0.0.0/8', '::ffff:7f00:1')` is `true`. `compare`, `range` and `reverseName` treat them as different addresses, so call `unmap` first. `format` writes mapped addresses in mixed notation, `::ffff:192.0.2.1`, as RFC 5952 section 5 recommends.

`::192.0.2.1` is an IPv4-compatible address, deprecated by RFC 4291, and is not treated as mapped. Its range is `'reserved'`.

## Why use this over ip or ipaddr.js

ip's `isPublic` and `isPrivate` accepted octal, hex and short IPv4 spellings and misread them (CVE-2023-42282 and CVE-2024-29415). The package is unmaintained and needs `Buffer` and `os`. ipaddr.js parses those same spellings by default and its `isValid` accepts them.

- Parsing eight mixed addresses took about 1.3 µs, 13 times faster than ipaddr.js and 2 times faster than Node's `net.isIP`, which only validates.
- Parsing an address and checking it against a CIDR block was 12 times faster than ipaddr.js and 1.7 times faster than Node's `BlockList.check`.
- `contains` returns `false` for a block of the other IP version. ipaddr.js's `match` throws.
- `range` names come from the IANA registries. ipaddr.js reports `100:0:0:1::/64` and every IPv6 address outside `2000::/3` that it doesn't name, such as `4000::1`, as `unicast`, and ip's `isPrivate` misses `198.18.0.0/15`.
- The IPv4 part of an IPv6 address can't have leading zeros. ipaddr.js reads `::ffff:0177.0.0.1` as `177.0.0.1` and `0177.0.0.1` as `127.0.0.1`.

<!-- bench:start -->
| | @portable/ip | ipaddr.js | ip | `node:net` |
| --- | ---: | ---: | ---: | ---: |
| Parse 8 addresses | 796,000 | 65,100 | 112,000 | 350,000 |
| Check 8 addresses against a CIDR block | 683,000 | 63,700 | – | 441,000 |
| Tell public from internal addresses, 8 of them | 517,000 | 46,700 | 196,000 | – |

Operations per second from `pnpm bench`, higher is better, in Node 24.22.0, on Intel(R) Xeon(R) Processor @ 2.10GHz (4 cores). A dash means the library has no equivalent.

| | @portable/ip | ipaddr.js | ip | `node:net` |
| --- | --- | --- | --- | --- |
| Minified and gzipped | 2.2 kB | 4.1 kB | 2.6 kB | built in |
| Runtime dependencies | 0 | 0 | 0 | – |
| Node built-ins used | none | none | `buffer`, `os` | Node only |
| TypeScript types | included | included | `@types/ip` | – |
| Version compared | – | 2.5.0 | 2.0.1 | – |

Sizes cover the imports in the usage example, or the equivalent imports of each library, bundled for the browser by `scripts/bundle-size.ts`. Runtime dependencies count every package installed with the published package. A library that uses Node built-ins needs polyfills in a browser and the `nodejs_compat` flag in Cloudflare Workers.
<!-- bench:end -->

## Migrating

| Upstream | @portable/ip |
| --- | --- |
| `ipaddr.parse(text)`, `ipaddr.IPv4.parse(text)` | `Ip.parse(text)` |
| `ipaddr.isValid(text)`, `isIP(text)`, `net.isIP(text) !== 0` | `Ip.canParse(text)` |
| `isIPv4(text)`, `ipaddr.IPv4.isValidFourPartDecimal(text)` | `Ip.canParse(text, { version: 4 })` |
| `ipVersion(text)`, `addr.kind()` | `Ip.parse(text).version` |
| `addr.toString()`, `addr.toRFC5952String()`, `ip.toString(buffer)` | `Ip.format(address)` |
| `addr.toByteArray()`, `ip.toBuffer(text)` | `Ip.parse(text).bytes` |
| `ipaddr.fromByteArray(bytes)` | `Ip.fromBytes(bytes)` |
| `ipaddr.process(text)` | `Ip.unmap(text)` |
| `addr.toIPv4MappedAddress()` | `Ip.toIpv6(address)` |
| `addr.match(ipaddr.parseCIDR(cidr))`, `ipRangeCheck(ip, cidr)`, `new IPCIDR(cidr).contains(ip)`, `cidrTools.containsCidr(cidr, ip)` | `Ip.contains(cidr, ip)` |
| `ipRangeCheck(ip, [a, b])` | `[a, b].some((cidr) => Ip.contains(cidr, ip))` |
| `ipaddr.IPv4.networkAddressFromCIDR(cidr)`, `ip.cidr(cidr)` | `Ip.format(Ip.parseCidr(cidr).address)` |
| `cidrTools.normalizeCidr(cidr)` | `Ip.formatCidr(Ip.parseCidr(cidr))` |
| `addr.range()` | `Ip.range(address)`, with the names in the table above |
| `ip.isPrivate(text)` | `Ip.range(Ip.unmap(text)) !== 'unicast'` |
| `ip.isLoopback(text)` | `Ip.range(Ip.unmap(text)) === 'loopback'` |
| `ip.isEqual(a, b)` | `Ip.compare(Ip.unmap(a), Ip.unmap(b)) === 0` |
| `ip.toLong(text)` | `new DataView(Ip.parse(text).bytes.buffer).getUint32(0)` |

Subnet arithmetic (broadcast and last addresses, masks from prefix lengths, merging and excluding blocks) is not included. These differ from upstream:

- `parseCidr` clears host bits, so `192.168.1.134/26` formats as `192.168.1.128/26`. ipaddr.js keeps the address as written.
- A CIDR block can't have a zone. ipaddr.js accepts `fe80::1%eth0/64`.
- `unmap` returns a non-mapped address unchanged. ipaddr.js's `toIPv4Address` throws.
- `format` writes `::ffff:192.0.2.1` where ipaddr.js and ip write `::ffff:c000:201`, and `::c000:201` where Node's `inet_ntop` writes `::192.0.2.1`.
- A zone can't contain `:`, which Node's `isIP` accepts.
