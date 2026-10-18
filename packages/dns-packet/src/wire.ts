import {
  InvalidNameError,
  InvalidPointerError,
  InvalidRecordError,
  TruncatedError,
} from './errors.js'

export type Reader = { readonly bytes: Uint8Array; offset: number }

export type Writer = {
  readonly bytes: Uint8Array
  offset: number
  readonly names: Map<string, number> | undefined
}

const encoder = new TextEncoder()
const decoder = new TextDecoder()

export function need(r: Reader, n: number, end: number): void {
  if (r.offset + n > end) throw new TruncatedError(`Unexpected end of data at offset ${r.offset}.`)
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
  return (b[o]! * 0x1000000 + ((b[o + 1]! << 16) | (b[o + 2]! << 8) | b[o + 3]!)) >>> 0
}

export function bytes(r: Reader, n: number, end: number): Uint8Array {
  need(r, n, end)
  const value = new Uint8Array(r.bytes.subarray(r.offset, r.offset + n))
  r.offset += n
  return value
}

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
  let length = text.length
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i)
    if (c < 0x80) continue
    if (c < 0x800) length += 1
    else if (c >= 0xd800 && c <= 0xdbff && i + 1 < text.length) {
      const next = text.charCodeAt(i + 1)
      if (next >= 0xdc00 && next <= 0xdfff) {
        length += 2
        i++
      } else length += 2
    } else length += 2
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
  throw new InvalidRecordError(`${field} must be a Uint8Array.`)
}

export function stringLength(text: string): number {
  const length = utf8Length(text)
  if (length > 255) throw new InvalidRecordError('A character-string is limited to 255 bytes.')
  return length + 1
}

export function putString(w: Writer, text: string): void {
  const start = w.offset++
  w.bytes[start] = putText(w, text)
}

export function readString(r: Reader, end: number): string {
  const length = u8(r, end)
  need(r, length, end)
  const text = readText(r.bytes, r.offset, r.offset + length)
  r.offset += length
  return text
}

function labelsOf(name: string, mail: boolean): string[] {
  let trimmed = name
  if (trimmed.startsWith('.')) trimmed = trimmed.slice(1)
  if (trimmed.endsWith('.') && !trimmed.endsWith('\\.')) trimmed = trimmed.slice(0, -1)
  if (trimmed === '') return []
  if (!mail || !trimmed.includes('\\.')) return trimmed.split('.')
  return trimmed.split(/(?<!\\)\./).map((label) => label.replaceAll('\\.', '.'))
}

export function nameLength(name: string, mail = false): number {
  const labels = labelsOf(name, mail)
  let length = 1
  for (const label of labels) {
    const size = utf8Length(label)
    if (size === 0) throw new InvalidNameError(`Empty label in "${name}".`)
    if (size > 63) throw new InvalidNameError(`Label longer than 63 bytes in "${name}".`)
    length += size + 1
  }
  if (length > 255) throw new InvalidNameError(`"${name}" is longer than 255 bytes.`)
  return length
}

const escapeDots = (label: string) => (label.includes('.') ? label.replaceAll('.', '\\.') : label)

/**
 * Writes a domain name. With `compress`, a suffix written earlier in the packet is replaced by a
 * pointer to it, and the suffixes written here become pointer targets.
 */
export function putName(w: Writer, name: string, compress: boolean, mail = false): void {
  const labels = labelsOf(name, mail)
  const names = compress ? w.names : undefined
  for (let i = 0; i < labels.length; i++) {
    if (names) {
      let key = escapeDots(labels[i]!)
      for (let j = i + 1; j < labels.length; j++) key += `.${escapeDots(labels[j]!)}`
      const pointer = names.get(key)
      if (pointer !== undefined) {
        putU16(w, 0xc000 | pointer)
        return
      }
      if (w.offset < 0x4000) names.set(key, w.offset)
    }
    const start = w.offset++
    w.bytes[start] = putText(w, labels[i]!)
  }
  putU8(w, 0)
}

export function readName(r: Reader, end: number, mail = false): string {
  const b = r.bytes
  let offset = r.offset
  let segmentStart = offset
  let limit = end
  let consumed = -1
  let length = 0
  let name = ''
  for (;;) {
    if (offset >= limit) throw new TruncatedError('Cannot decode name (buffer overflow).')
    const len = b[offset++]!
    if (len === 0) break
    if ((len & 0xc0) === 0) {
      if (offset + len > limit) throw new TruncatedError('Cannot decode name (buffer overflow).')
      length += len + 1
      if (length > 254) throw new InvalidNameError('Cannot decode name (name too long).')
      let label = readText(b, offset, offset + len)
      if (mail && label.includes('.')) label = label.replaceAll('.', '\\.')
      name = name === '' ? label : `${name}.${label}`
      offset += len
    } else if ((len & 0xc0) === 0xc0) {
      if (offset >= limit) throw new TruncatedError('Cannot decode name (buffer overflow).')
      const pointer = ((len & 0x3f) << 8) | b[offset++]!
      if (pointer >= segmentStart)
        throw new InvalidPointerError('Cannot decode name (bad pointer).')
      if (consumed === -1) consumed = offset
      offset = pointer
      segmentStart = pointer
      limit = b.length
    } else {
      throw new InvalidNameError('Cannot decode name (bad label).')
    }
  }
  r.offset = consumed === -1 ? offset : consumed
  return name === '' ? '.' : name
}

export function putIPv4(w: Writer, ip: string): void {
  const parts = ip.split('.')
  if (parts.length !== 4) throw new InvalidRecordError(`Invalid IPv4 address "${ip}".`)
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part) || Number(part) > 255)
      throw new InvalidRecordError(`Invalid IPv4 address "${ip}".`)
    putU8(w, Number(part))
  }
}

export function readIPv4(b: Uint8Array, o: number): string {
  return `${b[o]}.${b[o + 1]}.${b[o + 2]}.${b[o + 3]}`
}

function parseIPv6(ip: string): number[] | undefined {
  const halves = ip.split('::')
  if (halves.length > 2) return undefined
  const groups = (half: string): number[] | undefined => {
    if (half === '') return []
    const words: number[] = []
    const parts = half.split(':')
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i]!
      if (i === parts.length - 1 && part.includes('.')) {
        const v4 = new Uint8Array(4)
        try {
          putIPv4({ bytes: v4, offset: 0, names: undefined }, part)
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
  if (!words) throw new InvalidRecordError(`Invalid IPv6 address "${ip}".`)
  for (const word of words) putU16(w, word)
}

/** Formats an IPv6 address as RFC 5952 recommends: lowercase, with the longest run of two or more zero groups replaced by `::`. */
export function readIPv6(b: Uint8Array, o: number): string {
  const words: number[] = []
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

export function familyOf(ip: string): 1 | 2 {
  return ip.includes(':') ? 2 : 1
}
