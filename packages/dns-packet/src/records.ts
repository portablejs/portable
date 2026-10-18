import { InvalidRecordError } from './errors.js'
import * as types from './types.js'
import {
  bytes,
  bytesOf,
  familyOf,
  nameLength,
  need,
  putBytes,
  putIPv4,
  putIPv6,
  putName,
  putString,
  putText,
  putU16,
  putU32,
  putU8,
  readIPv4,
  readIPv6,
  readName,
  readString,
  readText,
  stringLength,
  u16,
  u32,
  u8,
  utf8Length,
  type Reader,
  type Writer,
} from './wire.js'

/** Reads and writes the RDATA of one record type, without the RDLENGTH prefix. */
export type Codec<In, Out> = {
  length(data: In): number
  write(w: Writer, data: In): void
  read(r: Reader, end: number): Out
}

/** Record data accepted by `encode`, by record type. */
export type RecordData = {
  A: string
  AAAA: string
  CNAME: string
  DNAME: string
  NS: string
  PTR: string
  MX: { preference?: number | undefined; exchange: string }
  SOA: {
    mname: string
    rname: string
    serial?: number | undefined
    refresh?: number | undefined
    retry?: number | undefined
    expire?: number | undefined
    minimum?: number | undefined
  }
  SRV: {
    priority?: number | undefined
    weight?: number | undefined
    port?: number | undefined
    target: string
  }
  TXT: string | Uint8Array | readonly (string | Uint8Array)[]
  NULL: string | Uint8Array | undefined
  HINFO: { cpu: string; os: string }
  CAA: {
    flags?: number | undefined
    tag: string
    value: string
    issuerCritical?: boolean | undefined
  }
  NAPTR: {
    order?: number | undefined
    preference?: number | undefined
    flags: string
    services: string
    regexp: string
    replacement: string
  }
  TLSA: { usage: number; selector: number; matchingType: number; certificate: Uint8Array }
  SSHFP: { algorithm: number; hash: number; fingerprint: string }
  DS: { keyTag: number; algorithm: number; digestType: number; digest: Uint8Array }
  DNSKEY: { flags: number; algorithm: number; key: Uint8Array }
  RRSIG: {
    typeCovered: types.RecordType
    algorithm: number
    labels: number
    originalTTL: number
    expiration: number
    inception: number
    keyTag: number
    signersName: string
    signature: Uint8Array
  }
  RP: { mbox?: string | undefined; txt?: string | undefined }
  NSEC: { nextDomain: string; rrtypes: readonly types.RecordType[] }
  NSEC3: {
    algorithm: number
    flags: number
    iterations: number
    salt: Uint8Array
    nextDomain: Uint8Array
    rrtypes: readonly types.RecordType[]
  }
}

/** Record data returned by `decode`, by record type. */
export type DecodedRecordData = {
  A: string
  AAAA: string
  CNAME: string
  DNAME: string
  NS: string
  PTR: string
  MX: { preference: number; exchange: string }
  SOA: {
    mname: string
    rname: string
    serial: number
    refresh: number
    retry: number
    expire: number
    minimum: number
  }
  SRV: { priority: number; weight: number; port: number; target: string }
  TXT: Uint8Array[]
  NULL: Uint8Array
  HINFO: { cpu: string; os: string }
  CAA: { flags: number; tag: string; value: string; issuerCritical: boolean }
  NAPTR: {
    order: number
    preference: number
    flags: string
    services: string
    regexp: string
    replacement: string
  }
  TLSA: { usage: number; selector: number; matchingType: number; certificate: Uint8Array }
  SSHFP: { algorithm: number; hash: number; fingerprint: string }
  DS: { keyTag: number; algorithm: number; digestType: number; digest: Uint8Array }
  DNSKEY: { flags: number; algorithm: number; key: Uint8Array }
  RRSIG: {
    typeCovered: types.RecordType
    algorithm: number
    labels: number
    originalTTL: number
    expiration: number
    inception: number
    keyTag: number
    signersName: string
    signature: Uint8Array
  }
  RP: { mbox: string; txt: string }
  NSEC: { nextDomain: string; rrtypes: types.RecordType[] }
  NSEC3: {
    algorithm: number
    flags: number
    iterations: number
    salt: Uint8Array
    nextDomain: Uint8Array
    rrtypes: types.RecordType[]
  }
}

const rest = (r: Reader, end: number) => bytes(r, end - r.offset, end)

const a: Codec<string, string> = {
  length: () => 4,
  write: putIPv4,
  read(r, end) {
    need(r, 4, end)
    r.offset += 4
    return readIPv4(r.bytes, r.offset - 4)
  },
}

const aaaa: Codec<string, string> = {
  length: () => 16,
  write: putIPv6,
  read(r, end) {
    need(r, 16, end)
    r.offset += 16
    return readIPv6(r.bytes, r.offset - 16)
  },
}

// RFC 3597 section 4 allows compression only inside the RDATA of the RFC 1035 types.
const compressedName: Codec<string, string> = {
  length: (name) => nameLength(name),
  write: (w, name) => putName(w, name, true),
  read: (r, end) => readName(r, end),
}

const name: Codec<string, string> = {
  ...compressedName,
  write: (w, name) => putName(w, name, false),
}

const mx: Codec<RecordData['MX'], DecodedRecordData['MX']> = {
  length: (data) => 2 + nameLength(data.exchange),
  write(w, data) {
    putU16(w, data.preference || 0)
    putName(w, data.exchange, true)
  },
  read: (r, end) => ({ preference: u16(r, end), exchange: readName(r, end) }),
}

const soa: Codec<RecordData['SOA'], DecodedRecordData['SOA']> = {
  length: (data) => 20 + nameLength(data.mname) + nameLength(data.rname, true),
  write(w, data) {
    putName(w, data.mname, true)
    putName(w, data.rname, true, true)
    putU32(w, data.serial || 0)
    putU32(w, data.refresh || 0)
    putU32(w, data.retry || 0)
    putU32(w, data.expire || 0)
    putU32(w, data.minimum || 0)
  },
  read: (r, end) => ({
    mname: readName(r, end),
    rname: readName(r, end, true),
    serial: u32(r, end),
    refresh: u32(r, end),
    retry: u32(r, end),
    expire: u32(r, end),
    minimum: u32(r, end),
  }),
}

const srv: Codec<RecordData['SRV'], DecodedRecordData['SRV']> = {
  length: (data) => 6 + nameLength(data.target),
  write(w, data) {
    putU16(w, data.priority || 0)
    putU16(w, data.weight || 0)
    putU16(w, data.port || 0)
    putName(w, data.target, false)
  },
  read: (r, end) => ({
    priority: u16(r, end),
    weight: u16(r, end),
    port: u16(r, end),
    target: readName(r, end),
  }),
}

function txtStrings(data: RecordData['TXT']): readonly (string | Uint8Array)[] {
  const list = Array.isArray(data) ? data : [data]
  for (const item of list)
    if (typeof item !== 'string' && !(item instanceof Uint8Array))
      throw new InvalidRecordError('TXT data must be strings or Uint8Arrays.')
  return list
}

const txt: Codec<RecordData['TXT'], DecodedRecordData['TXT']> = {
  length(data) {
    let length = 0
    for (const item of txtStrings(data)) {
      const size = typeof item === 'string' ? utf8Length(item) : item.length
      if (size > 255) throw new InvalidRecordError('A TXT string is limited to 255 bytes.')
      length += size + 1
    }
    return length
  },
  write(w, data) {
    for (const item of txtStrings(data)) {
      if (typeof item === 'string') putString(w, item)
      else {
        putU8(w, item.length)
        putBytes(w, item)
      }
    }
  },
  read(r, end) {
    const strings: Uint8Array[] = []
    while (r.offset < end) strings.push(bytes(r, u8(r, end), end))
    return strings
  },
}

const nullBytes = (data: RecordData['NULL']): Uint8Array =>
  data === undefined
    ? new Uint8Array(0)
    : typeof data === 'string'
      ? new TextEncoder().encode(data)
      : bytesOf(data, 'NULL data')

const rnull: Codec<RecordData['NULL'], DecodedRecordData['NULL']> = {
  length: (data) => nullBytes(data).length,
  write: (w, data) => putBytes(w, nullBytes(data)),
  read: rest,
}

export const unknown: Codec<Uint8Array, Uint8Array> = {
  length: (data) => bytesOf(data, 'Record data').length,
  write: (w, data) => putBytes(w, data),
  read: rest,
}

const hinfo: Codec<RecordData['HINFO'], DecodedRecordData['HINFO']> = {
  length: (data) => stringLength(data.cpu) + stringLength(data.os),
  write(w, data) {
    putString(w, data.cpu)
    putString(w, data.os)
  },
  read: (r, end) => ({ cpu: readString(r, end), os: readString(r, end) }),
}

const ISSUER_CRITICAL = 0x80

const caa: Codec<RecordData['CAA'], DecodedRecordData['CAA']> = {
  length: (data) => 1 + stringLength(data.tag) + utf8Length(data.value),
  write(w, data) {
    putU8(w, data.issuerCritical ? ISSUER_CRITICAL : data.flags || 0)
    putString(w, data.tag)
    putText(w, data.value)
  },
  read(r, end) {
    const flags = u8(r, end)
    const tag = readString(r, end)
    const value = readText(r.bytes, r.offset, end)
    r.offset = end
    return { flags, tag, value, issuerCritical: (flags & ISSUER_CRITICAL) !== 0 }
  },
}

const naptr: Codec<RecordData['NAPTR'], DecodedRecordData['NAPTR']> = {
  length: (data) =>
    4 +
    stringLength(data.flags) +
    stringLength(data.services) +
    stringLength(data.regexp) +
    nameLength(data.replacement),
  write(w, data) {
    putU16(w, data.order || 0)
    putU16(w, data.preference || 0)
    putString(w, data.flags)
    putString(w, data.services)
    putString(w, data.regexp)
    putName(w, data.replacement, false)
  },
  read: (r, end) => ({
    order: u16(r, end),
    preference: u16(r, end),
    flags: readString(r, end),
    services: readString(r, end),
    regexp: readString(r, end),
    replacement: readName(r, end),
  }),
}

const tlsa: Codec<RecordData['TLSA'], DecodedRecordData['TLSA']> = {
  length: (data) => 3 + bytesOf(data.certificate, 'TLSA certificate').length,
  write(w, data) {
    putU8(w, data.usage)
    putU8(w, data.selector)
    putU8(w, data.matchingType)
    putBytes(w, data.certificate)
  },
  read: (r, end) => ({
    usage: u8(r, end),
    selector: u8(r, end),
    matchingType: u8(r, end),
    certificate: rest(r, end),
  }),
}

const fingerprintLengths: Partial<Record<number, number>> = { 1: 20, 2: 32 }

function fingerprintLength(data: RecordData['SSHFP']): number {
  const hex = data.fingerprint
  const expected = fingerprintLengths[data.hash]
  if (!/^(?:[0-9a-f]{2})*$/i.test(hex) || (expected !== undefined && hex.length !== expected * 2))
    throw new InvalidRecordError('Invalid SSHFP fingerprint.')
  return hex.length / 2
}

const sshfp: Codec<RecordData['SSHFP'], DecodedRecordData['SSHFP']> = {
  length: (data) => 2 + fingerprintLength(data),
  write(w, data) {
    putU8(w, data.algorithm)
    putU8(w, data.hash)
    const hex = data.fingerprint
    for (let i = 0; i < hex.length; i += 2) putU8(w, Number.parseInt(hex.slice(i, i + 2), 16))
  },
  read(r, end) {
    const algorithm = u8(r, end)
    const hash = u8(r, end)
    let fingerprint = ''
    for (const byte of rest(r, end)) fingerprint += byte.toString(16).padStart(2, '0')
    return { algorithm, hash, fingerprint: fingerprint.toUpperCase() }
  },
}

const ds: Codec<RecordData['DS'], DecodedRecordData['DS']> = {
  length: (data) => 4 + bytesOf(data.digest, 'DS digest').length,
  write(w, data) {
    putU16(w, data.keyTag)
    putU8(w, data.algorithm)
    putU8(w, data.digestType)
    putBytes(w, data.digest)
  },
  read: (r, end) => ({
    keyTag: u16(r, end),
    algorithm: u8(r, end),
    digestType: u8(r, end),
    digest: rest(r, end),
  }),
}

const PROTOCOL_DNSSEC = 3

const dnskey: Codec<RecordData['DNSKEY'], DecodedRecordData['DNSKEY']> = {
  length: (data) => 4 + bytesOf(data.key, 'DNSKEY key').length,
  write(w, data) {
    putU16(w, data.flags)
    putU8(w, PROTOCOL_DNSSEC)
    putU8(w, data.algorithm)
    putBytes(w, data.key)
  },
  read(r, end) {
    const flags = u16(r, end)
    if (u8(r, end) !== PROTOCOL_DNSSEC) throw new InvalidRecordError('DNSKEY protocol must be 3.')
    return { flags, algorithm: u8(r, end), key: rest(r, end) }
  },
}

const rrsig: Codec<RecordData['RRSIG'], DecodedRecordData['RRSIG']> = {
  length: (data) =>
    18 + nameLength(data.signersName) + bytesOf(data.signature, 'RRSIG signature').length,
  write(w, data) {
    putU16(w, types.toType(data.typeCovered))
    putU8(w, data.algorithm)
    putU8(w, data.labels)
    putU32(w, data.originalTTL)
    putU32(w, data.expiration)
    putU32(w, data.inception)
    putU16(w, data.keyTag)
    putName(w, data.signersName, false)
    putBytes(w, data.signature)
  },
  read: (r, end) => ({
    typeCovered: types.toString(u16(r, end)),
    algorithm: u8(r, end),
    labels: u8(r, end),
    originalTTL: u32(r, end),
    expiration: u32(r, end),
    inception: u32(r, end),
    keyTag: u16(r, end),
    signersName: readName(r, end),
    signature: rest(r, end),
  }),
}

const rp: Codec<RecordData['RP'], DecodedRecordData['RP']> = {
  length: (data) => nameLength(data.mbox || '.', true) + nameLength(data.txt || '.'),
  write(w, data) {
    putName(w, data.mbox || '.', false, true)
    putName(w, data.txt || '.', false)
  },
  read: (r, end) => ({ mbox: readName(r, end, true), txt: readName(r, end) }),
}

function typeWindows(rrtypes: readonly string[]): Uint8Array[] {
  const windows: Uint8Array[] = []
  for (const name of rrtypes) {
    const type = types.toType(name)
    const window = (windows[type >> 8] ??= new Uint8Array(32))
    window[(type >> 3) & 0x1f]! |= 0x80 >> (type & 7)
  }
  return windows
}

const usedLength = (window: Uint8Array) => {
  let length = 32
  while (length > 0 && window[length - 1] === 0) length--
  return length
}

function typeBitmapLength(rrtypes: readonly string[]): number {
  let length = 0
  for (const window of typeWindows(rrtypes)) if (window) length += 2 + usedLength(window)
  return length
}

function putTypeBitmap(w: Writer, rrtypes: readonly string[]): void {
  const windows = typeWindows(rrtypes)
  for (let i = 0; i < windows.length; i++) {
    const window = windows[i]
    if (!window) continue
    const length = usedLength(window)
    putU8(w, i)
    putU8(w, length)
    putBytes(w, window.subarray(0, length))
  }
}

function readTypeBitmap(r: Reader, end: number): types.RecordType[] {
  const rrtypes: types.RecordType[] = []
  while (r.offset < end) {
    const window = u8(r, end)
    const length = u8(r, end)
    need(r, length, end)
    for (let i = 0; i < length; i++) {
      const byte = r.bytes[r.offset + i]!
      for (let bit = 0; bit < 8; bit++)
        if (byte & (0x80 >> bit)) rrtypes.push(types.toString((window << 8) | (i << 3) | bit))
    }
    r.offset += length
  }
  return rrtypes
}

const nsec: Codec<RecordData['NSEC'], DecodedRecordData['NSEC']> = {
  length: (data) => nameLength(data.nextDomain) + typeBitmapLength(data.rrtypes),
  write(w, data) {
    putName(w, data.nextDomain, false)
    putTypeBitmap(w, data.rrtypes)
  },
  read: (r, end) => ({ nextDomain: readName(r, end), rrtypes: readTypeBitmap(r, end) }),
}

const nsec3: Codec<RecordData['NSEC3'], DecodedRecordData['NSEC3']> = {
  length: (data) =>
    6 +
    bytesOf(data.salt, 'NSEC3 salt').length +
    bytesOf(data.nextDomain, 'NSEC3 nextDomain').length +
    typeBitmapLength(data.rrtypes),
  write(w, data) {
    putU8(w, data.algorithm)
    putU8(w, data.flags)
    putU16(w, data.iterations)
    putU8(w, data.salt.length)
    putBytes(w, data.salt)
    putU8(w, data.nextDomain.length)
    putBytes(w, data.nextDomain)
    putTypeBitmap(w, data.rrtypes)
  },
  read(r, end) {
    const algorithm = u8(r, end)
    const flags = u8(r, end)
    const iterations = u16(r, end)
    const salt = bytes(r, u8(r, end), end)
    const nextDomain = bytes(r, u8(r, end), end)
    return { algorithm, flags, iterations, salt, nextDomain, rrtypes: readTypeBitmap(r, end) }
  },
}

export const codecs: { [T in keyof RecordData]: Codec<RecordData[T], DecodedRecordData[T]> } = {
  A: a,
  AAAA: aaaa,
  CNAME: compressedName,
  DNAME: name,
  NS: compressedName,
  PTR: compressedName,
  MX: mx,
  SOA: soa,
  SRV: srv,
  TXT: txt,
  NULL: rnull,
  HINFO: hinfo,
  CAA: caa,
  NAPTR: naptr,
  TLSA: tlsa,
  SSHFP: sshfp,
  DS: ds,
  DNSKEY: dnskey,
  RRSIG: rrsig,
  RP: rp,
  NSEC: nsec,
  NSEC3: nsec3,
}

/** An EDNS option inside an OPT record. Set `data` to send raw bytes for any code. */
export type EdnsOption = {
  /** Option code, as a number or a name from `optioncodes`, such as `'CLIENT_SUBNET'`. */
  code: number | string
  data?: Uint8Array | undefined
  /** CLIENT_SUBNET: 1 for IPv4, 2 for IPv6. Defaults to the family of `ip`. */
  family?: number | undefined
  /** CLIENT_SUBNET: the address. Only the first `sourcePrefixLength` bits are sent. */
  ip?: string | undefined
  sourcePrefixLength?: number | undefined
  scopePrefixLength?: number | undefined
  /** TCP_KEEPALIVE: idle timeout in units of 100 ms. */
  timeout?: number | undefined
  /** PADDING: number of zero bytes. */
  length?: number | undefined
  /** KEY_TAG: key tags. */
  tags?: readonly number[] | undefined
}

/** An EDNS option as `decode` returns it. `data` always holds the raw option bytes. */
export type DecodedEdnsOption = {
  code: number
  type: string | null
  data: Uint8Array
  family?: number
  ip?: string
  sourcePrefixLength?: number
  scopePrefixLength?: number
  timeout?: number
  tags?: number[]
}

export function ednsOptionLength(option: EdnsOption, code: number): number {
  if (option.data) return 4 + bytesOf(option.data, 'EDNS option data').length
  switch (code) {
    case 8:
      return 8 + Math.ceil((option.sourcePrefixLength || 0) / 8)
    case 11:
      return typeof option.timeout === 'number' ? 6 : 4
    case 12:
      return 4 + (option.length || 0)
    case 14:
      return 4 + (option.tags?.length ?? 0) * 2
  }
  throw new InvalidRecordError(`EDNS option ${option.code} needs data.`)
}

export function putEdnsOption(w: Writer, option: EdnsOption, code: number): void {
  putU16(w, code)
  if (option.data) {
    putU16(w, option.data.length)
    putBytes(w, option.data)
    return
  }
  switch (code) {
    case 8: {
      const ip = option.ip ?? ''
      const family = option.family || familyOf(ip)
      const prefix = option.sourcePrefixLength || 0
      const address = new Uint8Array(16)
      const target = { bytes: address, offset: 0, names: undefined }
      if (familyOf(ip) === 1) putIPv4(target, ip)
      else putIPv6(target, ip)
      const length = Math.ceil(prefix / 8)
      putU16(w, 4 + length)
      putU16(w, family)
      putU8(w, prefix)
      putU8(w, option.scopePrefixLength || 0)
      putBytes(w, address.subarray(0, length))
      return
    }
    case 11:
      if (option.timeout) {
        putU16(w, 2)
        putU16(w, option.timeout)
      } else putU16(w, 0)
      return
    case 12: {
      const length = option.length || 0
      putU16(w, length)
      w.bytes.fill(0, w.offset, w.offset + length)
      w.offset += length
      return
    }
    case 14:
      putU16(w, (option.tags?.length ?? 0) * 2)
      for (const tag of option.tags ?? []) putU16(w, tag)
  }
}

export function readEdnsOption(
  r: Reader,
  end: number,
  typeOf: (code: number) => string | null,
): DecodedEdnsOption {
  const code = u16(r, end)
  const length = u16(r, end)
  const optionEnd = r.offset + length
  need(r, length, end)
  const option: DecodedEdnsOption = { code, type: typeOf(code), data: bytes(r, length, end) }
  r.offset = optionEnd - length
  switch (code) {
    case 8: {
      option.family = u16(r, optionEnd)
      option.sourcePrefixLength = u8(r, optionEnd)
      option.scopePrefixLength = u8(r, optionEnd)
      const size = option.family === 1 ? 4 : 16
      const address = new Uint8Array(size)
      address.set(r.bytes.subarray(r.offset, Math.min(optionEnd, r.offset + size)))
      option.ip = size === 4 ? readIPv4(address, 0) : readIPv6(address, 0)
      break
    }
    case 11:
      if (length > 0) option.timeout = u16(r, optionEnd)
      break
    case 14: {
      const tags: number[] = []
      while (r.offset + 1 < optionEnd) tags.push(u16(r, optionEnd))
      option.tags = tags
    }
  }
  r.offset = optionEnd
  return option
}
