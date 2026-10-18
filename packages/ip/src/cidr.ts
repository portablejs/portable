import { type Address, format, from, isMapped, toIpv6, tryParse } from './address.js'
import { InvalidInputError } from './errors.js'

/** A CIDR block: the network address and the number of leading bits that every address in it shares. */
export type Cidr = { address: Address; prefix: number }

/**
 * Parses CIDR notation, such as `10.0.0.0/8` or `2001:db8::/32`. The address follows the rules of
 * `parse`, without a zone, and its host bits are cleared, so `192.168.1.134/26` gives the network
 * `192.168.1.128/26`. The prefix is a decimal number without leading zeros, up to 32 for IPv4 and
 * 128 for IPv6.
 *
 * @example
 * ```ts
 * import * as Ip from '@portable/ip'
 *
 * const cidr = Ip.parseCidr('192.168.1.134/26')
 * Ip.formatCidr(cidr) // '192.168.1.128/26'
 * cidr.prefix // 26
 * ```
 */
export function parseCidr(text: string): Cidr {
  const slash = text.indexOf('/')
  const digits = text.slice(slash + 1)
  const address = slash === -1 ? undefined : tryParse(text.slice(0, slash))
  const prefix = /^(?:0|[1-9]\d{0,2})$/.test(digits) ? Number(digits) : -1
  if (
    address === undefined ||
    (address.version === 6 && address.zone !== undefined) ||
    prefix < 0 ||
    prefix > address.bytes.length * 8
  )
    throw new InvalidInputError(`Invalid CIDR block: ${JSON.stringify(text)}.`)
  const bytes = address.bytes
  const whole = prefix >> 3
  if (whole < bytes.length) {
    bytes[whole]! &= 0xff00 >> (prefix & 7)
    bytes.fill(0, whole + 1)
  }
  return { address, prefix }
}

/**
 * Formats a CIDR block as `address/prefix`, with the address formatted by `format`.
 *
 * @example
 * ```ts
 * import * as Ip from '@portable/ip'
 *
 * Ip.formatCidr({ address: Ip.parse('2001:db8::'), prefix: 32 }) // '2001:db8::/32'
 * ```
 */
export function formatCidr(cidr: Cidr): string {
  return `${format(cidr.address)}/${cidr.prefix}`
}

/**
 * Returns whether the CIDR block contains the address. An IPv4 address and its IPv4-mapped IPv6
 * form (`::ffff:192.0.2.1`) count as the same address, as in Node's `BlockList`, so
 * `127.0.0.0/8` contains `::ffff:127.0.0.1`. Zones are ignored. Strings are parsed with
 * `parseCidr` and `parse`; parse a block once when you check many addresses against it.
 *
 * @example
 * ```ts
 * import * as Ip from '@portable/ip'
 *
 * Ip.contains('10.0.0.0/8', '10.1.2.3') // true
 * Ip.contains('127.0.0.0/8', '::ffff:127.0.0.1') // true
 *
 * const internal = Ip.parseCidr('fc00::/7')
 * Ip.contains(internal, 'fd12:3456::1') // true
 * ```
 */
export function contains(cidr: Cidr | string, address: Address | string): boolean {
  const block = typeof cidr === 'string' ? parseCidr(cidr) : cidr
  const network = block.address.bytes
  const { prefix } = block
  if (!Number.isInteger(prefix) || prefix < 0 || prefix > network.length * 8)
    throw new RangeError(`Invalid prefix length ${prefix} for IPv${block.address.version}.`)
  let bytes = from(address).bytes
  if (bytes.length !== network.length) {
    if (network.length === 4 && isMapped(bytes)) bytes = bytes.subarray(12)
    else if (network.length === 16) bytes = toIpv6({ version: 4, bytes }).bytes
    else return false
  }
  return matches(bytes, network, prefix)
}

export function matches(bytes: Uint8Array, network: Uint8Array, prefix: number): boolean {
  const whole = prefix >> 3
  for (let i = 0; i < whole; i++) if (bytes[i] !== network[i]) return false
  const bits = prefix & 7
  return bits === 0 || ((bytes[whole]! ^ network[whole]!) & (0xff00 >> bits) & 0xff) === 0
}
