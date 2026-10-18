const utf8Decoder = new TextDecoder()
const utf8Encoder = new TextEncoder()

export function toText(input: string | Uint8Array): string {
  if (typeof input === 'string') return input
  if (input instanceof Uint8Array) return utf8Decoder.decode(input)
  throw new TypeError('Expected a string or a Uint8Array.')
}

let scratch = new Uint8Array(1024)

export function encodeUtf8Scratch(text: string): Uint8Array {
  if (text.length > 16384) return utf8Encoder.encode(text)
  if (text.length * 3 > scratch.length) scratch = new Uint8Array(text.length * 3)
  return scratch.subarray(0, utf8Encoder.encodeInto(text, scratch).written)
}

const decoders = new Map<string, TextDecoder>()

export function decodeCharset(bytes: Uint8Array, label: string): string {
  const key = label.trim().toLowerCase()
  let decoder = decoders.get(key)
  if (!decoder) {
    try {
      decoder = new TextDecoder(key)
    } catch {
      return utf8Decoder.decode(bytes)
    }
    decoders.set(key, decoder)
  }
  return decoder.decode(bytes)
}

export function checkLength(name: string, value: number): void {
  if (!Number.isInteger(value) || value < 1)
    throw new RangeError(`${name} must be a positive integer, got ${value}.`)
}

export const hexDigit = (code: number): number =>
  code >= 0x30 && code <= 0x39
    ? code - 0x30
    : code >= 0x41 && code <= 0x46
      ? code - 0x37
      : code >= 0x61 && code <= 0x66
        ? code - 0x57
        : -1
