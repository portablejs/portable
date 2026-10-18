import { InvalidInputError } from './errors.js'

/** Thrown by a parser that read past the end of its input. `end` is how many bytes it needs. */
export class NeedMore extends Error {
  constructor(readonly end: number) {
    super()
  }
}

export function need(input: Uint8Array, end: number): void {
  if (end > input.length) throw new NeedMore(end)
}

export function u8(input: Uint8Array, offset: number): number {
  need(input, offset + 1)
  return input[offset]!
}

export function u16(input: Uint8Array, offset: number, bigEndian: boolean): number {
  need(input, offset + 2)
  const a = input[offset]!
  const b = input[offset + 1]!
  return bigEndian ? (a << 8) | b : (b << 8) | a
}

export function u24le(input: Uint8Array, offset: number): number {
  need(input, offset + 3)
  return input[offset]! | (input[offset + 1]! << 8) | (input[offset + 2]! << 16)
}

export function u32(input: Uint8Array, offset: number, bigEndian: boolean): number {
  need(input, offset + 4)
  const a = input[offset]!
  const b = input[offset + 1]!
  const c = input[offset + 2]!
  const d = input[offset + 3]!
  return (
    (bigEndian ? (a << 24) | (b << 16) | (c << 8) | d : (d << 24) | (c << 16) | (b << 8) | a) >>> 0
  )
}

export function u64(input: Uint8Array, offset: number, bigEndian: boolean): number {
  const high = u32(input, bigEndian ? offset : offset + 4, bigEndian)
  const low = u32(input, bigEndian ? offset + 4 : offset, bigEndian)
  const value = high * 2 ** 32 + low
  if (!Number.isSafeInteger(value)) throw new InvalidInputError('Value too large')
  return value
}

/**
 * Whether the bytes at `offset` spell `text`. Returns `false` as soon as one byte differs, and
 * asks for more input only when every byte present matches.
 */
export function startsWith(input: Uint8Array, offset: number, text: string): boolean {
  const available = Math.min(text.length, input.length - offset)
  for (let i = 0; i < available; i++) {
    if (input[offset + i] !== text.charCodeAt(i)) return false
  }
  need(input, offset + text.length)
  return true
}

export function ascii(input: Uint8Array, start: number, end: number): string {
  need(input, end)
  return String.fromCharCode(...input.subarray(start, end))
}

const decoder = new TextDecoder()

export function utf8(input: Uint8Array, start: number, end: number): string {
  return decoder.decode(input.subarray(start, end))
}

export type Box = { name: string; offset: number; size: number }

export function findBox(
  input: Uint8Array,
  name: string,
  start: number,
  end: number,
): Box | undefined {
  let offset = start
  while (offset < end) {
    need(input, offset + 8)
    const size = u32(input, offset, true)
    if (size < 8) {
      offset += 8
      continue
    }
    need(input, offset + size)
    if (startsWith(input, offset + 4, name)) return { name, offset, size }
    offset += size
  }
  return undefined
}
