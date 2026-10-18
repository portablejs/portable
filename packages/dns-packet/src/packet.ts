import * as classes from './classes.js'
import { InvalidRecordError, TruncatedError } from './errors.js'
import * as opcodes from './opcodes.js'
import * as optioncodes from './optioncodes.js'
import * as rcodes from './rcodes.js'
import {
  codecs,
  ednsOptionLength,
  putEdnsOption,
  readEdnsOption,
  unknown,
  type Codec,
  type DecodedEdnsOption,
  type DecodedRecordData,
  type EdnsOption,
  type RecordData,
} from './records.js'
import * as types from './types.js'
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
  type Reader,
  type Writer,
} from './wire.js'

/** A question: the name and type being looked up. */
export type Question = {
  type: types.RecordType
  name: string
  /** @default 'IN' */
  class?: classes.RecordClass | undefined
}

/** A question as `decode` returns it. */
export type DecodedQuestion = { type: types.RecordType; name: string; class: classes.RecordClass }

type KnownType = keyof RecordData

/** A record type that has no codec here. Its data is the raw RDATA bytes. */
export type UnknownType = Exclude<types.RecordType, KnownType | 'OPT'>

type RecordFields = {
  name: string
  /** Time to live in seconds. @default 0 */
  ttl?: number | undefined
  /** @default 'IN' */
  class?: classes.RecordClass | undefined
  /** The mDNS cache-flush bit, the top bit of the class field. */
  flush?: boolean | undefined
}

type DecodedRecordFields = {
  name: string
  ttl: number
  class: classes.RecordClass
  flush: boolean
}

/** An EDNS OPT pseudo-record (RFC 6891). Its name must be the root, `'.'`. */
export type OptAnswer = {
  type: 'OPT'
  name: string
  /** @default 4096 */
  udpPayloadSize?: number | undefined
  extendedRcode?: number | undefined
  ednsVersion?: number | undefined
  /** EDNS flags, such as `DNSSEC_OK`. */
  flags?: number | undefined
  options?: readonly EdnsOption[] | undefined
}

/** An OPT record as `decode` returns it. */
export type DecodedOptAnswer = {
  type: 'OPT'
  name: string
  udpPayloadSize: number
  extendedRcode: number
  ednsVersion: number
  flags: number
  flag_do: boolean
  options: DecodedEdnsOption[]
}

/** A resource record in the answer, authority or additional section. */
export type Answer =
  | { [T in KnownType]: RecordFields & { type: T; data: RecordData[T] } }[KnownType]
  | (RecordFields & { type: UnknownType; data: Uint8Array })
  | OptAnswer

/** A resource record as `decode` returns it. */
export type DecodedAnswer =
  | { [T in KnownType]: DecodedRecordFields & { type: T; data: DecodedRecordData[T] } }[KnownType]
  | (DecodedRecordFields & { type: UnknownType; data: Uint8Array })
  | DecodedOptAnswer

/** A DNS message to encode. Missing sections are empty. */
export type Packet = {
  /** Sets the QR bit. @default 'query' */
  type?: 'query' | 'response' | undefined
  /** @default 0 */
  id?: number | undefined
  /** The header bits below QR: opcode, AA, TC, RD, RA, Z, AD, CD and rcode. @default 0 */
  flags?: number | undefined
  questions?: readonly Question[] | undefined
  answers?: readonly Answer[] | undefined
  authorities?: readonly Answer[] | undefined
  additionals?: readonly Answer[] | undefined
}

/** A DNS message as `decode` returns it, with the header flags split out. */
export type DecodedPacket = {
  id: number
  type: 'query' | 'response'
  /** The header bits below QR. */
  flags: number
  flag_qr: boolean
  opcode: opcodes.Opcode
  flag_aa: boolean
  flag_tc: boolean
  flag_rd: boolean
  flag_ra: boolean
  flag_z: boolean
  flag_ad: boolean
  flag_cd: boolean
  rcode: rcodes.Rcode
  questions: DecodedQuestion[]
  answers: DecodedAnswer[]
  authorities: DecodedAnswer[]
  additionals: DecodedAnswer[]
}

type AnyCodec = Codec<unknown, unknown>

const codecFor = (type: string): AnyCodec =>
  (Object.hasOwn(codecs, type) ? codecs[type as KnownType] : unknown) as AnyCodec

const empty: readonly never[] = []
const FLUSH = 0x8000

function questionLength(q: Question): number {
  return nameLength(q.name) + 4
}

function answerLength(answer: Answer): number {
  const base = nameLength(answer.name) + 10
  if (answer.type === 'OPT') {
    let length = base
    for (const option of answer.options ?? empty)
      length += ednsOptionLength(option, optioncodes.toCode(option.code))
    return length
  }
  return base + codecFor(answer.type).length(answer.data)
}

function sectionLength(answers: readonly Answer[]): number {
  let length = 0
  for (const answer of answers) length += answerLength(answer)
  return length
}

/**
 * Returns the number of bytes `encode` writes for `packet` without name compression. With
 * `compress: true`, `encode` returns this many bytes or fewer.
 *
 * @example
 * ```ts
 * import { encodingLength } from '@portable/dns-packet'
 *
 * encodingLength({ questions: [{ type: 'A', name: 'example.com' }] }) // 29
 * ```
 */
export function encodingLength(packet: Packet): number {
  let length = 12
  for (const q of packet.questions ?? empty) length += questionLength(q)
  return (
    length +
    sectionLength(packet.answers ?? empty) +
    sectionLength(packet.authorities ?? empty) +
    sectionLength(packet.additionals ?? empty)
  )
}

function putAnswer(w: Writer, answer: Answer): void {
  putName(w, answer.name, true)
  putU16(w, types.toType(answer.type))
  if (answer.type === 'OPT') {
    if (answer.name !== '.') throw new InvalidRecordError('OPT name must be root.')
    putU16(w, answer.udpPayloadSize || 4096)
    putU8(w, answer.extendedRcode || 0)
    putU8(w, answer.ednsVersion || 0)
    putU16(w, answer.flags || 0)
    const start = (w.offset += 2)
    for (const option of answer.options ?? empty)
      putEdnsOption(w, option, optioncodes.toCode(option.code))
    w.bytes[start - 2] = (w.offset - start) >>> 8
    w.bytes[start - 1] = w.offset - start
    return
  }
  let klass = classes.toClass(answer.class ?? 'IN')
  if (answer.flush) klass |= FLUSH
  putU16(w, klass)
  putU32(w, answer.ttl || 0)
  const start = (w.offset += 2)
  codecFor(answer.type).write(w, answer.data)
  w.bytes[start - 2] = (w.offset - start) >>> 8
  w.bytes[start - 1] = w.offset - start
}

export declare namespace encode {
  type Options = {
    /**
     * Replace repeated domain names with pointers (RFC 1035 section 4.1.4). Applies to owner
     * names and to names inside NS, CNAME, PTR, MX and SOA records. Off by default, so the output
     * matches dns-packet byte for byte.
     * @default false
     */
    compress?: boolean | undefined
  }
}

/**
 * Encodes a DNS message into its wire format, as sent over UDP or in a DNS-over-HTTPS body.
 *
 * @example
 * ```ts
 * import { encode, RECURSION_DESIRED } from '@portable/dns-packet'
 *
 * const query = encode({
 *   id: 1,
 *   flags: RECURSION_DESIRED,
 *   questions: [{ type: 'A', name: 'example.com' }],
 * })
 * ```
 */
export function encode(packet: Packet, options: encode.Options = {}): Uint8Array {
  const length = encodingLength(packet)
  const w: Writer = {
    bytes: new Uint8Array(length),
    offset: 0,
    names: options.compress ? new Map() : undefined,
  }
  const questions = packet.questions ?? empty
  const answers = packet.answers ?? empty
  const authorities = packet.authorities ?? empty
  const additionals = packet.additionals ?? empty
  putU16(w, packet.id || 0)
  putU16(w, ((packet.flags || 0) & 0x7fff) | (packet.type === 'response' ? 0x8000 : 0))
  putU16(w, questions.length)
  putU16(w, answers.length)
  putU16(w, authorities.length)
  putU16(w, additionals.length)
  for (const q of questions) {
    putName(w, q.name, true)
    putU16(w, types.toType(q.type))
    putU16(w, classes.toClass(q.class ?? 'IN'))
  }
  for (const answer of answers) putAnswer(w, answer)
  for (const answer of authorities) putAnswer(w, answer)
  for (const answer of additionals) putAnswer(w, answer)
  return w.offset === length ? w.bytes : w.bytes.subarray(0, w.offset)
}

function readAnswer(r: Reader): DecodedAnswer {
  const end = r.bytes.length
  const name = readName(r, end)
  const type = types.toString(u16(r, end))
  if (type === 'OPT') {
    const udpPayloadSize = u16(r, end)
    const extendedRcode = u8(r, end)
    const ednsVersion = u8(r, end)
    const flags = u16(r, end)
    const rdEnd = rdataEnd(r)
    const options: DecodedEdnsOption[] = []
    while (r.offset < rdEnd) options.push(readEdnsOption(r, rdEnd, optioncodes.toString))
    return {
      name,
      type,
      udpPayloadSize,
      extendedRcode,
      ednsVersion,
      flags,
      flag_do: (flags & 0x8000) !== 0,
      options,
    }
  }
  const klass = u16(r, end)
  const ttl = u32(r, end)
  const rdEnd = rdataEnd(r)
  const data = codecFor(type).read(r, rdEnd)
  r.offset = rdEnd
  return {
    name,
    type,
    ttl,
    class: classes.toString(klass & ~FLUSH),
    flush: (klass & FLUSH) !== 0,
    data,
  } as DecodedAnswer
}

function rdataEnd(r: Reader): number {
  const length = u16(r, r.bytes.length)
  need(r, length, r.bytes.length)
  return r.offset + length
}

/**
 * Decodes a DNS message from its wire format. Compression pointers are followed, and each must
 * point before the name that contains it. Throws `TruncatedError`, `InvalidNameError`,
 * `InvalidPointerError` or `InvalidRecordError` on malformed input. Bytes after the last record
 * are ignored.
 *
 * @example
 * ```ts
 * import { decode } from '@portable/dns-packet'
 *
 * const response = await fetch('https://cloudflare-dns.com/dns-query', {
 *   method: 'POST',
 *   headers: { 'content-type': 'application/dns-message' },
 *   body: query,
 * })
 * const packet = decode(new Uint8Array(await response.arrayBuffer()))
 * for (const answer of packet.answers) if (answer.type === 'A') console.log(answer.data)
 * ```
 */
export function decode(bytes: Uint8Array): DecodedPacket {
  if (bytes.length < 12) throw new TruncatedError('A DNS header is 12 bytes.')
  const r: Reader = { bytes, offset: 0 }
  const end = bytes.length
  const id = u16(r, end)
  const flags = u16(r, end)
  const counts = [u16(r, end), u16(r, end), u16(r, end), u16(r, end)] as const
  const questions: DecodedQuestion[] = []
  for (let i = 0; i < counts[0]; i++) {
    const name = readName(r, end)
    questions.push({
      name,
      type: types.toString(u16(r, end)),
      class: classes.toString(u16(r, end)),
    })
  }
  const section = (count: number) => {
    const answers: DecodedAnswer[] = []
    for (let i = 0; i < count; i++) answers.push(readAnswer(r))
    return answers
  }
  return {
    id,
    type: flags & 0x8000 ? 'response' : 'query',
    flags: flags & 0x7fff,
    flag_qr: (flags & 0x8000) !== 0,
    opcode: opcodes.toString((flags >> 11) & 0xf),
    flag_aa: (flags & 0x400) !== 0,
    flag_tc: (flags & 0x200) !== 0,
    flag_rd: (flags & 0x100) !== 0,
    flag_ra: (flags & 0x80) !== 0,
    flag_z: (flags & 0x40) !== 0,
    flag_ad: (flags & 0x20) !== 0,
    flag_cd: (flags & 0x10) !== 0,
    rcode: rcodes.toString(flags & 0xf),
    questions,
    answers: section(counts[1]),
    authorities: section(counts[2]),
    additionals: section(counts[3]),
  }
}

/**
 * Encodes a DNS message with the 2-byte length prefix used over TCP and TLS (RFC 1035 section 4.2.2).
 *
 * @example
 * ```ts
 * import { streamEncode } from '@portable/dns-packet'
 *
 * const frame = streamEncode({ questions: [{ type: 'MX', name: 'example.com' }] })
 * ```
 */
export function streamEncode(packet: Packet, options: encode.Options = {}): Uint8Array {
  const message = encode(packet, options)
  const frame = new Uint8Array(message.length + 2)
  frame[0] = message.length >>> 8
  frame[1] = message.length
  frame.set(message, 2)
  return frame
}

/**
 * Decodes a length-prefixed DNS message, as read from a TCP or TLS connection. Returns `null`
 * when `bytes` doesn't hold the whole message yet. The message takes `2 + length` bytes, where
 * `length` is the big-endian prefix, so the next message starts there.
 *
 * @example
 * ```ts
 * import { streamDecode } from '@portable/dns-packet'
 *
 * const packet = streamDecode(received)
 * if (packet === null) console.log('wait for more bytes')
 * ```
 */
export function streamDecode(bytes: Uint8Array): DecodedPacket | null {
  if (bytes.length < 2) return null
  const length = (bytes[0]! << 8) | bytes[1]!
  if (bytes.length < length + 2) return null
  return decode(bytes.subarray(2, 2 + length))
}
