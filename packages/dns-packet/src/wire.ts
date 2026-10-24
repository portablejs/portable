import { InvalidInputError, TruncatedError } from './errors.js'

export type Reader = { readonly bytes: Uint8Array; offset: number }

export type Writer = {
  readonly bytes: Uint8Array<ArrayBuffer>
  offset: number
  /** Where the DNS message starts in `bytes`. Compression pointers count from here. */
  readonly start: number
  readonly names: Map<string, number> | undefined
}

const encoder = new TextEncoder()
const decoder = new TextDecoder()

export function need(r: Reader, n: number, end: number): void {
  if (r.offset + n > end) throw new TruncatedError(`Unexpected end of data at offset ${r.offset}.`)
}

/**
 * Runs `read` on a length-delimited field such as RDATA, where running past the end means the
 * field is malformed, not that the message was cut short.
 */
export function within<value>(field: string, read: () => value): value {
  try {
    return read()
  } catch (error) {
    if (error instanceof TruncatedError)
      throw new InvalidInputError(`${field} data is too short.`, { cause: error })
    throw error
  }
}

export function u8(r: Reader, end: number): number {
  need(r, 1, end)
  return r.bytes[r.offset++]!
}

export function u16(r: Reader, end: number): number {
  need(r, 2, end)
  const b = r.bytes
  const value = (b[r.offset]! << 8) | b[r.offset + 1]!
  r.offset += 2
  return value
}

export function u32(r: Reader, end: number): number {
  need(r, 4, end)
  const b = r.bytes
  const o = r.offset
  r.offset += 4
  return b[o]! * 0x1000000 + ((b[o + 1]! << 16) | (b[o + 2]! << 8) | b[o + 3]!)
}

export function bytes(r: Reader, n: number, end: number): Uint8Array {
  need(r, n, end)
  const value = new Uint8Array(r.bytes.subarray(r.offset, r.offset + n))
  r.offset += n
  return value
}

export const rest = (r: Reader, end: number): Uint8Array => bytes(r, end - r.offset, end)

export function putU8(w: Writer, value: number): void {
  w.bytes[w.offset++] = value
}

export function putU16(w: Writer, value: number): void {
  const b = w.bytes
  b[w.offset++] = value >>> 8
  b[w.offset++] = value
}

export function putU32(w: Writer, value: number): void {
  const b = w.bytes
  b[w.offset++] = value >>> 24
  b[w.offset++] = value >>> 16
  b[w.offset++] = value >>> 8
  b[w.offset++] = value
}

export function putBytes(w: Writer, value: Uint8Array): void {
  w.bytes.set(value, w.offset)
  w.offset += value.length
}

export function utf8Length(text: string): number {
  let length = 0
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i)
    if (c < 0x80) length++
    else if (c < 0x800) length += 2
    else if (c >= 0xd800 && c <= 0xdbff && (text.charCodeAt(i + 1) & 0xfc00) === 0xdc00) {
      length += 4
      i++
    } else length += 3
  }
  return length
}

/** Writes `text` as UTF-8 and returns the number of bytes written. */
export function putText(w: Writer, text: string): number {
  const b = w.bytes
  const start = w.offset
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i)
    if (c >= 0x80) {
      w.offset = start + encoder.encodeInto(text, b.subarray(start)).written
      return w.offset - start
    }
    b[w.offset++] = c
  }
  return w.offset - start
}

export function readText(b: Uint8Array, start: number, end: number): string {
  let text = ''
  for (let i = start; i < end; i++) {
    const c = b[i]!
    if (c >= 0x80) return decoder.decode(b.subarray(start, end))
    text += String.fromCharCode(c)
  }
  return text
}

export function bytesOf(value: unknown, field: string): Uint8Array {
  if (value instanceof Uint8Array) return value
  throw new InvalidInputError(`${field} must be a Uint8Array.`)
}

/** Length of a <character-string>: one length byte, then up to 255 bytes. */
export function stringLength(value: string | Uint8Array, field: string): number {
  if (typeof value !== 'string' && !(value instanceof Uint8Array))
    throw new InvalidInputError(`${field} must be a string or a Uint8Array.`)
  const length = typeof value === 'string' ? utf8Length(value) : value.length
  if (length > 255) throw new InvalidInputError(`${field} is longer than 255 bytes.`)
  return length + 1
}

export function putString(w: Writer, value: string | Uint8Array): void {
  if (typeof value === 'string') {
    const start = w.offset++
    w.bytes[start] = putText(w, value)
  } else {
    putU8(w, value.length)
    putBytes(w, value)
  }
}

export function readString(r: Reader, end: number): string {
  const length = u8(r, end)
  need(r, length, end)
  const text = readText(r.bytes, r.offset, r.offset + length)
  r.offset += length
  return text
}

const DOT = 46
const BACKSLASH = 92

function nameBounds(name: string): [start: number, end: number] {
  const start = name.charCodeAt(0) === DOT ? 1 : 0
  let end = name.length
  if (end > start && name.charCodeAt(end - 1) === DOT && name.charCodeAt(end - 2) !== BACKSLASH)
    end--
  return [start, end]
}

type Label = { start: number; bytes: Uint8Array }

/** Splits a name written with RFC 1035 escapes (`\.`, `\\`, `\DDD`) into labels. */
function escapedLabels(name: string, from: number, end: number): Label[] {
  const labels = new Array<Label>()
  let start = from
  let label: number[] = []
  let text = ''
  const flushText = () => {
    if (text) label.push(...encoder.encode(text))
    text = ''
  }
  for (let i = from; i < end; i++) {
    const c = name[i]!
    if (c === '\\') {
      const digits = name.slice(i + 1, i + 4)
      if (/^\d{3}$/.test(digits) && Number(digits) < 256) {
        flushText()
        label.push(Number(digits))
        i += 3
      } else if (i + 1 < end) text += name[++i]
      else throw new InvalidInputError(`Name "${name}" ends with a backslash.`)
    } else if (c === '.') {
      flushText()
      labels.push({ start, bytes: Uint8Array.from(label) })
      label = []
      start = i + 1
    } else text += c
  }
  if (end > from) {
    flushText()
    labels.push({ start, bytes: Uint8Array.from(label) })
  }
  return labels
}

function checkLabel(name: string, size: number): void {
  if (size === 0) throw new InvalidInputError(`Empty label in "${name}".`)
  if (size > 63) throw new InvalidInputError(`Label longer than 63 bytes in "${name}".`)
}

/** Returns the uncompressed wire length of `name` and checks its labels. */
export function nameLength(name: string): number {
  if (typeof name !== 'string') throw new InvalidInputError('A domain name must be a string.')
  const [start, end] = nameBounds(name)
  let length = 1
  if (name.includes('\\')) {
    for (const label of escapedLabels(name, start, end)) {
      checkLabel(name, label.bytes.length)
      length += label.bytes.length + 1
    }
  } else {
    let size = 0
    for (let i = start; i < end; i++) {
      const c = name.charCodeAt(i)
      if (c === DOT) {
        checkLabel(name, size)
        length += size + 1
        size = 0
      } else if (c < 0x80) size++
      else if (c < 0x800) size += 2
      else if (c >= 0xd800 && c <= 0xdbff && (name.charCodeAt(i + 1) & 0xfc00) === 0xdc00) {
        size += 4
        i++
      } else size += 3
    }
    if (end > start) {
      checkLabel(name, size)
      length += size + 1
    }
  }
  if (length > 255) throw new InvalidInputError(`"${name}" is longer than 255 bytes.`)
  return length
}

/** Writes a pointer if `suffix` was written before, otherwise records where it starts. */
function pointTo(w: Writer, names: Map<string, number>, suffix: string): boolean {
  const pointer = names.get(suffix)
  if (pointer !== undefined) {
    putU16(w, 0xc000 | pointer)
    return true
  }
  const offset = w.offset - w.start
  if (offset < 0x4000) names.set(suffix, offset)
  return false
}

/**
 * Writes a domain name. With `compress`, a suffix written earlier in the message is replaced by a
 * pointer to it. `nameLength` must have checked the name first.
 */
export function putName(w: Writer, name: string, compress: boolean): void {
  const names = compress ? w.names : undefined
  const [start, end] = nameBounds(name)
  if (name.includes('\\')) {
    for (const label of escapedLabels(name, start, end)) {
      if (names && pointTo(w, names, name.slice(label.start, end))) return
      putU8(w, label.bytes.length)
      putBytes(w, label.bytes)
    }
    putU8(w, 0)
    return
  }
  const b = w.bytes
  for (let label = start; label < end;) {
    if (names && pointTo(w, names, name.slice(label, end))) return
    let dot = name.indexOf('.', label)
    if (dot === -1 || dot > end) dot = end
    let o = w.offset
    const lengthAt = o++
    for (let i = label; i < dot; i++) {
      const c = name.charCodeAt(i)
      if (c >= 0x80) {
        const result = encoder.encodeInto(name.slice(label, dot), b.subarray(lengthAt + 1))
        o = lengthAt + 1 + result.written
        break
      }
      b[o++] = c
    }
    b[lengthAt] = o - lengthAt - 1
    w.offset = o
    label = dot + 1
  }
  b[w.offset++] = 0
}

/** Reads a label as text, escaping `.` and `\` as RFC 1035 presentation format does. */
function readLabel(b: Uint8Array, start: number, end: number): string {
  let text = ''
  for (let i = start; i < end; i++) {
    const c = b[i]!
    if (c >= 0x80) return decoder.decode(b.subarray(start, end)).replace(/[.\\]/g, '\\$&')
    if (c === DOT || c === BACKSLASH) text += '\\'
    text += String.fromCharCode(c)
  }
  return text
}

/**
 * Reads a domain name, following compression pointers. Each pointer must point before the start
 * of the labels that led to it, so a chain of pointers always ends.
 */
export function readName(r: Reader, end: number): string {
  const b = r.bytes
  let offset = r.offset
  let segmentStart = offset
  let limit = end
  let resume = -1
  let length = 0
  let name = ''
  for (;;) {
    if (offset >= limit) throw new TruncatedError('Name runs past the end of the data.')
    const len = b[offset++]!
    if (len === 0) break
    if (len < 0x40) {
      if (offset + len > limit) throw new TruncatedError('Name runs past the end of the data.')
      length += len + 1
      if (length > 254) throw new InvalidInputError('Name is longer than 255 bytes.')
      const label = readLabel(b, offset, offset + len)
      name = name === '' ? label : `${name}.${label}`
      offset += len
    } else if (len >= 0xc0) {
      if (offset >= limit) throw new TruncatedError('Name runs past the end of the data.')
      const pointer = ((len & 0x3f) << 8) | b[offset++]!
      if (pointer >= segmentStart)
        throw new InvalidInputError(`Compression pointer to ${pointer} does not point backwards.`)
      if (resume === -1) resume = offset
      offset = pointer
      segmentStart = pointer
      limit = b.length
    } else {
      throw new InvalidInputError(`Unknown label type 0x${len.toString(16)}.`)
    }
  }
  r.offset = resume === -1 ? offset : resume
  return name === '' ? '.' : name
}

export function putIPv4(w: Writer, ip: string): void {
  const parts = typeof ip === 'string' ? ip.split('.') : []
  if (parts.length !== 4) throw new InvalidInputError(`Invalid IPv4 address "${ip}".`)
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part) || Number(part) > 255)
      throw new InvalidInputError(`Invalid IPv4 address "${ip}".`)
    putU8(w, Number(part))
  }
}

export function readIPv4(b: Uint8Array, o: number): string {
  return `${b[o]}.${b[o + 1]}.${b[o + 2]}.${b[o + 3]}`
}

function parseIPv6(ip: string): number[] | undefined {
  if (typeof ip !== 'string') return undefined
  const halves = ip.split('::')
  if (halves.length > 2) return undefined
  const groups = (half: string): number[] | undefined => {
    if (half === '') return []
    const words = new Array<number>()
    const parts = half.split(':')
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i]!
      if (i === parts.length - 1 && part.includes('.')) {
        const v4 = new Uint8Array(4)
        try {
          putIPv4({ bytes: v4, offset: 0, start: 0, names: undefined }, part)
        } catch {
          return undefined
        }
        words.push((v4[0]! << 8) | v4[1]!, (v4[2]! << 8) | v4[3]!)
      } else if (/^[0-9a-f]{1,4}$/i.test(part)) words.push(Number.parseInt(part, 16))
      else return undefined
    }
    return words
  }
  const head = groups(halves[0]!)
  const tail = halves.length === 2 ? groups(halves[1]!) : []
  if (!head || !tail) return undefined
  const missing = 8 - head.length - tail.length
  if (halves.length === 2 ? missing < 1 : missing !== 0) return undefined
  return [...head, ...Array<number>(missing).fill(0), ...tail]
}

export function putIPv6(w: Writer, ip: string): void {
  const words = parseIPv6(ip)
  if (!words) throw new InvalidInputError(`Invalid IPv6 address "${ip}".`)
  for (const word of words) putU16(w, word)
}

/**
 * Formats an IPv6 address as RFC 5952 recommends: lowercase, with the longest run of two or more
 * zero groups replaced by `::`.
 */
export function readIPv6(b: Uint8Array, o: number): string {
  const words = new Array<number>()
  for (let i = 0; i < 16; i += 2) words.push((b[o + i]! << 8) | b[o + i + 1]!)
  let bestStart = -1
  let bestLength = 1
  for (let i = 0; i < 8;) {
    if (words[i] !== 0) {
      i++
      continue
    }
    let j = i
    while (j < 8 && words[j] === 0) j++
    if (j - i > bestLength) {
      bestStart = i
      bestLength = j - i
    }
    i = j
  }
  const hex = (from: number, to: number) =>
    words
      .slice(from, to)
      .map((word) => word.toString(16))
      .join(':')
  if (bestStart === -1) return hex(0, 8)
  return `${hex(0, bestStart)}::${hex(bestStart + bestLength, 8)}`
}
