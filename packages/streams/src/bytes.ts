import { isInput, toUint8Array as viewBytes } from '@portable/bytes/internal'

const encoder = new TextEncoder()

export function toUint8Array(chunk: unknown): Uint8Array {
  if (typeof chunk === 'string') return encoder.encode(chunk)
  if (isInput(chunk)) return viewBytes(chunk)
  throw unsupportedChunk(chunk)
}

export function byteLength(chunk: unknown): number {
  if (typeof chunk === 'string') return utf8Length(chunk)
  if (isInput(chunk)) return chunk.byteLength
  throw unsupportedChunk(chunk)
}

function unsupportedChunk(chunk: unknown): TypeError {
  const type =
    typeof chunk === 'object' ? Object.prototype.toString.call(chunk).slice(8, -1) : typeof chunk
  return new TypeError(`Expected a byte or string chunk, got ${type}.`)
}

function utf8Length(text: string): number {
  let length = text.length
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i)
    if (code < 0x80) continue
    if (code < 0x800) length += 1
    else if (code >= 0xd800 && code < 0xdc00 && isLowSurrogate(text.charCodeAt(i + 1))) {
      length += 2
      i++
    } else length += 2
  }
  return length
}

const isLowSurrogate = (code: number) => code >= 0xdc00 && code < 0xe000
