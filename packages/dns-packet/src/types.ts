const names = {
  A: 1,
  NULL: 10,
  AAAA: 28,
  AFSDB: 18,
  APL: 42,
  CAA: 257,
  CDNSKEY: 60,
  CDS: 59,
  CERT: 37,
  CNAME: 5,
  DHCID: 49,
  DLV: 32769,
  DNAME: 39,
  DNSKEY: 48,
  DS: 43,
  HIP: 55,
  HINFO: 13,
  IPSECKEY: 45,
  KEY: 25,
  KX: 36,
  LOC: 29,
  MX: 15,
  NAPTR: 35,
  NS: 2,
  NSEC: 47,
  NSEC3: 50,
  NSEC3PARAM: 51,
  PTR: 12,
  RRSIG: 46,
  RP: 17,
  SIG: 24,
  SOA: 6,
  SPF: 99,
  SRV: 33,
  SSHFP: 44,
  TA: 32768,
  TKEY: 249,
  TLSA: 52,
  TSIG: 250,
  TXT: 16,
  AXFR: 252,
  IXFR: 251,
  OPT: 41,
  ANY: 255,
} as const

/** A record type name. Types without a name are written `UNKNOWN_<number>`. */
export type RecordType = keyof typeof names | `UNKNOWN_${number}`

const byNumber = new Map<number, RecordType>(
  Object.entries(names).map(([name, type]) => [type, name as RecordType]),
)

/**
 * Returns the name of a record type number, or `UNKNOWN_<number>`.
 *
 * @example
 * ```ts
 * import { types } from '@portable/dns-packet'
 *
 * types.toString(28) // 'AAAA'
 * ```
 */
export function toString(type: number): RecordType {
  return byNumber.get(type) ?? `UNKNOWN_${type}`
}

/**
 * Returns the number of a record type name, case-insensitive. `*` is `ANY`, `UNKNOWN_<number>`
 * is that number, and any other name is 0.
 *
 * @example
 * ```ts
 * import { types } from '@portable/dns-packet'
 *
 * types.toType('aaaa') // 28
 * ```
 */
export function toType(name: string): number {
  const upper = name.toUpperCase()
  if (Object.hasOwn(names, upper)) return names[upper as keyof typeof names]
  if (upper === '*') return 255
  if (upper.startsWith('UNKNOWN_')) return Number.parseInt(upper.slice(8), 10)
  return 0
}
