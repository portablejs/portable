import { type Alphabet, checkAlphabet } from './encode.js'

/**
 * How `decode` treats input that is not canonical base64.
 *
 * - `'loose'`: `Uint8Array.fromBase64` with `lastChunkHandling: 'loose'`. ASCII whitespace is
 *   skipped, padding is optional, and any other character outside the alphabet throws.
 * - `'strict'`: as `'loose'`, but padding is required and the unused bits before it must be zero.
 * - `'mime'`: RFC 2045 §6.8. Every character outside the alphabet is skipped, both alphabets are
 *   accepted, each `=` ends a segment that is decoded on its own, and nothing throws.
 */
export type Mode = 'loose' | 'strict' | 'mime'

export declare namespace decode {
  type Options = {
    /** Alphabet of the input. `'mime'` mode accepts both. @default 'base64' */
    alphabet?: Alphabet | undefined
    /** How to treat non-canonical input. @default 'loose' */
    mode?: Mode | undefined
  }
}

/**
 * Decodes base64 or base64url to bytes. Uses `Uint8Array.fromBase64` where the runtime has it.
 *
 * @example
 * ```ts
 * import { decode } from '@portable/base64'
 *
 * new TextDecoder().decode(decode('aGVs\r\nbG8')) // 'hello'
 * decode('-_8', { alphabet: 'base64url' }) // Uint8Array [0xfb, 0xff]
 * decode('YQ==\r\nYg==', { mode: 'mime' }) // the bytes of 'ab'
 * ```
 *
 * @throws {DecodeError} When the input is invalid in `'loose'` or `'strict'` mode.
 */
export function decode(input: string | Uint8Array, options: decode.Options = {}): Uint8Array {
  const { alphabet = 'base64', mode = 'loose' } = options
  checkAlphabet(alphabet)
  checkMode(mode)
  const text = typeof input === 'string' ? input : utf8.decode(input)
  if (nativeFromBase64 && mode !== 'mime') {
    try {
      return nativeFromBase64.call(Uint8Array, text, { alphabet, lastChunkHandling: mode })
    } catch (error) {
      if (error instanceof SyntaxError) throw new DecodeError(error.message, { cause: error })
      throw error
    }
  }
  return createDecoder(alphabet, mode)(text, true)
}

/** Thrown when `decode` or `Base64DecoderStream` gets invalid input in `'loose'` or `'strict'` mode. */
export class DecodeError extends Error {
  override name = 'Base64.DecodeError'
}

const utf8 = new TextDecoder()

type NativeFromBase64 = (
  text: string,
  options: { alphabet: Alphabet; lastChunkHandling: 'loose' | 'strict' },
) => Uint8Array
const nativeFromBase64: NativeFromBase64 | undefined = Reflect.get(Uint8Array, 'fromBase64')

export function checkMode(mode: unknown): void {
  if (mode !== 'loose' && mode !== 'strict' && mode !== 'mime')
    throw new TypeError(`Unknown mode: ${String(mode)}. Use 'loose', 'strict' or 'mime'.`)
}

function table(characters: string): Int8Array {
  const values = new Int8Array(128).fill(-1)
  for (let i = 0; i < characters.length; i++) values[characters.charCodeAt(i)] = i % 64
  return values
}

const digits = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
const tables: Record<Alphabet | 'both', Int8Array> = {
  base64: table(digits + '+/'),
  base64url: table(digits + '-_'),
  both: table(digits + '+/' + digits + '-_'),
}

const isWhitespace = (code: number) =>
  code === 0x20 || code === 0x09 || code === 0x0a || code === 0x0c || code === 0x0d

/**
 * Returns a function that decodes text written to it piece by piece. Pass `final: true` with the
 * last piece. Decoding a whole input in one call gives the same result as `Uint8Array.fromBase64`.
 */
export function createDecoder(
  alphabet: Alphabet,
  mode: Mode,
): (text: string, final: boolean) => Uint8Array {
  const mime = mode === 'mime'
  const strict = mode === 'strict'
  const values = mime ? tables.both : tables[alphabet]
  let bits = 0
  let count = 0
  // 0: no padding yet, 1: one `=` read after two characters, 2: padding complete.
  let padding = 0
  let offset = 0

  return (text, final) => {
    const length = text.length
    const out = new Uint8Array(Math.ceil((length + count) / 4) * 3)
    let j = 0

    const fail = (message: string): never => {
      throw new DecodeError(message)
    }
    const endGroup = () => {
      if (count === 2) out[j++] = bits >> 4
      else if (count === 3) {
        out[j++] = bits >> 10
        out[j++] = bits >> 2
      }
      bits = 0
      count = 0
    }

    let i = 0
    while (i < length) {
      if (count === 0 && padding === 0) {
        for (; i + 4 <= length; i += 4) {
          const c0 = text.charCodeAt(i)
          const c1 = text.charCodeAt(i + 1)
          const c2 = text.charCodeAt(i + 2)
          const c3 = text.charCodeAt(i + 3)
          if ((c0 | c1 | c2 | c3) > 127) break
          const v0 = values[c0]!
          const v1 = values[c1]!
          const v2 = values[c2]!
          const v3 = values[c3]!
          if ((v0 | v1 | v2 | v3) < 0) break
          const v = (v0 << 18) | (v1 << 12) | (v2 << 6) | v3
          out[j] = v >> 16
          out[j + 1] = v >> 8
          out[j + 2] = v
          j += 3
        }
        if (i >= length) break
      }

      const code = text.charCodeAt(i++)
      const value = code < 128 ? values[code]! : -1
      if (value >= 0) {
        if (padding !== 0) fail(`Unexpected character after padding at index ${offset + i - 1}.`)
        bits = (bits << 6) | value
        if (++count === 4) {
          out[j] = bits >> 16
          out[j + 1] = bits >> 8
          out[j + 2] = bits
          j += 3
          bits = 0
          count = 0
        }
      } else if (code === 0x3d) {
        if (mime) endGroup()
        else if (padding === 1) padding = 2
        else if (padding === 2 || count < 2) fail(`Unexpected padding at index ${offset + i - 1}.`)
        else {
          if (strict && (count === 2 ? bits & 0xf : bits & 0x3) !== 0)
            fail(`Non-zero bits before padding at index ${offset + i - 1}.`)
          padding = count === 2 ? 1 : 2
          endGroup()
        }
      } else if (!mime && !isWhitespace(code)) {
        fail(`Invalid character at index ${offset + i - 1}.`)
      }
    }

    if (final) {
      if (padding === 1) fail('Incomplete padding at the end of the input.')
      if (count > 0) {
        if (strict) fail('Missing padding at the end of the input.')
        if (count === 1 && !mime)
          fail('A single character at the end of the input encodes no byte.')
        endGroup()
      }
    }
    offset += length
    return j === out.length ? out : out.slice(0, j)
  }
}
