# Test parity

Upstream suites: [ipaddr.js `test/ipaddr.test.js`](https://github.com/whitequark/ipaddr.js/blob/main/test/ipaddr.test.js) (main branch, after 2.5.0), [ip 2.0.1 `test/api-test.js`](https://github.com/indutny/node-ip/blob/main/test/api-test.js) and [is-ip `test.js`](https://github.com/sindresorhus/is-ip/blob/main/test.js). Tests are in `ip.conformance.ts` unless noted. No fixtures are copied.

The oracle tests in `ip.oracle.test.ts` run on 2,000 random addresses, each written five ways, and on 5,000 random strings. They compare `canParse` with `net.isIP`, and `parse`, `format`, `contains` and `range` with ipaddr.js 2.5.0. They also compare `format` with `net.SocketAddress` and `contains` with `net.BlockList`.

ip-cidr, cidr-tools and ip-range-check are mostly subnet arithmetic (ranges, merging, excluding, expanding), which this package leaves out. Their contains cases are the same as ipaddr.js's and ip's.

## ipaddr.js

| Upstream test | Covered by | Notes |
| --- | --- | --- |
| should define main classes | skipped | No classes. |
| can construct IPv4 from octets | `ipaddr.js > builds an IPv4 address from bytes` | |
| refuses to construct invalid IPv4 | `ipaddr.js > rejects bytes that are not 4 or 16 long` | A `Uint8Array` can't hold 300. |
| converts IPv4 to string correctly | `ipaddr.js > formats IPv4` | |
| converts IPv4 CIDR to string correctly | `ipaddr.js > formats an IPv4 CIDR block` | |
| returns correct kind for IPv4 | `ipaddr.js > reports the version` | |
| allows to access IPv4 octets | `ipaddr.js > exposes IPv4 bytes` | |
| checks IPv4 address format | `ipaddr.js > accepts only four-part decimal IPv4` | `isIPv4` checks only the shape, but this package has one strict check. |
| validates IPv4 addresses | `ipaddr.js > accepts only four-part decimal IPv4` | `192.168.007.0xa` is invalid here. |
| validates IPv4 addresses in CIDR notation | `ipaddr.js > rejects malformed CIDR text` | |
| parses IPv4 in several weird formats | `ipaddr.js > rejects the octal, hex, integer and short IPv4 forms` | Deliberate: every one throws. See the README. |
| barfs at invalid IPv4 | `ipaddr.js > rejects malformed IPv4` | |
| matches IPv4 CIDR correctly | `ipaddr.js > matches IPv4 CIDR blocks given as objects` | |
| rejects invalid IPv4 CIDR prefix lengths in match | `ipaddr.js > rejects an invalid prefix length in a CIDR object` | `RangeError`. |
| parses CIDR reversible | `ipaddr.js > formats a parsed CIDR block with host bits cleared` | Deliberate: host bits are cleared, and a zone is rejected. |
| parses IPv4 CIDR correctly | `ipaddr.js > matches IPv4 CIDR blocks given as text`, `rejects malformed CIDR text` | |
| detects reserved IPv4 networks | `ipaddr.js > names the special-purpose IPv4 blocks` | IANA names: `thisNetwork` for `0.0.0.0/8`, `sharedAddressSpace` for `100.64.0.0/10`. |
| checks the conventional IPv4 address format | `ipaddr.js > accepts only four-part decimal IPv4` | |
| checks the conventional IPv4 CIDR format | `ipaddr.js > rejects malformed CIDR text` | |
| refuses to construct IPv4 address with trailing and leading zeros | `ipaddr.js > accepts only four-part decimal IPv4` | |
| can construct IPv6 from 16bit parts | `ipaddr.js > builds an IPv6 address from bytes` | Bytes only, so the test builds them from 16-bit words. |
| rejects invalid IPv6 CIDR prefix lengths in match | `ipaddr.js > rejects an invalid prefix length in a CIDR object` | |
| can construct IPv6 from 8bit parts | `ipaddr.js > builds an IPv6 address from bytes` | |
| refuses to construct invalid IPv6 | `ipaddr.js > rejects bytes that are not 4 or 16 long` | |
| converts IPv6 to string correctly | `ipaddr.js > formats IPv6 as RFC 5952 says` | `toNormalizedString` and `toFixedLengthString` have no equivalent. |
| converts IPv6 CIDR to string correctly | `ipaddr.js > formats IPv6 CIDR blocks` | Host bits are cleared. |
| converts IPv6 to RFC 5952 string correctly | `ipaddr.js > formats IPv6 as RFC 5952 says` | |
| returns IPv6 zoneIndex | `ipaddr.js > keeps the zone index` | |
| compresses a trailing zero run when a zoneIndex is present | `ipaddr.js > compresses a trailing zero run before a zone index` | |
| returns IPv6 zoneIndex for IPv4-mapped IPv6 addresses | `ipaddr.js > keeps the zone index of an IPv4-mapped address` | Deliberate: mixed notation, `::ffff:192.168.1.1%eth0`. |
| returns correct kind for IPv6 | `ipaddr.js > reports the version` | |
| allows to access IPv6 address parts | `ipaddr.js > exposes IPv6 bytes` | |
| checks IPv6 address format | `ipaddr.js > validates IPv6` | |
| validates IPv6 addresses | `ipaddr.js > validates IPv6` | |
| rejects IPv6 parts longer than four hexadecimal digits | `ipaddr.js > validates IPv6` | |
| rejects compression of zero IPv6 parts | `ipaddr.js > validates IPv6` | |
| does not reject compression of exactly one IPv6 part | `ipaddr.js > validates IPv6` | |
| validates IPv6 addresses in CIDR notation | `ipaddr.js > rejects malformed CIDR text` | Deliberate: `2001:db8:F53A::1%z/64` is rejected. |
| parses IPv6 in different formats | `ipaddr.js > parses IPv6 in different notations` | Deliberate: `::8.8.8.8` is `::808:808`, not `::ffff:808:808`. |
| barfs at invalid IPv6 | `ipaddr.js > rejects malformed IPv6 with InvalidInputError` | |
| throws a descriptive error when parsing a malformed IPv6 address | `ipaddr.js > rejects malformed IPv6 with InvalidInputError` | The error class is the contract, not the message. |
| matches IPv6 CIDR correctly | `ipaddr.js > matches IPv6 CIDR blocks` | |
| parses IPv6 CIDR correctly | `ipaddr.js > matches IPv6 CIDR blocks`, `rejects malformed CIDR text` | |
| converts between IPv4-mapped IPv6 addresses and IPv4 addresses | `ipaddr.js > converts between IPv4 and IPv4-mapped IPv6` | |
| refuses to convert non-IPv4-mapped IPv6 address to IPv4 address | `ipaddr.js > leaves an address that is not IPv4-mapped unchanged` | Deliberate: `unmap` returns it unchanged. |
| detects reserved IPv6 networks | `ipaddr.js > names the special-purpose IPv6 blocks` | IANA names: `documentation`, `ietfProtocolAssignments`, `as112`, `orchidV2`, `ipv4Translated`, `ipv4Ipv6Translation`. |
| is able to determine IP address type | `ipaddr.js > reports the version` | |
| throws an error if tried to parse an invalid address | `ipaddr.js > rejects malformed IPv6 with InvalidInputError` | |
| correctly processes IPv4-mapped addresses | `ipaddr.js > unmaps IPv4-mapped addresses` | `::8.8.8.8` stays IPv6. |
| correctly converts IPv6 and IPv4 addresses to byte arrays | `ipaddr.js > returns bytes in network order` | |
| correctly parses 1 as an IPv4 address | `ipaddr.js > rejects the octal, hex, integer and short IPv4 forms` | Deliberate: `1` is invalid. |
| correctly detects IPv4 and IPv6 CIDR addresses | `ipaddr.js > parses the version from CIDR text` | |
| does not consider a very large or very small number a valid IP address | `ipaddr.js > rejects malformed IPv4` | |
| does not hang on ::8:8:8:8:8:8:8:8:8 | `ipaddr.js > validates IPv6` | The parser is a single pass, so there is no regex to backtrack. |
| subnetMatch does not fail on empty range | skipped | No `subnetMatch`. `blocks.some((cidr) => Ip.contains(cidr, address))` on an empty list is `false`. |
| subnetMatch returns default subnet on empty range | skipped | Same. |
| subnetMatch does not fail on IPv4 when looking for IPv6 | `ipaddr.js > matches an address only against blocks of its own version` | |
| subnetMatch does not fail on IPv6 when looking for IPv4 | `ipaddr.js > matches an address only against blocks of its own version` | |
| subnetMatch can use a hybrid IPv4/IPv6 range list | `ipaddr.js > matches an address only against blocks of its own version` | |
| subnetMatch rejects invalid CIDR prefix lengths | `ipaddr.js > rejects an invalid prefix length in a CIDR object` | |
| is able to determine IP address type from byte array input | `ipaddr.js > builds either version from bytes` | |
| prefixLengthFromSubnetMask returns proper CIDR notation for standard IPv4 masks | skipped | No dotted subnet masks. CIDR prefixes replace them. |
| prefixLengthFromSubnetMask returns proper CIDR notation for standard IPv6 masks | skipped | Same. |
| subnetMaskFromPrefixLength returns correct IPv4 subnet mask given prefix length | skipped | Same. |
| subnetMaskFromPrefixLength returns correct IPv6 subnet mask given prefix length | skipped | Same. |
| subnetMaskFromPrefixLength throws on an out-of-range or non-numeric prefix length | skipped | Same. |
| broadcastAddressFromCIDR returns correct IPv4 broadcast address | skipped | No subnet arithmetic. |
| networkAddressFromCIDR returns correct IPv4 network address | `ipaddr.js > gives the network address of a CIDR block` | |
| networkAddressFromCIDR returns correct IPv6 network address | `ipaddr.js > gives the network address of a CIDR block` | |
| broadcastAddressFromCIDR returns correct IPv6 broadcast address | skipped | No subnet arithmetic. |

## ip

| Upstream test | Covered by | Notes |
| --- | --- | --- |
| toBuffer()/toString(): should convert to buffer IPv4 address | `ip > converts IPv4 to bytes and back` | |
| should convert to buffer IPv4 address in-place | `ip > reads an address out of a larger buffer` | `fromBytes` on a `subarray`. There is no write-at-offset. |
| should convert to buffer IPv6 address | `ip > converts IPv6 to bytes and back` | |
| should convert to buffer IPv6 address in-place | `ip > reads an address out of a larger buffer` | |
| should convert to buffer IPv6 mapped IPv4 address | `ip > converts IPv6 with an embedded IPv4 address` | Deliberate: mapped addresses format as `::ffff:127.0.0.1`. |
| fromPrefixLen(): should create IPv4 mask, IPv6 mask, IPv6 mask explicitly | skipped | No dotted subnet masks. |
| not(): should reverse bits in address | skipped | No bitwise operations. |
| or(): ipv4, ipv6, mixed | skipped | No bitwise operations. |
| mask(): should mask bits in address | `ip > masks an address with a CIDR prefix` | With a prefix instead of a dotted mask. |
| mask(): should not leak data | `ip > masks an address with a CIDR prefix` | |
| subnet(): network address | `ip > computes the network of a subnet and what it contains` | |
| subnet(): first address, last address, broadcast address, number of addresses, number of hosts, subnet mask, mask length | skipped | No subnet arithmetic. `parseCidr(text).prefix` is the mask length. |
| subnet(): contains / does not contain an address | `ip > computes the network of a subnet and what it contains` | |
| subnet() with mask length 32 and 31 | `ip > computes the network of a subnet and what it contains` | Only containment. First and last addresses are skipped as above. |
| cidrSubnet(): every test | `ip > computes the network of a subnet and what it contains` | As for `subnet()`. |
| cidr(): should mask address in CIDR notation | `ip > masks CIDR text to its network` | |
| isEqual(): should check if addresses are equal | `ip > compares addresses, treating IPv4-mapped IPv6 as IPv4 after unmap` | Deliberate: `127.0.0.1` is not `::7f00:1`, which is IPv4-compatible, not mapped. |
| normalizeIpv4(): every test | `ip > accepts only the dotted-decimal IPv4 form` | Deliberate: only `127.0.0.1` is accepted, and every other spelling throws. |
| isPrivate(): every test | `ip > classifies private and internal addresses` | `range` returns the block's name, and mapped addresses are checked after `unmap`. |
| loopback(): every test | skipped | Returns constants. |
| isLoopback(): 127.0.0.1, 127.8.8.8, 8.8.8.8, ::1 | `ip > detects loopback addresses` | |
| isLoopback(): fe80::1, :: | `ip > detects loopback addresses` | Deliberate: `linkLocal` and `unspecified`. |
| address(): every test | skipped | Reads the machine's network interfaces, which no web runtime exposes. |
| toLong(): should respond with a int | skipped | `DataView.getUint32` covers it. See the README. |
| fromLong(): should repond with ipv4 address | skipped | `DataView.setUint32` and `fromBytes` cover it. |
| should return true for octal, hexadecimal and long representations (7 tests) | `ip > rejects octal, hex and integer loopback forms instead of guessing` | Deliberate: these throw. |
| should return false for "192.168.1.1" | `ip > detects loopback addresses` | |

## is-ip

| Upstream test | Covered by | Notes |
| --- | --- | --- |
| isIP | `is-ip > accepts IPv4 and IPv6` | |
| isIPv6 | `is-ip > accepts only IPv6 with version 6` | |
| isIPv4 | `is-ip > accepts only IPv4 with version 4` | |
| ipVersion | `is-ip > reports the version` | |

## Known upstream issues

| Issue | Test | What we do |
| --- | --- | --- |
| ip CVE-2023-42282: `isPublic('0x7f.1')` returned `true` | `known upstream issues > CVE-2023-42282: a hex or short loopback address is not accepted as public` | Hex and short forms throw. |
| ip CVE-2024-29415: `127.1`, `01200034567`, `012.1.2.3`, `000:0:0000::01` and `::fFFf:127.0.0.1` classified as public | `known upstream issues > CVE-2024-29415: octal, integer and odd IPv6 spellings of internal addresses` | IPv4 forms throw. The IPv6 forms parse correctly and classify as `loopback` and `ipv4Mapped`. |
| ip #162: `017700000001` passes as public | `known upstream issues > CVE-2024-29415: ...` | Throws. |
| ip #160: `0` passes as public | `known upstream issues > CVE-2023-42282: ...` | Throws. `0.0.0.0` is `thisNetwork`. |
| ip #122: private IPv4-mapped addresses match only in dotted form | `known upstream issues > an IPv4-mapped address matches an IPv4 block in any notation` | `contains` and `unmap` work on bytes. |
| ip #159: `isV4Format('999.999.999.999')` is `true`; ip #135: `isV6Format` accepts IPv4 | `known upstream issues > 999.999.999.999 is not an address, and IPv4 is not IPv6` | |
| ip #134: `isPrivate` misses `198.18.0.0/15` | `known upstream issues > 198.18.0.0/15 is benchmarking, not public` | |
| ipaddr.js #213: `::ffff:0177.0.0.1` reads as `177.0.0.1` while `0177.0.0.1` reads as `127.0.0.1` | `known upstream issues > the IPv4 part of an IPv6 address may not have leading zeros` | Both throw. |
| ipaddr.js parses `::8.8.8.8` as `::ffff:8.8.8.8` | `known upstream issues > ::a.b.c.d is IPv4-compatible, not IPv4-mapped` | Bytes as written, with range `reserved`. |
| ipaddr.js #165, #162: `match` throws for an address of the other version | `known upstream issues > matching across versions returns false instead of throwing` | |
| ipaddr.js #179, #182: `1.1` and other short forms are valid | `ipaddr.js > rejects the octal, hex, integer and short IPv4 forms` | |
| ipaddr.js reports IPv6 outside `2000::/3`, such as `4000::1`, as `unicast` | `range > names every IANA special-purpose IPv6 block` | `reserved`. |

## Benchmarks

ipaddr.js and ip have no benchmarks. `ip.bench.ts` compares parsing with ipaddr.js and `net.isIP`, and parsing plus a CIDR check with ipaddr.js and `net.BlockList`, and fails if any of them is more than 25% faster.
