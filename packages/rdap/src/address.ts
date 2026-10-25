import * as Ip from '@portable/ip';

export type Prefix = Ip.Cidr;

/**
 * Parses an IPv4 or IPv6 address with an optional prefix length, without a zone. An IPv4-mapped
 * IPv6 address (`::ffff:192.0.2.1`) becomes the IPv4 address, because the IPv6 bootstrap file
 * doesn't cover `::ffff:0:0/96`.
 */
export function parse(text: string): Prefix | undefined {
  let cidr: Ip.Cidr;
  try {
    if (text.includes('/')) {
      cidr = Ip.parseCidr(text);
    } else {
      const address = Ip.parse(text);
      if (address.version === 6 && address.zone !== undefined) {
        return undefined;
      }
      cidr = { address, prefix: address.bytes.length * 8 };
    }
  } catch {
    return undefined;
  }
  const { address, prefix } = cidr;
  if (address.version === 6 && prefix >= 96) {
    const unmapped = Ip.unmap(address);
    if (unmapped.version === 4) {
      return { address: unmapped, prefix: prefix - 96 };
    }
  }
  return cidr;
}

export function format({ address, prefix }: Prefix): string {
  return prefix === address.bytes.length * 8
    ? Ip.format(address)
    : Ip.formatCidr({ address, prefix });
}

export function contains(outer: Prefix, inner: Prefix): boolean {
  return (
    outer.address.version === inner.address.version &&
    inner.prefix >= outer.prefix &&
    Ip.contains(outer, inner.address)
  );
}
