import { types, optionCodes, type OptionCode, type RecordType } from './codes.js'
import { InvalidInputError, UnsupportedError } from './errors.js'
import {
  bytes,
  bytesOf,
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
  rest,
  stringLength,
  u16,
  u32,
  u8,
  utf8Length,
  within,
  type Reader,
  type Writer,
} from './wire.js'

/** Reads and writes the RDATA of one record type, without the RDLENGTH prefix. */
export type Codec<input, output> = {
  length(data: input): number
  write(w: Writer, data: input): void
  read(r: Reader, end: number): output
}

type DigestData = { keyTag: number; algorithm: number; digestType: number; digest: Uint8Array }
type KeyData = { flags: number; algorithm: number; key: Uint8Array }

/**
 * The `data` of each record type that has a codec. `decode` returns the same shapes, except that
 * TXT strings are always `Uint8Array`.
 */
export type RecordData = {
  /** An IPv4 address, such as `'192.0.2.1'`. */
  A: string
  /** An IPv6 address. Decoded addresses are formatted as RFC 5952 recommends. */
  AAAA: string
  CNAME: string
  DNAME: string
  NS: string
  PTR: string
  MX: { preference: number; exchange: string }
  /**
   * `rname` is a mailbox written as a name: `hostmaster.example.com`, or
   * `host\.master.example.com` for a dot in the local part.
   */
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
  /** The character-strings of the record. A record holds one or more, each up to 255 bytes. */
  TXT: readonly (string | Uint8Array)[]
  NULL: Uint8Array
  HINFO: { cpu: string; os: string }
  /** `flags` is the whole flags byte. 128 is the issuer-critical bit. */
  CAA: { flags: number; tag: string; value: string }
  NAPTR: {
    order: number
    preference: number
    flags: string
    services: string
    regexp: string
    replacement: string
  }
  TLSA: { usage: number; selector: number; matchingType: number; certificate: Uint8Array }
  SSHFP: { algorithm: number; fingerprintType: number; fingerprint: Uint8Array }
  DS: DigestData
  CDS: DigestData
  /** The protocol field is always 3 and isn't part of the object. */
  DNSKEY: KeyData
  CDNSKEY: KeyData
  RRSIG: {
    typeCovered: RecordType
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
  NSEC: { nextDomain: string; types: readonly RecordType[] }
  NSEC3: {
    algorithm: number
    flags: number
    iterations: number
    salt: Uint8Array
    nextHashedOwner: Uint8Array
    types: readonly RecordType[]
  }
}

/** The `data` of each record type as `decode` returns it. */
export type DecodedRecordData = Omit<RecordData, 'TXT'> & { TXT: Uint8Array[] }

const address = (size: 4 | 16): Codec<string, string> => ({
  length: () => size,
  write: size === 4 ? putIPv4 : putIPv6,
  read(r, end) {
    if (end - r.offset !== size) {
      throw new InvalidInputError(`An address record must hold ${size} bytes.`)
    }
    r.offset += size
    return size === 4 ? readIPv4(r.bytes, end - 4) : readIPv6(r.bytes, end - 16)
  },
})

// RFC 3597 section 4 allows compression only inside the RDATA of the RFC 1035 types.
const compressedName = {
  length: nameLength,
  write: (w, name) => putName(w, name, true),
  read: readName,
} satisfies Codec<string, string>

const name = {
  ...compressedName,
  write: (w, name) => putName(w, name, false),
} satisfies Codec<string, string>

const mx = {
  length: (data) => 2 + nameLength(data.exchange),
  write(w, data) {
    putU16(w, data.preference)
    putName(w, data.exchange, true)
  },
  read: (r, end) => ({ preference: u16(r, end), exchange: readName(r, end) }),
} satisfies Codec<RecordData['MX'], RecordData['MX']>

const soa = {
  length: (data) => 20 + nameLength(data.mname) + nameLength(data.rname),
  write(w, data) {
    putName(w, data.mname, true)
    putName(w, data.rname, true)
    putU32(w, data.serial)
    putU32(w, data.refresh)
    putU32(w, data.retry)
    putU32(w, data.expire)
    putU32(w, data.minimum)
  },
  read: (r, end) => ({
    mname: readName(r, end),
    rname: readName(r, end),
    serial: u32(r, end),
    refresh: u32(r, end),
    retry: u32(r, end),
    expire: u32(r, end),
    minimum: u32(r, end),
  }),
} satisfies Codec<RecordData['SOA'], RecordData['SOA']>

const srv = {
  length: (data) => 6 + nameLength(data.target),
  write(w, data) {
    putU16(w, data.priority)
    putU16(w, data.weight)
    putU16(w, data.port)
    putName(w, data.target, false)
  },
  read: (r, end) => ({
    priority: u16(r, end),
    weight: u16(r, end),
    port: u16(r, end),
    target: readName(r, end),
  }),
} satisfies Codec<RecordData['SRV'], RecordData['SRV']>

const txt = {
  length(data) {
    if (!Array.isArray(data)) {
      throw new InvalidInputError('TXT data must be an array.')
    }
    let length = 0
    for (const item of data) {
      length += stringLength(item, 'A TXT string')
    }
    return length
  },
  write(w, data) {
    for (const item of data) {
      putString(w, item)
    }
  },
  read(r, end) {
    const strings: Uint8Array[] = []
    while (r.offset < end) {
      strings.push(bytes(r, u8(r, end), end))
    }
    return strings
  },
} satisfies Codec<RecordData['TXT'], DecodedRecordData['TXT']>

const raw = {
  length: (data) => bytesOf(data, 'Record data').length,
  write: putBytes,
  read: rest,
} satisfies Codec<Uint8Array, Uint8Array>

const hinfo = {
  length: (data) => stringLength(data.cpu, 'HINFO cpu') + stringLength(data.os, 'HINFO os'),
  write(w, data) {
    putString(w, data.cpu)
    putString(w, data.os)
  },
  read: (r, end) => ({ cpu: readString(r, end), os: readString(r, end) }),
} satisfies Codec<RecordData['HINFO'], RecordData['HINFO']>

const caa = {
  length: (data) => 1 + stringLength(data.tag, 'CAA tag') + utf8Length(data.value),
  write(w, data) {
    putU8(w, data.flags)
    putString(w, data.tag)
    putText(w, data.value)
  },
  read(r, end) {
    const flags = u8(r, end)
    const tag = readString(r, end)
    const value = readText(r.bytes, r.offset, end)
    r.offset = end
    return { flags, tag, value }
  },
} satisfies Codec<RecordData['CAA'], RecordData['CAA']>

const naptr = {
  length: (data) =>
    4 +
    stringLength(data.flags, 'NAPTR flags') +
    stringLength(data.services, 'NAPTR services') +
    stringLength(data.regexp, 'NAPTR regexp') +
    nameLength(data.replacement),
  write(w, data) {
    putU16(w, data.order)
    putU16(w, data.preference)
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
} satisfies Codec<RecordData['NAPTR'], RecordData['NAPTR']>

const tlsa = {
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
} satisfies Codec<RecordData['TLSA'], RecordData['TLSA']>

const sshfp = {
  length: (data) => 2 + bytesOf(data.fingerprint, 'SSHFP fingerprint').length,
  write(w, data) {
    putU8(w, data.algorithm)
    putU8(w, data.fingerprintType)
    putBytes(w, data.fingerprint)
  },
  read: (r, end) => ({
    algorithm: u8(r, end),
    fingerprintType: u8(r, end),
    fingerprint: rest(r, end),
  }),
} satisfies Codec<RecordData['SSHFP'], RecordData['SSHFP']>

const ds = {
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
} satisfies Codec<DigestData, DigestData>

const PROTOCOL_DNSSEC = 3

const dnskey = {
  length: (data) => 4 + bytesOf(data.key, 'DNSKEY key').length,
  write(w, data) {
    putU16(w, data.flags)
    putU8(w, PROTOCOL_DNSSEC)
    putU8(w, data.algorithm)
    putBytes(w, data.key)
  },
  read(r, end) {
    const flags = u16(r, end)
    if (u8(r, end) !== PROTOCOL_DNSSEC) {
      throw new InvalidInputError('DNSKEY protocol must be 3.')
    }
    return { flags, algorithm: u8(r, end), key: rest(r, end) }
  },
} satisfies Codec<KeyData, KeyData>

const rrsig = {
  length: (data) =>
    18 + nameLength(data.signersName) + bytesOf(data.signature, 'RRSIG signature').length,
  write(w, data) {
    putU16(w, types.value(data.typeCovered))
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
    typeCovered: types.name(u16(r, end)),
    algorithm: u8(r, end),
    labels: u8(r, end),
    originalTTL: u32(r, end),
    expiration: u32(r, end),
    inception: u32(r, end),
    keyTag: u16(r, end),
    signersName: readName(r, end),
    signature: rest(r, end),
  }),
} satisfies Codec<RecordData['RRSIG'], RecordData['RRSIG']>

const rp = {
  length: (data) => nameLength(data.mbox) + nameLength(data.txt),
  write(w, data) {
    putName(w, data.mbox, false)
    putName(w, data.txt, false)
  },
  read: (r, end) => ({ mbox: readName(r, end), txt: readName(r, end) }),
} satisfies Codec<RecordData['RP'], RecordData['RP']>

function typeWindows(list: readonly RecordType[]): Uint8Array[] {
  const windows: Uint8Array[] = []
  for (const name of list) {
    const type = types.value(name)
    const window = (windows[type >> 8] ??= new Uint8Array(32))
    window[(type >> 3) & 0x1f]! |= 0x80 >> (type & 7)
  }
  return windows
}

const usedLength = (window: Uint8Array) => {
  let length = 32
  while (length > 0 && window[length - 1] === 0) {
    length--
  }
  return length
}

function typeBitmapLength(list: readonly RecordType[]): number {
  let length = 0
  for (const window of typeWindows(list)) {
    if (window) {
      length += 2 + usedLength(window)
    }
  }
  return length
}

function putTypeBitmap(w: Writer, list: readonly RecordType[]): void {
  const windows = typeWindows(list)
  for (let i = 0; i < windows.length; i++) {
    const window = windows[i]
    if (!window) {
      continue
    }
    const length = usedLength(window)
    putU8(w, i)
    putU8(w, length)
    putBytes(w, window.subarray(0, length))
  }
}

function readTypeBitmap(r: Reader, end: number): RecordType[] {
  const list: RecordType[] = []
  while (r.offset < end) {
    const window = u8(r, end)
    const length = u8(r, end)
    if (length === 0 || length > 32) {
      throw new InvalidInputError('A type bitmap window holds 1 to 32 bytes.')
    }
    need(r, length, end)
    for (let i = 0; i < length; i++) {
      const byte = r.bytes[r.offset + i]!
      for (let bit = 0; bit < 8; bit++) {
        if (byte & (0x80 >> bit)) {
          list.push(types.name((window << 8) | (i << 3) | bit))
        }
      }
    }
    r.offset += length
  }
  return list
}

const nsec = {
  length: (data) => nameLength(data.nextDomain) + typeBitmapLength(data.types),
  write(w, data) {
    putName(w, data.nextDomain, false)
    putTypeBitmap(w, data.types)
  },
  read: (r, end) => ({ nextDomain: readName(r, end), types: readTypeBitmap(r, end) }),
} satisfies Codec<RecordData['NSEC'], RecordData['NSEC']>

const nsec3 = {
  length: (data) =>
    4 +
    stringLength(bytesOf(data.salt, 'NSEC3 salt'), 'NSEC3 salt') +
    stringLength(bytesOf(data.nextHashedOwner, 'NSEC3 nextHashedOwner'), 'NSEC3 nextHashedOwner') +
    typeBitmapLength(data.types),
  write(w, data) {
    putU8(w, data.algorithm)
    putU8(w, data.flags)
    putU16(w, data.iterations)
    putString(w, data.salt)
    putString(w, data.nextHashedOwner)
    putTypeBitmap(w, data.types)
  },
  read(r, end) {
    const algorithm = u8(r, end)
    const flags = u8(r, end)
    const iterations = u16(r, end)
    const salt = bytes(r, u8(r, end), end)
    const nextHashedOwner = bytes(r, u8(r, end), end)
    return { algorithm, flags, iterations, salt, nextHashedOwner, types: readTypeBitmap(r, end) }
  },
} satisfies Codec<RecordData['NSEC3'], RecordData['NSEC3']>

export const codecs: {
  readonly [key in keyof RecordData]: Codec<RecordData[key], DecodedRecordData[key]>
} = {
  A: address(4),
  AAAA: address(16),
  CNAME: compressedName,
  DNAME: name,
  NS: compressedName,
  PTR: compressedName,
  MX: mx,
  SOA: soa,
  SRV: srv,
  TXT: txt,
  NULL: raw,
  HINFO: hinfo,
  CAA: caa,
  NAPTR: naptr,
  TLSA: tlsa,
  SSHFP: sshfp,
  DS: ds,
  CDS: ds,
  DNSKEY: dnskey,
  CDNSKEY: dnskey,
  RRSIG: rrsig,
  RP: rp,
  NSEC: nsec,
  NSEC3: nsec3,
}

export const unknown: Codec<Uint8Array, Uint8Array> = raw

/**
 * An EDNS option inside an OPT record. CLIENT_SUBNET, TCP_KEEPALIVE, PADDING and KEY_TAG have
 * fields. For any other code, `data` holds the raw bytes.
 */
export type EdnsOption =
  | {
      code: 'CLIENT_SUBNET'
      /** The client address. Only the first `sourcePrefixLength` bits are sent. */
      ip: string
      sourcePrefixLength: number
      /** @default 0 */
      scopePrefixLength?: number | undefined
    }
  | {
      code: 'TCP_KEEPALIVE'
      /** Idle timeout in units of 100 ms. Clients leave it out. */
      timeout?: number | undefined
    }
  | {
      code: 'PADDING'
      /** Number of zero bytes. */
      length: number
    }
  | { code: 'KEY_TAG'; tags: readonly number[] }
  | {
      code: Exclude<OptionCode, 'CLIENT_SUBNET' | 'TCP_KEEPALIVE' | 'PADDING' | 'KEY_TAG'>
      data: Uint8Array
    }

const isIPv6 = (ip: string) => typeof ip === 'string' && ip.includes(':')

export function ednsOptionLength(option: EdnsOption): number {
  switch (option.code) {
    case 'CLIENT_SUBNET':
      return 8 + Math.ceil(option.sourcePrefixLength / 8)
    case 'TCP_KEEPALIVE':
      return option.timeout === undefined ? 4 : 6
    case 'PADDING':
      return 4 + option.length
    case 'KEY_TAG':
      return 4 + option.tags.length * 2
  }
  optionCodes.value(option.code)
  if (option.data === undefined) {
    throw new UnsupportedError(`EDNS option ${option.code} has no encoder. Pass its bytes as data.`)
  }
  return 4 + bytesOf(option.data, 'EDNS option data').length
}

export function putEdnsOption(w: Writer, option: EdnsOption): void {
  putU16(w, optionCodes.value(option.code))
  switch (option.code) {
    case 'CLIENT_SUBNET': {
      const v6 = isIPv6(option.ip)
      const prefix = option.sourcePrefixLength
      if (prefix > (v6 ? 128 : 32)) {
        throw new InvalidInputError(`CLIENT_SUBNET prefix ${prefix} is too long.`)
      }
      const full = new Uint8Array(16)
      const target = { bytes: full, offset: 0, start: 0, names: undefined }
      if (v6) {
        putIPv6(target, option.ip)
      } else {
        putIPv4(target, option.ip)
      }
      const length = Math.ceil(prefix / 8)
      const sent = full.slice(0, length)
      if (prefix % 8) {
        sent[length - 1]! &= 0xff << (8 - (prefix % 8))
      }
      putU16(w, 4 + length)
      putU16(w, v6 ? 2 : 1)
      putU8(w, prefix)
      putU8(w, option.scopePrefixLength ?? 0)
      putBytes(w, sent)
      return
    }
    case 'TCP_KEEPALIVE':
      if (option.timeout === undefined) {
        putU16(w, 0)
      } else {
        putU16(w, 2)
        putU16(w, option.timeout)
      }
      return
    case 'PADDING':
      putU16(w, option.length)
      w.bytes.fill(0, w.offset, w.offset + option.length)
      w.offset += option.length
      return
    case 'KEY_TAG':
      putU16(w, option.tags.length * 2)
      for (const tag of option.tags) {
        putU16(w, tag)
      }
      return
  }
  putU16(w, option.data.length)
  putBytes(w, option.data)
}

export function readEdnsOption(r: Reader, end: number): EdnsOption {
  const code = optionCodes.name(u16(r, end))
  const length = u16(r, end)
  need(r, length, end)
  const optionEnd = r.offset + length
  const option = within(code, () => readOptionBody(r, code, optionEnd))
  if (r.offset !== optionEnd) {
    throw new InvalidInputError(`Malformed EDNS option ${code}.`)
  }
  return option
}

function readOptionBody(r: Reader, code: OptionCode, end: number): EdnsOption {
  switch (code) {
    case 'CLIENT_SUBNET': {
      const family = u16(r, end)
      const sourcePrefixLength = u8(r, end)
      const scopePrefixLength = u8(r, end)
      const size = family === 1 ? 4 : family === 2 ? 16 : 0
      if (size === 0 || end - r.offset > size) {
        throw new InvalidInputError('Malformed EDNS option CLIENT_SUBNET.')
      }
      const full = new Uint8Array(size)
      full.set(rest(r, end))
      const ip = size === 4 ? readIPv4(full, 0) : readIPv6(full, 0)
      return { code, ip, sourcePrefixLength, scopePrefixLength }
    }
    case 'TCP_KEEPALIVE':
      if (end - r.offset === 0) {
        return { code }
      }
      if (end - r.offset !== 2) {
        throw new InvalidInputError('Malformed EDNS option TCP_KEEPALIVE.')
      }
      return { code, timeout: u16(r, end) }
    case 'PADDING': {
      const length = end - r.offset
      r.offset = end
      return { code, length }
    }
    case 'KEY_TAG': {
      const tags: number[] = []
      while (r.offset < end) {
        tags.push(u16(r, end))
      }
      return { code, tags }
    }
  }
  return { code, data: rest(r, end) }
}
