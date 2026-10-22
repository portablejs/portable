import {
  classes,
  opcodes,
  rcodes,
  types,
  type Opcode,
  type Rcode,
  type RecordClass,
  type RecordType,
} from './codes.js'
import { InvalidInputError, TruncatedError } from './errors.js'
import {
  codecs,
  ednsOptionLength,
  putEdnsOption,
  readEdnsOption,
  unknown,
  type Codec,
  type DecodedRecordData,
  type EdnsOption,
  type RecordData,
} from './records.js'
import {
  nameLength,
  need,
  putName,
  putU16,
  putU32,
  putU8,
  readName,
  u16,
  u32,
  u8,
  within,
  type Reader,
  type Writer,
} from './wire.js'

/** Header flags. Each is one bit of the header, and a missing flag is clear. */
export type Flags = {
  /** AA: the answer comes from a server authoritative for the name. */
  aa?: boolean | undefined
  /** TC: the message was truncated to fit the transport. */
  tc?: boolean | undefined
  /** RD: ask the server to resolve the query recursively. */
  rd?: boolean | undefined
  /** RA: the server supports recursion. */
  ra?: boolean | undefined
  /** AD: the server validated the answer with DNSSEC. */
  ad?: boolean | undefined
  /** CD: the server should not validate DNSSEC. */
  cd?: boolean | undefined
}

/** A question: the name, type and class being looked up. */
export type Question = {
  name: string
  type: RecordType
  /** @default 'IN' */
  class?: RecordClass | undefined
  /** The mDNS unicast-response bit, the top bit of the class field (RFC 6762). */
  qu?: boolean | undefined
}

type KnownType = keyof RecordData

/** A record type with no codec here. Its `data` is the raw RDATA. */
export type UnknownType = Exclude<RecordType, KnownType | 'OPT'>

type Fields = {
  name: string
  /** Time to live in seconds. @default 0 */
  ttl?: number | undefined
  /** @default 'IN' */
  class?: RecordClass | undefined
  /** The mDNS cache-flush bit, the top bit of the class field (RFC 6762). */
  flush?: boolean | undefined
}

/** The EDNS OPT pseudo-record (RFC 6891). It goes in `additionals`. */
export type OptRecord = {
  type: 'OPT'
  /** Always the root. @default '.' */
  name?: '.' | undefined
  /** Largest UDP response the sender accepts. @default 4096 */
  udpPayloadSize?: number | undefined
  /** The upper 8 bits of the 12-bit response code. @default 0 */
  extendedRcode?: number | undefined
  /** @default 0 */
  version?: number | undefined
  /** DO: the sender wants DNSSEC records. */
  dnssecOk?: boolean | undefined
  options?: readonly EdnsOption[] | undefined
}

/** A resource record in the answer, authority or additional section. */
export type ResourceRecord =
  | { [T in KnownType]: Fields & { type: T; data: RecordData[T] } }[KnownType]
  | (Fields & { type: UnknownType; data: Uint8Array })
  | OptRecord

/** A DNS message to encode. Missing fields take their defaults and missing sections are empty. */
export type Packet = {
  /** @default 0 */
  id?: number | undefined
  /** Sets the QR bit. @default 'query' */
  type?: 'query' | 'response' | undefined
  /** @default 'QUERY' */
  opcode?: Opcode | undefined
  /** @default 'NOERROR' */
  rcode?: Rcode | undefined
  flags?: Flags | undefined
  questions?: readonly Question[] | undefined
  answers?: readonly ResourceRecord[] | undefined
  authorities?: readonly ResourceRecord[] | undefined
  additionals?: readonly ResourceRecord[] | undefined
}

/** A question as `decode` returns it. */
export type DecodedQuestion = { name: string; type: RecordType; class: RecordClass; qu: boolean }

type DecodedFields = { name: string; ttl: number; class: RecordClass; flush: boolean }

/** An OPT record as `decode` returns it. */
export type DecodedOptRecord = {
  type: 'OPT'
  name: '.'
  udpPayloadSize: number
  extendedRcode: number
  version: number
  dnssecOk: boolean
  options: EdnsOption[]
}

/** A resource record as `decode` returns it. */
export type DecodedResourceRecord =
  | { [T in KnownType]: DecodedFields & { type: T; data: DecodedRecordData[T] } }[KnownType]
  | (DecodedFields & { type: UnknownType; data: Uint8Array })
  | DecodedOptRecord

/** A DNS message as `decode` returns it, with every field present. */
export type DecodedPacket = {
  id: number
  type: 'query' | 'response'
  opcode: Opcode
  rcode: Rcode
  flags: { [K in keyof Flags]-?: boolean }
  questions: DecodedQuestion[]
  answers: DecodedResourceRecord[]
  authorities: DecodedResourceRecord[]
  additionals: DecodedResourceRecord[]
}

type AnyCodec = Codec<unknown, unknown>

const codecFor = (type: string): AnyCodec =>
  (Object.hasOwn(codecs, type) ? codecs[type as KnownType] : unknown) as AnyCodec

const none: readonly never[] = []
const TOP_BIT = 0x8000

const flagBits = { aa: 0x400, tc: 0x200, rd: 0x100, ra: 0x80, ad: 0x20, cd: 0x10 } as const
const flagNames = Object.keys(flagBits) as (keyof typeof flagBits)[]

function recordLength(record: ResourceRecord): number {
  if (record.type === 'OPT') {
    let length = 11
    for (const option of record.options ?? none) length += ednsOptionLength(option)
    return length
  }
  return nameLength(record.name) + 10 + codecFor(record.type).length(record.data)
}

function sectionLength(records: readonly ResourceRecord[]): number {
  let length = 0
  for (const record of records) length += recordLength(record)
  return length
}

/** Returns the uncompressed length of `packet`, checking every name and record on the way. */
function encodingLength(packet: Packet): number {
  let length = 12
  for (const q of packet.questions ?? none) length += nameLength(q.name) + 4
  return (
    length +
    sectionLength(packet.answers ?? none) +
    sectionLength(packet.authorities ?? none) +
    sectionLength(packet.additionals ?? none)
  )
}

function finishRdata(w: Writer, start: number): void {
  const length = w.offset - start
  w.bytes[start - 2] = length >>> 8
  w.bytes[start - 1] = length
}

function putRecord(w: Writer, record: ResourceRecord): void {
  if (record.type === 'OPT') {
    if ((record.name ?? '.') !== '.') throw new InvalidInputError('An OPT record name must be ".".')
    putU8(w, 0)
    putU16(w, 41)
    putU16(w, record.udpPayloadSize ?? 4096)
    putU8(w, record.extendedRcode ?? 0)
    putU8(w, record.version ?? 0)
    putU16(w, record.dnssecOk ? TOP_BIT : 0)
    const start = (w.offset += 2)
    for (const option of record.options ?? none) putEdnsOption(w, option)
    finishRdata(w, start)
    return
  }
  putName(w, record.name, true)
  putU16(w, types.value(record.type))
  putU16(w, classes.value(record.class ?? 'IN') | (record.flush ? TOP_BIT : 0))
  putU32(w, record.ttl ?? 0)
  const start = (w.offset += 2)
  codecFor(record.type).write(w, record.data)
  finishRdata(w, start)
}

export declare namespace encode {
  type Options = {
    /**
     * Replace repeated names with pointers to their first copy (RFC 1035 section 4.1.4). Applies
     * to owner names and to names inside NS, CNAME, PTR, MX and SOA records.
     * @default false
     */
    compress?: boolean | undefined
    /**
     * `'tcp'` adds the 2-byte length prefix used over TCP and TLS (RFC 1035 section 4.2.2).
     * @default 'none'
     */
    framing?: 'none' | 'tcp' | undefined
  }
}

/**
 * Encodes a DNS message into its wire format, as sent over UDP or as a DNS-over-HTTPS body.
 * Throws `InvalidInputError` for a name, address or record that can't be encoded, and
 * `UnsupportedError` for an EDNS option with no `data` and no built-in encoder.
 *
 * @example
 * ```ts
 * import * as DnsPacket from '@portable/dns-packet'
 *
 * const query = DnsPacket.encode({
 *   id: 1,
 *   flags: { rd: true },
 *   questions: [{ name: 'example.com', type: 'A' }],
 * })
 * ```
 */
export function encode(packet: Packet, options: encode.Options = {}): Uint8Array<ArrayBuffer> {
  const tcp = options.framing === 'tcp'
  const length = encodingLength(packet) + (tcp ? 2 : 0)
  if (tcp && length > 0xffff + 2)
    throw new InvalidInputError('A TCP message is limited to 65535 bytes.')
  const w: Writer = {
    bytes: new Uint8Array(length),
    offset: tcp ? 2 : 0,
    start: tcp ? 2 : 0,
    names: options.compress ? new Map() : undefined,
  }
  const questions = packet.questions ?? none
  const answers = packet.answers ?? none
  const authorities = packet.authorities ?? none
  const additionals = packet.additionals ?? none
  let bits =
    (opcodes.value(packet.opcode ?? 'QUERY') << 11) | rcodes.value(packet.rcode ?? 'NOERROR')
  if (packet.type === 'response') bits |= TOP_BIT
  for (const flag of flagNames) if (packet.flags?.[flag]) bits |= flagBits[flag]
  putU16(w, packet.id ?? 0)
  putU16(w, bits)
  putU16(w, questions.length)
  putU16(w, answers.length)
  putU16(w, authorities.length)
  putU16(w, additionals.length)
  for (const q of questions) {
    putName(w, q.name, true)
    putU16(w, types.value(q.type))
    putU16(w, classes.value(q.class ?? 'IN') | (q.qu ? TOP_BIT : 0))
  }
  for (const record of answers) putRecord(w, record)
  for (const record of authorities) putRecord(w, record)
  for (const record of additionals) putRecord(w, record)
  if (tcp) {
    const size = w.offset - 2
    w.bytes[0] = size >>> 8
    w.bytes[1] = size
  }
  return w.offset === length ? w.bytes : w.bytes.subarray(0, w.offset)
}

function rdataEnd(r: Reader): number {
  const length = u16(r, r.bytes.length)
  need(r, length, r.bytes.length)
  return r.offset + length
}

function readRecord(r: Reader): DecodedResourceRecord {
  const end = r.bytes.length
  const name = readName(r, end)
  const type = types.name(u16(r, end))
  if (type === 'OPT') {
    if (name !== '.') throw new InvalidInputError('An OPT record name must be ".".')
    const udpPayloadSize = u16(r, end)
    const extendedRcode = u8(r, end)
    const version = u8(r, end)
    const dnssecOk = (u16(r, end) & TOP_BIT) !== 0
    const rdEnd = rdataEnd(r)
    const options: EdnsOption[] = []
    while (r.offset < rdEnd) options.push(within('OPT', () => readEdnsOption(r, rdEnd)))
    return { type, name, udpPayloadSize, extendedRcode, version, dnssecOk, options }
  }
  const klass = u16(r, end)
  const ttl = u32(r, end)
  const rdEnd = rdataEnd(r)
  const data = within(type, () => codecFor(type).read(r, rdEnd))
  if (r.offset !== rdEnd) throw new InvalidInputError(`${type} record data has trailing bytes.`)
  return {
    type,
    name,
    ttl,
    class: classes.name(klass & ~TOP_BIT),
    flush: (klass & TOP_BIT) !== 0,
    data,
  } as DecodedResourceRecord
}

export declare namespace decode {
  type Options = {
    /** `'tcp'` reads the 2-byte length prefix used over TCP and TLS first. @default 'none' */
    framing?: 'none' | 'tcp' | undefined
  }
}

/**
 * Decodes a DNS message from its wire format. Compression pointers are followed, and each must
 * point backwards, so a pointer loop can't hang the decoder. Bytes after the message are ignored.
 * Throws `TruncatedError` when the input ends early (with `framing: 'tcp'`, also when the whole
 * message hasn't arrived yet) and `InvalidInputError` for malformed input.
 *
 * @example
 * ```ts
 * import * as DnsPacket from '@portable/dns-packet'
 *
 * const response = await fetch('https://cloudflare-dns.com/dns-query', {
 *   method: 'POST',
 *   headers: { 'content-type': 'application/dns-message' },
 *   body: query,
 * })
 * const packet = DnsPacket.decode(new Uint8Array(await response.arrayBuffer()))
 * for (const answer of packet.answers) if (answer.type === 'A') console.log(answer.data)
 * ```
 */
export function decode(bytes: Uint8Array, options: decode.Options = {}): DecodedPacket {
  if (options.framing === 'tcp') {
    if (bytes.length < 2) throw new TruncatedError('The TCP length prefix is 2 bytes.')
    const length = (bytes[0]! << 8) | bytes[1]!
    if (bytes.length < length + 2)
      throw new TruncatedError(`The message is ${length} bytes, and ${bytes.length - 2} arrived.`)
    bytes = bytes.subarray(2, 2 + length)
  }
  if (bytes.length < 12) throw new TruncatedError('A DNS header is 12 bytes.')
  const r: Reader = { bytes, offset: 0 }
  const end = bytes.length
  const id = u16(r, end)
  const bits = u16(r, end)
  const counts = [u16(r, end), u16(r, end), u16(r, end), u16(r, end)] as const
  const questions: DecodedQuestion[] = []
  for (let i = 0; i < counts[0]; i++) {
    const name = readName(r, end)
    const type = types.name(u16(r, end))
    const klass = u16(r, end)
    questions.push({ name, type, class: classes.name(klass & ~TOP_BIT), qu: klass >= TOP_BIT })
  }
  const section = (count: number) => {
    const records: DecodedResourceRecord[] = []
    for (let i = 0; i < count; i++) records.push(readRecord(r))
    return records
  }
  return {
    id,
    type: bits & TOP_BIT ? 'response' : 'query',
    opcode: opcodes.name((bits >> 11) & 0xf),
    rcode: rcodes.name(bits & 0xf),
    flags: {
      aa: (bits & flagBits.aa) !== 0,
      tc: (bits & flagBits.tc) !== 0,
      rd: (bits & flagBits.rd) !== 0,
      ra: (bits & flagBits.ra) !== 0,
      ad: (bits & flagBits.ad) !== 0,
      cd: (bits & flagBits.cd) !== 0,
    },
    questions,
    answers: section(counts[1]),
    authorities: section(counts[2]),
    additionals: section(counts[3]),
  }
}
