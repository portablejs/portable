import { InvalidInputError } from './errors.js'

/**
 * Encodes bytes as lowercase hex. Uses `Uint8Array.prototype.toHex` where the runtime has it.
 *
 * @example
 * ```ts
 * import * as Bytes from '@portable/bytes'
 *
 * Bytes.toHex(new Uint8Array([0, 15, 16, 255])) // '000f10ff'
 * ```
 */
export function toHex(bytes: Uint8Array): string {
  return nativeToHex ? nativeToHex.call(bytes) : toHexFallback(bytes)
}

/**
 * Decodes hex to bytes. Uses `Uint8Array.fromHex` where the runtime has it. Upper and lower case
 * digits are both accepted. Anything else, including whitespace and a `0x` prefix, throws.
 *
 * @example
 * ```ts
 * import * as Bytes from '@portable/bytes'
 *
 * Bytes.fromHex('000f10FF') // Uint8Array [0, 15, 16, 255]
 * ```
 *
 * @throws {InvalidInputError} When the input has an odd length or a character that isn't a hex
 * digit.
 */
export function fromHex(text: string | Uint8Array): Uint8Array<ArrayBuffer> {
  const hex = typeof text === 'string' ? text : latin1(text)
  if (nativeFromHex) {
    try {
      return nativeFromHex.call(Uint8Array, hex)
    } catch (error) {
      if (!(error instanceof SyntaxError)) throw error
      // The native SyntaxError doesn't say where the problem is. The fallback throws on exactly the
      // same input, with the position.
      fromHexFallback(hex)
      throw new InvalidInputError(error.message, { cause: error })
    }
  }
  return fromHexFallback(hex)
}

type NativeToHex = (this: Uint8Array) => string
const nativeToHex: NativeToHex | undefined = Reflect.get(Uint8Array.prototype, 'toHex')

type NativeFromHex = (text: string) => Uint8Array<ArrayBuffer>
const nativeFromHex: NativeFromHex | undefined = Reflect.get(Uint8Array, 'fromHex')

const digits = '0123456789abcdef'
const pairs = Array.from({ length: 256 }, (_, byte) => digits[byte >> 4]! + digits[byte & 15]!)
const high = Uint8Array.from(pairs, (pair) => pair.charCodeAt(0))
const low = Uint8Array.from(pairs, (pair) => pair.charCodeAt(1))
const ascii = new TextDecoder()

export function toHexFallback(bytes: Uint8Array): string {
  // Appending to a string is faster for short input, and writing ASCII bytes and decoding them
  // once is faster for long input.
  if (bytes.length <= 128) {
    let hex = ''
    for (let i = 0; i < bytes.length; i++) hex += pairs[bytes[i]!]
    return hex
  }
  const out = new Uint8Array(bytes.length * 2)
  for (let i = 0, j = 0; i < bytes.length; i++, j += 2) {
    const byte = bytes[i]!
    out[j] = high[byte]!
    out[j + 1] = low[byte]!
  }
  return ascii.decode(out)
}

const values = /* @__PURE__ */ (() => {
  const table = new Int8Array(128).fill(-1)
  for (let i = 0; i < 16; i++) {
    table[digits.charCodeAt(i)] = i
    table[digits.toUpperCase().charCodeAt(i)] = i
  }
  return table
})()

export function fromHexFallback(hex: string): Uint8Array<ArrayBuffer> {
  if (hex.length % 2 !== 0)
    throw new InvalidInputError(`Hex input has an odd length of ${hex.length}.`)
  const bytes = new Uint8Array(hex.length / 2)
  for (let i = 0, j = 0; i < bytes.length; i++, j += 2) {
    const a = hex.charCodeAt(j)
    const b = hex.charCodeAt(j + 1)
    const h = a < 128 ? values[a]! : -1
    const l = b < 128 ? values[b]! : -1
    if ((h | l) < 0) {
      const at = h < 0 ? j : j + 1
      throw new InvalidInputError(`Invalid hex character ${JSON.stringify(hex[at])} at ${at}.`)
    }
    bytes[i] = (h << 4) | l
  }
  return bytes
}

function latin1(bytes: Uint8Array): string {
  let text = ''
  for (let i = 0; i < bytes.length; i += 0x8000)
    text += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return text
}
