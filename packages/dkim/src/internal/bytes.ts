/** Each byte as one character (U+0000 to U+00FF), so header bytes survive string handling. */
export function toBinary(bytes: Uint8Array): string {
  const parts: string[] = []
  for (let i = 0; i < bytes.length; i += 8192)
    parts.push(String.fromCharCode.apply(null, bytes.subarray(i, i + 8192) as unknown as number[]))
  return parts.join('')
}

export function fromBinary(text: string): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(text.length)
  for (let i = 0; i < text.length; i++) bytes[i] = text.charCodeAt(i)
  return bytes
}

const utf8 = new TextDecoder()

export const binaryToText = (text: string): string => utf8.decode(fromBinary(text))
