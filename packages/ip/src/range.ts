import { type Address, from } from './address.js';
import { isInNetwork, parseCidr } from './cidr.js';

/**
 * The special-purpose block an address belongs to, named after its entry in the IANA IPv4 and IPv6
 * Special-Purpose Address Registries. `'multicast'`, `'deprecatedSiteLocal'` and `'ipv4Translated'`
 * come from RFC 5771, RFC 3879 and RFC 2765. `'unicast'` is every other IPv4 address and every
 * other IPv6 address in `2000::/3`. `'reserved'` is the rest of the IPv6 space and `240.0.0.0/4`.
 */
export type Range =
  | '6to4'
  | '6to4RelayAnycast'
  | 'amt'
  | 'as112'
  | 'benchmarking'
  | 'broadcast'
  | 'deprecatedOrchid'
  | 'deprecatedSiteLocal'
  | 'discard'
  | 'documentation'
  | 'droneRemoteIdProtocolEntityTags'
  | 'dummy'
  | 'ietfProtocolAssignments'
  | 'ipv4Ipv6Translation'
  | 'ipv4Mapped'
  | 'ipv4Translated'
  | 'linkLocal'
  | 'loopback'
  | 'multicast'
  | 'orchidV2'
  | 'private'
  | 'reserved'
  | 'segmentRouting'
  | 'sharedAddressSpace'
  | 'teredo'
  | 'thisNetwork'
  | 'uniqueLocal'
  | 'unicast'
  | 'unspecified';

type Entry = readonly [bytes: Uint8Array, prefix: number, range: Range];

const table = (entries: readonly (readonly [string, Range])[]): readonly Entry[] =>
  entries.map(([text, range]) => {
    const { address, prefix } = parseCidr(text);
    return [address.bytes, prefix, range];
  });

const ipv4 = table([
  ['0.0.0.0/8', 'thisNetwork'],
  ['10.0.0.0/8', 'private'],
  ['100.64.0.0/10', 'sharedAddressSpace'],
  ['127.0.0.0/8', 'loopback'],
  ['169.254.0.0/16', 'linkLocal'],
  ['172.16.0.0/12', 'private'],
  ['192.0.0.0/24', 'ietfProtocolAssignments'],
  ['192.0.2.0/24', 'documentation'],
  ['192.31.196.0/24', 'as112'],
  ['192.52.193.0/24', 'amt'],
  ['192.88.99.0/24', '6to4RelayAnycast'],
  ['192.168.0.0/16', 'private'],
  ['192.175.48.0/24', 'as112'],
  ['198.18.0.0/15', 'benchmarking'],
  ['198.51.100.0/24', 'documentation'],
  ['203.0.113.0/24', 'documentation'],
  ['224.0.0.0/4', 'multicast'],
  ['255.255.255.255/32', 'broadcast'],
  ['240.0.0.0/4', 'reserved'],
]);

const ipv6 = table([
  ['::/128', 'unspecified'],
  ['::1/128', 'loopback'],
  ['::ffff:0:0/96', 'ipv4Mapped'],
  ['::ffff:0:0:0/96', 'ipv4Translated'],
  ['64:ff9b::/96', 'ipv4Ipv6Translation'],
  ['64:ff9b:1::/48', 'ipv4Ipv6Translation'],
  ['100::/64', 'discard'],
  ['100:0:0:1::/64', 'dummy'],
  ['2001::/32', 'teredo'],
  ['2001:2::/48', 'benchmarking'],
  ['2001:3::/32', 'amt'],
  ['2001:4:112::/48', 'as112'],
  ['2001:10::/28', 'deprecatedOrchid'],
  ['2001:20::/28', 'orchidV2'],
  ['2001:30::/28', 'droneRemoteIdProtocolEntityTags'],
  ['2001::/23', 'ietfProtocolAssignments'],
  ['2001:db8::/32', 'documentation'],
  ['2002::/16', '6to4'],
  ['2620:4f:8000::/48', 'as112'],
  ['3fff::/20', 'documentation'],
  ['2000::/3', 'unicast'],
  ['5f00::/16', 'segmentRouting'],
  ['fc00::/7', 'uniqueLocal'],
  ['fe80::/10', 'linkLocal'],
  ['fec0::/10', 'deprecatedSiteLocal'],
  ['ff00::/8', 'multicast'],
]);

/**
 * Returns the special-purpose block the address is in, or `'unicast'` for an ordinary public
 * address. To reject internal destinations before a server-side request (SSRF), allow only
 * `'unicast'`. An IPv4-mapped address returns `'ipv4Mapped'`, so pass it through `unmap` first to
 * classify the IPv4 address inside.
 *
 * @example
 * ```ts
 * import * as Ip from '@portable/ip';
 *
 * Ip.range('10.1.2.3'); // 'private'
 * Ip.range('fe80::1'); // 'linkLocal'
 * Ip.range(Ip.unmap('::ffff:127.0.0.1')); // 'loopback'
 * Ip.range('8.8.8.8'); // 'unicast'
 * ```
 */
export function range(address: Address | string): Range {
  const { version, bytes } = from(address);
  for (const [network, prefix, name] of version === 4 ? ipv4 : ipv6) {
    if (isInNetwork(bytes, network, prefix)) {
      return name;
    }
  }
  return version === 4 ? 'unicast' : 'reserved';
}
