# Test parity

Upstream suite: [dns-packet 5.6.1 `test.js`](https://github.com/mafintosh/dns-packet/blob/master/test.js) (MIT, Mathias Buus). Every case is covered in `dns-packet.conformance.ts` with this package's API. The "unpack" bytes and the RFC 4034 NSEC sample come from that file.

`fixtures/responses.json` holds 48 real responses captured from Cloudflare (`cloudflare-dns.com`) and Google (`dns.google`) over DNS-over-HTTPS, with EDNS and the DO bit set. They include A, AAAA, MX, TXT, NS, SOA, CAA, SRV, PTR, CNAME chains, DNSKEY, DS, RRSIG, NSEC, NSEC3, TLSA, SSHFP, NAPTR, HTTPS, HINFO (RFC 8482 ANY answers) and NXDOMAIN responses, most with compressed names.

## Upstream tests

Upstream's `testEncoder` helper encodes a value, decodes it, re-encodes it, and also checks `encode.bytes`, `encodingLength` and encoding into a caller's buffer at an offset. Our `roundTrip` helper checks that the decoded packet encodes to the same bytes, and that compressed and TCP-framed encodings decode to the same packet. `encode.bytes`, `encodingLength` and the buffer-and-offset arguments aren't part of this API, so those assertions have no counterpart.

| Upstream test | Covered by | Notes |
| --- | --- | --- |
| unknown | `dns-packet cases > unknown` | Unknown types are named `TYPE<n>` (RFC 3597), not `UNKNOWN_<n>`. |
| txt | `dns-packet cases > txt` | |
| txt-scalar-string | `dns-packet cases > txt with one string` | TXT data is always an array, so a single string is `['hi']`. |
| txt-scalar-buffer | `dns-packet cases > txt with one string` | |
| txt-invalid-data | `dns-packet cases > txt with invalid data` | Also rejects a bare string and a number inside the array. |
| null | `dns-packet cases > null` | |
| hinfo | `dns-packet cases > hinfo` | |
| ptr, cname, dname, ns | `dns-packet cases > ptr, cname, dname and ns` | |
| srv | `dns-packet cases > srv` | Priority and weight are required, so the default-zero case is gone. |
| caa | `dns-packet cases > caa` | `flags` is the whole byte. There is no separate `issuerCritical`, which upstream could set out of step with `flags`. |
| mx | `dns-packet cases > mx` | Preference is required. |
| soa | `dns-packet cases > soa` | |
| sshfp | `dns-packet cases > sshfp` | The fingerprint is a `Uint8Array`, and `hash` is `fingerprintType` as in RFC 4255. |
| a, aaaa | `dns-packet cases > a and aaaa` | |
| query | `dns-packet cases > query` | |
| response | `dns-packet cases > response` | `flags` is an object of booleans. |
| rcode | `dns-packet cases > rcode and opcode` | Tested through the header bytes instead of the code tables, which are internal. |
| name_encoding | `dns-packet cases > name encoding` | Escaped dots work in every name, not only in mailbox names. |
| name_decoding | `dns-packet cases > name decoding` | Upstream's error messages are replaced by `TruncatedError` and `InvalidInputError`. |
| stream | `dns-packet cases > stream` | `streamEncode` is `encode(packet, { framing: 'tcp' })`. |
| opt | `dns-packet cases > opt` | Decoded options have the same shape as the encoded ones. |
| dnskey | `dns-packet cases > dnskey` | |
| rrsig | `dns-packet cases > rrsig` | |
| rrp | `dns-packet cases > rp` | `mbox` and `txt` are required, and the root `'.'` means none. |
| nsec | `dns-packet cases > nsec` | `rrtypes` is `types`. |
| nsec3 | `dns-packet cases > nsec3` | `nextDomain` is `nextHashedOwner`, the RFC 5155 name. |
| ds | `dns-packet cases > ds` | Also covers CDS. |
| naptr | `dns-packet cases > naptr` | |
| tlsa | `dns-packet cases > tlsa` | |
| unpack | `dns-packet cases > unpack` | `streamDecode` is `decode(bytes, { framing: 'tcp' })`. |
| optioncodes | `dns-packet cases > option codes` | Tested through OPT records. Unnamed codes are `OPTION<n>`, and an unknown name throws instead of returning -1. |

## Known upstream issues

We couldn't reach GitHub's issue tracker while writing this package, so this list comes from reading dns-packet's source, its changelog and commit history, and its CVE. Each item has a test under `known upstream issues` in `dns-packet.conformance.ts`, and the oracle tests normalize or leave out the affected input instead of locking the upstream behavior in.

| Upstream behavior | Our behavior | Test |
| --- | --- | --- |
| A label over 63 bytes is written with its length byte overflowing into the pointer bits. | `InvalidInputError` | a label over 63 bytes is rejected |
| A TXT string over 255 bytes is written with a truncated length byte. | `InvalidInputError` | a TXT string over 255 bytes is rejected |
| `a..b` writes a zero-length label, which ends the name early. | `InvalidInputError` | an empty label is rejected |
| CVE-2021-23386: before 5.2.2, `encodingLength` and `encode` disagreed for some names, and `Buffer.allocUnsafe` sent uninitialized memory. | Names are checked before any bytes are allocated, and buffers are zero-filled. | an invalid name throws before any bytes are produced |
| The mDNS QU bit in a question decodes as class `UNKNOWN_32769`. | `qu: true` and class `IN` | the mDNS QU bit is decoded as qu |
| RDLENGTH is ignored for most types: an A record with RDLENGTH 5 reads 4 bytes and leaves the decoder out of step. | `InvalidInputError` when the data doesn't fill RDLENGTH exactly | RDLENGTH is checked against the record data |
| IPv6 addresses compress the first run of zero groups, not the longest, and IPv4-mapped addresses decode as `::ffff:c000:201`. | RFC 5952 formatting, with mapped addresses as `::ffff:192.0.2.1` | IPv6 addresses are formatted as RFC 5952 recommends |
| Invalid IPv4 text such as `300.1.1.1` is encoded without a check, and `010.0.0.1` is encoded as 10.0.0.1, although `inet_aton` reads it as 8.0.0.1. | `InvalidInputError`, from the `Ip.parse` rules of `@portable/ip` | invalid IP addresses are rejected |
| An unknown type or class name, such as `AAA`, is encoded as 0. | `InvalidInputError` | unknown type and class names are rejected |
| `encode` adds empty sections to the caller's packet and overwrites CAA `flags`. | Input isn't modified. | encode does not modify its input |
| `streamDecode` throws a `RangeError` on fewer than 2 bytes. | `TruncatedError` | TCP framing with fewer than 2 bytes throws TruncatedError |
| SSHFP fingerprint types other than 1 and 2 can't be encoded, and decode to an empty fingerprint. | Any fingerprint type round-trips. | SSHFP records with any fingerprint type round-trip |
| In mailbox names, an escaped dot after the first unescaped label is dropped. | Escapes work in every label. | escaped dots work in any label |
| Outside mailbox names, a label that contains `.` decodes to the same text as two labels. | Decoded labels escape `.` and `\`. | a label containing a dot or backslash decodes with escapes |
| CLIENT_SUBNET sends the address bits past the source prefix, which RFC 7871 requires to be zero. | Bits past the prefix are cleared. | CLIENT_SUBNET clears address bits past the source prefix |
| EDNS option lengths aren't checked against the option's fields, so TCP_KEEPALIVE and CLIENT_SUBNET read past them. | `InvalidInputError` | EDNS options with a bad length are rejected |
| An OPT record with a name other than the root is decoded. | `InvalidInputError` both ways | an OPT record must have the root as its name |

## Oracle tests

`dns-packet.oracle.test.ts` runs dns-packet 5.6.1 next to this package. It translates dns-packet's object shape into ours (field renames, `Buffer` to `Uint8Array`, `UNKNOWN_<n>` to `TYPE<n>`) and canonicalizes IPv6 text on both sides, so the RFC 5952 difference above isn't compared.

- For each captured response, both libraries decode to the same packet, and re-encoding gives the same bytes.
- For a synthetic corpus covering every record type with a codec, every EDNS option with fields, mDNS bits and non-IN classes, dns-packet decodes our output to the same packet, and re-encodes it to the same bytes. It also decodes our compressed output to the same packet.
- TCP-framed messages match `streamEncode` and `streamDecode`, including when the captured responses arrive in random chunks.

`dns-packet.fuzz.oracle.test.ts` decodes mutated copies of the captured responses with both libraries and compares the packets whenever both decode one. It leaves out a packet if one of its names needs an escape or one of its questions has the QU bit set, because the two libraries decode those packets differently on purpose (see the table above).

## Benchmarks

dns-packet has no benchmarks. `dns-packet.bench.ts` compares decoding and encoding the 48 captured responses, and encoding a typical DNS-over-HTTPS query.
