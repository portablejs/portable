import { isUint8Array } from '@portable/bytes/internal'
const encoder = new TextEncoder()

export function toUint8Array(chunk: unknown): Uint8Array {
  if (isUint8Array(chunk)) {
    return chunk
  }
  if (typeof chunk === 'string') {
    return encoder.encode(chunk)
  }
  throw unsupportedChunk(chunk)
}

export function byteLength(chunk: unknown): number {
  if (isUint8Array(chunk)) {
    return chunk.byteLength
  }
  if (typeof chunk === 'string') {
    return utf8Length(chunk)
  }
  throw unsupportedChunk(chunk)
}

function unsupportedChunk(chunk: unknown): TypeError {
  const type =
    typeof chunk === 'object' ? Object.prototype.toString.call(chunk).slice(8, -1) : typeof chunk
  return new TypeError(`Expected a Uint8Array or string chunk, got ${type}.`)
}

function utf8Length(text: string): number {
  let length = text.length
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i)
    if (code < 0x80) {
      continue
    }
    if (code < 0x800) {
      length += 1
    } else if (code >= 0xd800 && code < 0xdc00 && isLowSurrogate(text.charCodeAt(i + 1))) {
      length += 2
      i++
    } else {
      length += 2
    }
  }
  return length
}

const isLowSurrogate = (code: number) => code >= 0xdc00 && code < 0xe000
