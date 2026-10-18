const utf8Decoder = new TextDecoder()

export function toText(input: string | Uint8Array): string {
  if (typeof input === 'string') return input
  if (input instanceof Uint8Array) return utf8Decoder.decode(input)
  throw new TypeError('Expected a string or a Uint8Array.')
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
