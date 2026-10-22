import type { Alphabet } from './encode.js'
import { InvalidInputError, TruncatedError } from './errors.js'

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
 * import * as Base64 from '@portable/base64'
 *
 * new TextDecoder().decode(Base64.decode('aGVs\r\nbG8')) // 'hello'
 * Base64.decode('-_8', { alphabet: 'base64url' }) // Uint8Array [0xfb, 0xff]
 * Base64.decode('YQ==\r\nYg==', { mode: 'mime' }) // the bytes of 'ab'
 * ```
 *
 * @throws {InvalidInputError} When `'loose'` or `'strict'` mode finds a character or padding
 * that is not allowed.
 * @throws {TruncatedError} When `'loose'` or `'strict'` mode finds the input ending inside a group.
 */
export function decode(
  input: string | Uint8Array,
  options: decode.Options = {},
): Uint8Array<ArrayBuffer> {
  const { alphabet = 'base64', mode = 'loose' } = options
  const state = createState(alphabet, mode)
  const text = typeof input === 'string' ? input : utf8.decode(input)
  if (nativeFromBase64 && mode !== 'mime') {
    try {
      return nativeFromBase64.call(Uint8Array, text, { alphabet, lastChunkHandling: mode })
    } catch (error) {
      if (!(error instanceof SyntaxError)) throw error
      // The native SyntaxError doesn't say which kind of problem it found, and the fallback throws
      // on exactly the same input with the right error class.
      decodeChunk(state, text, true)
      throw new InvalidInputError(error.message, { cause: error })
    }
  }
  return decodeChunk(state, text, true)
}

const utf8 = new TextDecoder()

type NativeFromBase64 = (
  text: string,
  options: { alphabet: Alphabet; lastChunkHandling: 'loose' | 'strict' },
) => Uint8Array<ArrayBuffer>
const nativeFromBase64: NativeFromBase64 | undefined = Reflect.get(Uint8Array, 'fromBase64')

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

type State = {
  values: Int8Array
  mime: boolean
  strict: boolean
  bits: number
  count: number
  padding: 'none' | 'needsSecond' | 'done'
  offset: number
}

function createState(alphabet: Alphabet, mode: Mode): State {
  if (alphabet !== 'base64' && alphabet !== 'base64url')
    throw new RangeError(`Unknown alphabet: ${String(alphabet)}. Use 'base64' or 'base64url'.`)
  if (mode !== 'loose' && mode !== 'strict' && mode !== 'mime')
    throw new RangeError(`Unknown mode: ${String(mode)}. Use 'loose', 'strict' or 'mime'.`)
  return {
    values: mode === 'mime' ? tables.both : tables[alphabet],
    mime: mode === 'mime',
    strict: mode === 'strict',
    bits: 0,
    count: 0,
    padding: 'none',
    offset: 0,
  }
}

/**
 * Returns a function that decodes text written to it piece by piece. Pass `final: true` with the
 * last piece. Decoding a whole input in one call gives the same result as `Uint8Array.fromBase64`.
 */
export function createDecoder(
  alphabet: Alphabet,
  mode: Mode,
): (text: string, final: boolean) => Uint8Array {
  const state = createState(alphabet, mode)
  return (text, final) => decodeChunk(state, text, final)
}

function invalid(state: State, index: number, problem: string): never {
  throw new InvalidInputError(`${problem} at index ${state.offset + index}.`)
}

function decodeChunk(state: State, text: string, final: boolean): Uint8Array<ArrayBuffer> {
  const { values, mime, strict } = state
  let { bits, count, padding } = state
  const length = text.length
  let end = length
  while (end > 0 && text.charCodeAt(end - 1) === 0x3d) end--
  const out = new Uint8Array(Math.ceil((end + count) / 4) * 3)
  let j = 0
  let i = 0

  while (i < length) {
    if (count === 0 && padding === 'none') {
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

    const code = text.charCodeAt(i)
    const value = code < 128 ? values[code]! : -1
    if (value >= 0) {
      if (padding !== 'none') invalid(state, i, 'Unexpected character after padding')
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
      if (!mime) {
        if (padding === 'needsSecond') padding = 'done'
        else if (padding === 'done' || count < 2) invalid(state, i, 'Unexpected padding')
        else {
          if (strict && (count === 2 ? bits & 0xf : bits & 0x3) !== 0)
            invalid(state, i, 'Non-zero bits before padding')
          padding = count === 2 ? 'needsSecond' : 'done'
        }
      }
      if (count === 2) out[j++] = bits >> 4
      else if (count === 3) {
        out[j++] = bits >> 10
        out[j++] = bits >> 2
      }
      bits = 0
      count = 0
    } else if (!mime && !isWhitespace(code)) {
      invalid(state, i, 'Invalid character')
    }
    i++
  }

  if (final && !mime) {
    if (padding === 'needsSecond')
      throw new TruncatedError('Incomplete padding at the end of the input.')
    if (count > 0 && strict) throw new TruncatedError('Missing padding at the end of the input.')
    if (count === 1) throw new TruncatedError('The input ends with a single character of a group.')
  }
  if (final) {
    if (count === 2) out[j++] = bits >> 4
    else if (count === 3) {
      out[j++] = bits >> 10
      out[j++] = bits >> 2
    }
    bits = 0
    count = 0
  }
  state.bits = bits
  state.count = count
  state.padding = padding
  state.offset += length
  return j === out.length ? out : out.slice(0, j)
}
