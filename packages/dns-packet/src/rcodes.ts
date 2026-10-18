const names = [
  'NOERROR',
  'FORMERR',
  'SERVFAIL',
  'NXDOMAIN',
  'NOTIMP',
  'REFUSED',
  'YXDOMAIN',
  'YXRRSET',
  'NXRRSET',
  'NOTAUTH',
  'NOTZONE',
] as const

/** A response code name from the 4-bit header field. Codes 11 to 15 are written `RCODE_<number>`. */
export type Rcode = (typeof names)[number] | `RCODE_${number}`

/**
 * Returns the name of a response code.
 *
 * @example
 * ```ts
 * import { rcodes } from '@portable/dns-packet'
 *
 * rcodes.toString(3) // 'NXDOMAIN'
 * ```
 */
export function toString(rcode: number): Rcode {
  return names[rcode] ?? `RCODE_${rcode}`
}

/**
 * Returns the number of a response code name, case-insensitive, or 0 for an unknown name.
 *
 * @example
 * ```ts
 * import { rcodes } from '@portable/dns-packet'
 *
 * rcodes.toRcode('servfail') // 2
 * ```
 */
export function toRcode(name: string): number {
  const upper = name.toUpperCase()
  const index = names.indexOf(upper as (typeof names)[number])
  if (index !== -1) return index
  const match = /^RCODE_(1[1-5])$/.exec(upper)
  return match ? Number(match[1]) : 0
}
