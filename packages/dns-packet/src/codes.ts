import { InvalidInputError } from './errors.js'

const typeNumbers = {
  A: 1,
  NS: 2,
  CNAME: 5,
  SOA: 6,
  NULL: 10,
  PTR: 12,
  HINFO: 13,
  MX: 15,
  TXT: 16,
  RP: 17,
  AFSDB: 18,
  SIG: 24,
  KEY: 25,
  AAAA: 28,
  LOC: 29,
  SRV: 33,
  NAPTR: 35,
  KX: 36,
  CERT: 37,
  DNAME: 39,
  OPT: 41,
  APL: 42,
  DS: 43,
  SSHFP: 44,
  IPSECKEY: 45,
  RRSIG: 46,
  NSEC: 47,
  DNSKEY: 48,
  DHCID: 49,
  NSEC3: 50,
  NSEC3PARAM: 51,
  TLSA: 52,
  SMIMEA: 53,
  HIP: 55,
  CDS: 59,
  CDNSKEY: 60,
  OPENPGPKEY: 61,
  CSYNC: 62,
  ZONEMD: 63,
  SVCB: 64,
  HTTPS: 65,
  SPF: 99,
  TKEY: 249,
  TSIG: 250,
  IXFR: 251,
  AXFR: 252,
  ANY: 255,
  URI: 256,
  CAA: 257,
  TA: 32768,
  DLV: 32769,
} as const

/** A record type name. A type without a name is written `TYPE<number>`, as in RFC 3597. */
export type RecordType = keyof typeof typeNumbers | `TYPE${number}`

/** A class name. A class without a name is written `CLASS<number>`, as in RFC 3597. */
export type RecordClass = 'IN' | 'CS' | 'CH' | 'HS' | 'NONE' | 'ANY' | `CLASS${number}`

/** A header opcode name. An opcode without a name is written `OPCODE<number>`. */
export type Opcode = 'QUERY' | 'IQUERY' | 'STATUS' | 'NOTIFY' | 'UPDATE' | 'DSO' | `OPCODE${number}`

/** A header response code name. A code without a name is written `RCODE<number>`. */
export type Rcode =
  | 'NOERROR'
  | 'FORMERR'
  | 'SERVFAIL'
  | 'NXDOMAIN'
  | 'NOTIMP'
  | 'REFUSED'
  | 'YXDOMAIN'
  | 'YXRRSET'
  | 'NXRRSET'
  | 'NOTAUTH'
  | 'NOTZONE'
  | 'DSOTYPENI'
  | `RCODE${number}`

/** An EDNS option code name. A code without a name is written `OPTION<number>`. */
export type OptionCode =
  | 'LLQ'
  | 'UL'
  | 'NSID'
  | 'DAU'
  | 'DHU'
  | 'N3U'
  | 'CLIENT_SUBNET'
  | 'EXPIRE'
  | 'COOKIE'
  | 'TCP_KEEPALIVE'
  | 'PADDING'
  | 'CHAIN'
  | 'KEY_TAG'
  | 'EDE'
  | 'DEVICEID'
  | `OPTION${number}`

export type Table<name extends string> = {
  name(value: number): name
  value(name: string): number
}

function table<name extends string>(
  what: string,
  prefix: string,
  max: number,
  values: Record<string, number>,
): Table<name> {
  const byValue = new Map<number, string>()
  const byName = new Map<string, number>()
  for (const [name, value] of Object.entries(values)) {
    byValue.set(value, name)
    byName.set(name, value)
  }
  return {
    name: (value) => (byValue.get(value) ?? `${prefix}${value}`) as name,
    value(name) {
      const known = byName.get(name) ?? byName.get(String(name).toUpperCase())
      if (known !== undefined) return known
      const match = new RegExp(`^${prefix}(\\d+)$`, 'i').exec(String(name))
      const value = match ? Number(match[1]) : Number.NaN
      if (value <= max) return value
      throw new InvalidInputError(`Unknown ${what} "${name}".`)
    },
  }
}

export const types: Table<RecordType> = table('record type', 'TYPE', 0xffff, typeNumbers)

export const classes: Table<RecordClass> = table('class', 'CLASS', 0xffff, {
  IN: 1,
  CS: 2,
  CH: 3,
  HS: 4,
  NONE: 254,
  ANY: 255,
})

export const opcodes: Table<Opcode> = table('opcode', 'OPCODE', 15, {
  QUERY: 0,
  IQUERY: 1,
  STATUS: 2,
  NOTIFY: 4,
  UPDATE: 5,
  DSO: 6,
})

export const rcodes: Table<Rcode> = table('rcode', 'RCODE', 15, {
  NOERROR: 0,
  FORMERR: 1,
  SERVFAIL: 2,
  NXDOMAIN: 3,
  NOTIMP: 4,
  REFUSED: 5,
  YXDOMAIN: 6,
  YXRRSET: 7,
  NXRRSET: 8,
  NOTAUTH: 9,
  NOTZONE: 10,
  DSOTYPENI: 11,
})

export const optionCodes: Table<OptionCode> = table('EDNS option code', 'OPTION', 0xffff, {
  LLQ: 1,
  UL: 2,
  NSID: 3,
  DAU: 5,
  DHU: 6,
  N3U: 7,
  CLIENT_SUBNET: 8,
  EXPIRE: 9,
  COOKIE: 10,
  TCP_KEEPALIVE: 11,
  PADDING: 12,
  CHAIN: 13,
  KEY_TAG: 14,
  EDE: 15,
  DEVICEID: 26946,
})
