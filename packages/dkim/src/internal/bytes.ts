export const CR = 0x0d
export const LF = 0x0a
export const SP = 0x20
export const TAB = 0x09

/** Each byte as one character (U+0000 to U+00FF), so header bytes survive string handling. */
export function toBinary(bytes: Uint8Array): string {
  let text = ''
  for (let i = 0; i < bytes.length; i += 8192)
    text += String.fromCharCode(...bytes.subarray(i, i + 8192))
  return text
}

export function fromBinary(text: string): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(text.length)
  for (let i = 0; i < text.length; i++) bytes[i] = text.charCodeAt(i)
  return bytes
}

const utf8 = new TextDecoder()

export const binaryToText = (text: string): string => utf8.decode(fromBinary(text))

export function concat(chunks: readonly Uint8Array[]): Uint8Array<ArrayBuffer> {
  let length = 0
  for (const chunk of chunks) length += chunk.length
  const out = new Uint8Array(length)
  let offset = 0
  for (const chunk of chunks) {
    out.set(chunk, offset)
    offset += chunk.length
  }
  return out
}

export function equal(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false
  return true
}
