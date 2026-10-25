import { assertUint8Array } from '@portable/bytes/internal';
import { InvalidInputError } from './errors.js';

/**
 * An IPv4 or IPv6 address. `bytes` holds the address in network order: 4 bytes for IPv4 and 16
 * for IPv6. `zone` is the IPv6 zone index after `%`, as in `fe80::1%eth0`.
 */
export type Address =
  | { version: 4; bytes: Uint8Array }
  | { version: 6; bytes: Uint8Array; zone?: string | undefined };

const colon = 0x3a;
const dot = 0x2e;
const zoneCharacter = /^[\w.~-]+$/;

/**
 * Parses an IPv4 or IPv6 address.
 *
 * IPv4 must be four decimal numbers from 0 to 255 without leading zeros. `parse` throws on octal
 * (`0177.0.0.1`), hex (`0x7f.0.0.1`), integer (`2130706433`) and short (`127.1`) forms, because
 * programs disagree on what they mean. IPv6 follows RFC 4291: up to four hex digits per group,
 * at most one `::`, an optional dotted IPv4 address in the last 32 bits, and an optional `%zone`.
 *
 * @example
 * ```ts
 * import * as Ip from '@portable/ip';
 *
 * Ip.parse('192.0.2.1'); // { version: 4, bytes: Uint8Array [192, 0, 2, 1] }
 * Ip.parse('fe80::1%eth0'); // { version: 6, bytes: Uint8Array [254, 128, ..., 1], zone: 'eth0' }
 * ```
 */
export function parse(text: string): Address {
  const address = tryParse(text);
  if (!address) {
    throw new InvalidInputError(`Invalid IP address: ${JSON.stringify(text)}.`);
  }
  return address;
}

export declare namespace canParse {
  type Options = {
    /** Accept only this IP version. @default undefined, which accepts both */
    version?: 4 | 6 | undefined;
  };
}

/**
 * Returns whether `text` is an IP address that `parse` accepts. It returns `false` for anything
 * other than a string.
 *
 * @example
 * ```ts
 * import * as Ip from '@portable/ip';
 *
 * Ip.canParse('2001:db8::1'); // true
 * Ip.canParse('2001:db8::1', { version: 4 }); // false
 * Ip.canParse('010.0.0.1'); // false
 * ```
 */
export function canParse(text: unknown, options: canParse.Options = {}): boolean {
  if (typeof text !== 'string') {
    return false;
  }
  const address = tryParse(text);
  return (
    address !== undefined && (options.version === undefined || address.version === options.version)
  );
}

/**
 * Builds an address from its bytes in network order: 4 bytes for IPv4, 16 for IPv6. The bytes
 * are copied.
 *
 * @example
 * ```ts
 * import * as Ip from '@portable/ip';
 *
 * Ip.format(Ip.fromBytes(new Uint8Array([127, 0, 0, 1]))); // '127.0.0.1'
 * ```
 */
export function fromBytes(bytes: Uint8Array): Address {
  assertUint8Array(bytes);
  if (bytes.length === 4) {
    return { version: 4, bytes: bytes.slice() };
  }
  if (bytes.length === 16) {
    return { version: 6, bytes: bytes.slice() };
  }
  throw new InvalidInputError(`An IP address has 4 or 16 bytes, not ${bytes.length}.`);
}

/**
 * Formats an address as text. IPv6 follows RFC 5952: lowercase hex without leading zeros, and
 * `::` for the longest run of two or more zero groups (the first one on a tie). IPv4-mapped
 * addresses end in dotted IPv4, as RFC 5952 section 5 recommends.
 *
 * @example
 * ```ts
 * import * as Ip from '@portable/ip';
 *
 * Ip.format('2001:0DB8:0:0:0:0:0:1'); // '2001:db8::1'
 * Ip.format('::ffff:c000:201'); // '::ffff:192.0.2.1'
 * ```
 */
export function format(address: Address | string): string {
  const value = from(address);
  const { bytes } = value;
  if (value.version === 4) {
    return `${bytes[0]}.${bytes[1]}.${bytes[2]}.${bytes[3]}`;
  }
  const suffix = value.zone === undefined ? '' : `%${value.zone}`;
  if (isMapped(bytes)) {
    return `::ffff:${bytes[12]}.${bytes[13]}.${bytes[14]}.${bytes[15]}${suffix}`;
  }

  let start = -1;
  let length = 1;
  for (let i = 0; i < 8; i++) {
    let j = i;
    while (j < 8 && bytes[j * 2] === 0 && bytes[j * 2 + 1] === 0) {
      j++;
    }
    if (j - i > length) {
      start = i;
      length = j - i;
    }
    i = j;
  }
  let text = '';
  for (let i = 0; i < 8; i++) {
    if (i === start) {
      text += i === 0 ? '::' : ':';
      i += length - 1;
      continue;
    }
    text += ((bytes[i * 2]! << 8) | bytes[i * 2 + 1]!).toString(16);
    if (i < 7) {
      text += ':';
    }
  }
  return text + suffix;
}

/**
 * Orders two addresses: IPv4 before IPv6, then by bytes, then by zone. Returns a negative number,
 * zero or a positive number, so you can pass it to `Array.prototype.sort`. An IPv4 address and its
 * IPv4-mapped IPv6 form count as different addresses. Pass both through `unmap` to treat them as
 * one.
 *
 * @example
 * ```ts
 * import * as Ip from '@portable/ip';
 *
 * ['10.0.0.2', '::1', '10.0.0.1'].sort(Ip.compare); // ['10.0.0.1', '10.0.0.2', '::1']
 * Ip.compare('2001:db8::1', '2001:DB8:0::1') === 0; // true
 * ```
 */
export function compare(a: Address | string, b: Address | string): number {
  const x = from(a);
  const y = from(b);
  if (x.version !== y.version) {
    return x.version - y.version;
  }
  for (let i = 0; i < x.bytes.length; i++) {
    const difference = x.bytes[i]! - y.bytes[i]!;
    if (difference !== 0) {
      return difference;
    }
  }
  const xZone = x.version === 6 ? (x.zone ?? '') : '';
  const yZone = y.version === 6 ? (y.zone ?? '') : '';
  return xZone < yZone ? -1 : xZone > yZone ? 1 : 0;
}

/**
 * Returns the IPv4 address inside an IPv4-mapped IPv6 address (`::ffff:192.0.2.1`), and any other
 * address unchanged. Call it before checking an address that may come from a dual-stack socket,
 * which reports IPv4 clients in mapped form.
 *
 * @example
 * ```ts
 * import * as Ip from '@portable/ip';
 *
 * Ip.format(Ip.unmap('::ffff:127.0.0.1')); // '127.0.0.1'
 * Ip.format(Ip.unmap('2001:db8::1')); // '2001:db8::1'
 * ```
 */
export function unmap(address: Address | string): Address {
  const value = from(address);
  if (value.version === 6 && isMapped(value.bytes)) {
    return { version: 4, bytes: value.bytes.slice(12) };
  }
  return value;
}

/**
 * Returns the IPv4-mapped IPv6 form of an IPv4 address (`::ffff:192.0.2.1`), and an IPv6 address
 * unchanged.
 *
 * @example
 * ```ts
 * import * as Ip from '@portable/ip';
 *
 * Ip.format(Ip.toIpv6('192.0.2.1')); // '::ffff:192.0.2.1'
 * ```
 */
export function toIpv6(address: Address | string): Address {
  const value = from(address);
  if (value.version === 6) {
    return value;
  }
  const bytes = new Uint8Array(16);
  bytes[10] = 0xff;
  bytes[11] = 0xff;
  bytes.set(value.bytes, 12);
  return { version: 6, bytes };
}

/**
 * Returns the DNS name for a reverse (PTR) lookup of the address: under `in-addr.arpa` for IPv4 and
 * `ip6.arpa` for IPv6, one label per byte or per hex digit, last first. An IPv4-mapped address
 * gets an `ip6.arpa` name, as in Node's `dns.reverse`. `unmap` it first to get the IPv4 name.
 *
 * @example
 * ```ts
 * import * as Ip from '@portable/ip';
 *
 * Ip.reverseName('192.0.2.1'); // '1.2.0.192.in-addr.arpa'
 * Ip.reverseName('2001:db8::1'); // '1.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.8.b.d.0.1.0.0.2.ip6.arpa'
 * ```
 */
export function reverseName(address: Address | string): string {
  const { version, bytes } = from(address);
  if (version === 4) {
    return `${bytes[3]}.${bytes[2]}.${bytes[1]}.${bytes[0]}.in-addr.arpa`;
  }
  let name = '';
  for (let i = 15; i >= 0; i--) {
    name += `${(bytes[i]! & 15).toString(16)}.${(bytes[i]! >> 4).toString(16)}.`;
  }
  return `${name}ip6.arpa`;
}

export function from(address: Address | string): Address {
  return typeof address === 'string' ? parse(address) : address;
}

export function isMapped(bytes: Uint8Array): boolean {
  if (bytes.length !== 16 || bytes[10] !== 0xff || bytes[11] !== 0xff) {
    return false;
  }
  for (let i = 0; i < 10; i++) {
    if (bytes[i] !== 0) {
      return false;
    }
  }
  return true;
}

export function tryParse(text: string): Address | undefined {
  if (text.indexOf(':') === -1) {
    const bytes = new Uint8Array(4);
    return parse4(text, 0, text.length, bytes, 0) ? { version: 4, bytes } : undefined;
  }
  const percent = text.indexOf('%');
  const end = percent === -1 ? text.length : percent;
  const bytes = new Uint8Array(16);
  if (!parse6(text, end, bytes)) {
    return undefined;
  }
  if (percent === -1) {
    return { version: 6, bytes };
  }
  const zone = text.slice(percent + 1);
  return zoneCharacter.test(zone) ? { version: 6, bytes, zone } : undefined;
}

function parse4(text: string, start: number, end: number, out: Uint8Array, offset: number) {
  let dots = 0;
  let digits = 0;
  let value = 0;
  for (let i = start; i < end; i++) {
    const c = text.charCodeAt(i);
    if (c === dot) {
      if (digits === 0 || dots === 3) {
        return false;
      }
      out[offset + dots++] = value;
      digits = 0;
      value = 0;
    } else if (c >= 0x30 && c <= 0x39) {
      if (digits > 0 && value === 0) {
        return false;
      }
      value = value * 10 + c - 0x30;
      if (value > 255) {
        return false;
      }
      digits++;
    } else {
      return false;
    }
  }
  if (digits === 0 || dots !== 3) {
    return false;
  }
  out[offset + 3] = value;
  return true;
}

function parse6(text: string, end: number, bytes: Uint8Array): boolean {
  let groups = 0;
  let gap = -1;
  let i = 0;
  if (text.charCodeAt(0) === colon) {
    if (text.charCodeAt(1) !== colon) {
      return false;
    }
    gap = 0;
    i = 2;
    if (i === end) {
      return true;
    }
  }
  for (;;) {
    let value = 0;
    let j = i;
    for (; j < end; j++) {
      const digit = hex(text.charCodeAt(j));
      if (digit < 0) {
        break;
      }
      if (j - i === 4) {
        return false;
      }
      value = value * 16 + digit;
    }
    if (j === i) {
      return false;
    }
    if (j < end && text.charCodeAt(j) === dot) {
      if (groups > 6 || !parse4(text, i, end, bytes, groups * 2)) {
        return false;
      }
      groups += 2;
      break;
    }
    if (groups === 8) {
      return false;
    }
    bytes[groups * 2] = value >> 8;
    bytes[groups * 2 + 1] = value & 0xff;
    groups++;
    if (j === end) {
      break;
    }
    if (text.charCodeAt(j) !== colon || ++j === end) {
      return false;
    }
    if (text.charCodeAt(j) === colon) {
      if (gap >= 0) {
        return false;
      }
      gap = groups;
      if (++j === end) {
        break;
      }
    }
    i = j;
  }
  if (gap < 0) {
    return groups === 8;
  }
  if (groups === 8) {
    return false;
  }
  bytes.copyWithin(16 - (groups - gap) * 2, gap * 2, groups * 2);
  bytes.fill(0, gap * 2, 16 - (groups - gap) * 2);
  return true;
}

function hex(c: number): number {
  if (c >= 0x30 && c <= 0x39) {
    return c - 0x30;
  }
  const lower = c | 0x20;
  if (lower >= 0x61 && lower <= 0x66) {
    return lower - 0x61 + 10;
  }
  return -1;
}
