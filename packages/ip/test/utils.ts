import * as Ip from '@portable/ip';

export const normalize = (text: string): string => Ip.format(Ip.parse(text));

export const bytes = (address: string): number[] => [...Ip.parse(address).bytes];

export const network = (cidr: string): string => Ip.formatCidr(Ip.parseCidr(cidr));

export function words(...parts: number[]): Uint8Array {
  const out = new Uint8Array(16);
  parts.forEach((part, i) => {
    out[i * 2] = part >> 8;
    out[i * 2 + 1] = part & 0xff;
  });
  return out;
}

export const formatWords = (...parts: number[]): string => Ip.format(Ip.fromBytes(words(...parts)));
