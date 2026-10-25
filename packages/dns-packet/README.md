# @portable/dns-packet

Encodes and decodes DNS messages in wire format. Runs in browsers, Cloudflare Workers, Deno, Bun and Node 24+.

Replaces [dns-packet](https://www.npmjs.com/package/dns-packet).

```sh
npm install @portable/dns-packet
```

```ts
import * as DnsPacket from '@portable/dns-packet';

const query = DnsPacket.encode({
  id: 0,
  flags: { rd: true },
  questions: [{ name: 'example.com', type: 'A' }],
  additionals: [{ type: 'OPT', dnssecOk: true }],
});
const response = await fetch('https://cloudflare-dns.com/dns-query', {
  method: 'POST',
  headers: { 'content-type': 'application/dns-message' },
  body: query,
});
const packet = DnsPacket.decode(new Uint8Array(await response.arrayBuffer()));
for (const answer of packet.answers) {
  if (answer.type === 'A') {
    console.log(answer.data);
  }
}
```

Records are typed by `type`, so `data` narrows to the shape of that record: a string for A, AAAA, CNAME, DNAME, NS and PTR, and an object for the rest. Types without a codec here, such as SVCB and HTTPS, carry their raw RDATA as a `Uint8Array`. Unnamed types and classes are written `TYPE<n>` and `CLASS<n>`, as in RFC 3597.

Supported types: A, AAAA, CAA, CDNSKEY, CDS, CNAME, DNAME, DNSKEY, DS, HINFO, MX, NAPTR, NS, NSEC, NSEC3, NULL, OPT, PTR, RP, RRSIG, SOA, SRV, SSHFP, TLSA and TXT.

TXT strings decode as `Uint8Array`s, since TXT data is often binary or not UTF-8. Decode them with `new TextDecoder().decode(bytes)` when you know they are text. Strings passed to `encode` are written as UTF-8.

`decode` throws `DnsPacket.TruncatedError` when the message ends early and `DnsPacket.InvalidInputError` when it can't be valid, including compression loops and record data that doesn't match its length. `encode` throws `InvalidInputError` for names, addresses or fields DNS can't represent, and `UnsupportedError` for an EDNS option it has no encoder for and no `data`.

## Options

`encode(packet, options)`:

| Option | Default | Description |
| --- | --- | --- |
| `compress` | `false` | Compress repeated names with pointers. Saves space in responses. Queries rarely gain anything from it. |
| `framing` | `'none'` | `'tcp'` prefixes the message with its 2-byte length, for DNS over TCP or TLS. |

`decode(bytes, options)`:

| Option | Default | Description |
| --- | --- | --- |
| `framing` | `'none'` | `'tcp'` reads the 2-byte length first, and throws `TruncatedError` until the whole message has arrived. |

## Types

| Type | Description |
| --- | --- |
| `DnsPacket.Packet` | What `encode` takes: header fields, flags and the four record sections. |
| `DnsPacket.DecodedPacket` | What `decode` returns. Every field is present, and record data is decoded. |
| `DnsPacket.Question` | `{ name, type, class?, qu? }`. `DecodedQuestion` is its decoded form. |
| `DnsPacket.ResourceRecord` | A record to encode. `DecodedResourceRecord` is its decoded form. |
| `DnsPacket.OptRecord` | The EDNS pseudo-record (RFC 6891). `DecodedOptRecord` is its decoded form. |
| `DnsPacket.RecordData` | The `data` of each record type, keyed by type. `DecodedRecordData` is its decoded form. |
| `DnsPacket.EdnsOption` | One option of an OPT record. |
| `DnsPacket.Flags` | The header flags as booleans. |
| `DnsPacket.RecordType` | A record type name, such as `A` or `TXT`, or `TYPE` and a number for a type without a name. `UnknownType` is a type with no codec here, whose `data` is the raw RDATA. |
| `DnsPacket.RecordClass` | A class name, such as `IN`. |
| `DnsPacket.Opcode` | A header opcode name, such as `QUERY`. |
| `DnsPacket.Rcode` | A response code name, such as `NXDOMAIN`. |
| `DnsPacket.OptionCode` | An EDNS option name, such as `CLIENT_SUBNET`. |

## Why use this over dns-packet

dns-packet writes corrupt packets for some invalid input and reads past bad length fields. This package checks names, addresses and lengths in both directions, uses `Uint8Array` instead of `Buffer`, and is 6.6 kB minified and gzipped with no dependencies.

- A label over 63 bytes, a TXT string over 255 bytes or an empty label throws `InvalidInputError`. dns-packet writes the first two with overflowing length bytes, and an empty label ends the name early.
- Names are checked before any bytes are allocated, and buffers are zero-filled. dns-packet before 5.2.2 could send uninitialized memory (CVE-2021-23386).
- Each record's data must fill its RDLENGTH exactly. dns-packet ignores RDLENGTH for most types, so one bad record leaves the decoder out of step for the rest of the message.
- `encode` doesn't modify the packet you pass. dns-packet adds empty sections to it and overwrites CAA `flags`.
- Encoding a DNS-over-HTTPS query was about 3.4 times faster than dns-packet, and encoding or decoding 48 captured responses about 2 times faster.

<!-- bench:start -->
| | @portable/dns-packet | dns-packet |
| --- | ---: | ---: |
| Decode 48 captured responses | 10,000 | 4,560 |
| Encode 48 captured responses | 5,970 | 3,070 |
| Encode a DNS-over-HTTPS query | 1,820,000 | 528,000 |

Operations per second from `pnpm bench`, higher is better, in Node 24.22.0, on Intel(R) Xeon(R) Processor @ 2.10GHz (4 cores). A dash means the library has no equivalent.

| | @portable/dns-packet | dns-packet |
| --- | --- | --- |
| Minified and gzipped | 6.6 kB | 8.7 kB |
| Runtime dependencies | 0 | 1 |
| Node built-ins used | none | `buffer` |
| TypeScript types | included | `@types/dns-packet` |
| Version compared | – | 5.6.1 |

Sizes cover the imports in the usage example, or the equivalent imports of each library, bundled for the browser by `scripts/bundle-size.ts`. Runtime dependencies count every package installed with the published package. A library that uses Node built-ins needs polyfills in a browser and the `nodejs_compat` flag in Cloudflare Workers.
<!-- bench:end -->

Other differences to check when you switch:

- dns-packet compresses names by default. `encode` compresses only with `compress: true`, and inside RDATA only the names of NS, CNAME, PTR, MX and SOA records, as RFC 3597 requires.
- dns-packet's `encode(packet, buffer, offset)`, `encode.bytes` and `encodingLength` have no equivalent. `encode` returns a new `Uint8Array` of the exact size.
- dns-packet writes unnamed types and classes as `UNKNOWN_<n>`. This package writes them as `TYPE<n>` and `CLASS<n>`.
- dns-packet reads the mDNS unicast-response bit as `class: 'UNKNOWN_32769'`. This package reads it as `qu: true` with `class: 'IN'`.
- dns-packet accepts a string as TXT `data`. TXT `data` here is always an array, such as `['text']`.
- dns-packet's CAA `issuerCritical` has no equivalent. `flags` holds the whole byte, so the critical flag is `flags: 128`.
- dns-packet exports `rcodes`, `opcodes`, `types`, `classes` and `optioncodes`. This package exports none of them: packets use names such as `'NXDOMAIN'`, and unnamed values are written `RCODE<n>`, `OPCODE<n>` and `OPTION<n>`.
- dns-packet encodes an unknown type, class, opcode, rcode or option name as 0. `encode` throws for it.
- `\.`, `\\` and `\DDD` escapes work in every name, and decoded labels have `.` and `\` escaped. In a decoded label that isn't UTF-8, bytes outside printable ASCII are written as `\DDD`, so the label encodes back to the same bytes.
- `decode` checks that each EDNS option has the right length for its fields.
- IPv6 addresses decode in RFC 5952 form, and `encode` throws for an invalid address.
- `encode` clears the bits of a CLIENT_SUBNET address past the source prefix, as RFC 7871 requires.
