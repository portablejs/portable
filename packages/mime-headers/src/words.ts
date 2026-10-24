import * as Base64 from '@portable/base64'
import * as Bytes from '@portable/bytes'
import { checkLength, decodeCharset, hexDigit, toText } from './internal/text.js'

/**
 * A charset to write encoded words in, for mail that has to use one other than UTF-8. `encode`
 * is called once per encoded word, so it must return bytes that decode on their own: a stateful
 * charset such as ISO-2022-JP has to end in its initial state.
 *
 * @example
 * ```ts
 * import * as Charset from '@portable/charset'
 * import { iso2022Jp } from '@portable/charset/iso-2022-jp'
 *
 * const charset = { name: 'ISO-2022-JP', encode: (text: string) => Charset.encode(text, iso2022Jp) }
 * ```
 */
const utf8Encoder = new TextEncoder()
let scratch = new Uint8Array(1024)

/** Returns a view of a buffer that the next call overwrites. */
export function encodeUtf8Scratch(text: string): Uint8Array {
  if (text.length > 16384) return utf8Encoder.encode(text)
  if (text.length * 3 > scratch.length) scratch = new Uint8Array(text.length * 3)
  return scratch.subarray(0, utf8Encoder.encodeInto(text, scratch).written)
}

/**
 * Encodes text in a charset other than UTF-8 for encoded-words. `@portable/charset` provides
 * encoders.
 */
export type CharsetEncoder = {
  /** The name written into each encoded word. */
  readonly name: string
  readonly encode: (text: string) => Uint8Array
}

/**
 * `'Q'` keeps ASCII letters and digits readable. `'B'` is base64 and shorter for non-Latin text.
 */
export type WordEncoding = 'Q' | 'B'

export declare namespace encodeWord {
  type Options = {
    /** Charset of the encoded bytes. @default UTF-8 */
    charset?: CharsetEncoder | undefined
    /** @default 'Q' */
    wordEncoding?: WordEncoding | undefined
    /**
     * Longest encoded word, `=?` and `?=` included. Longer text is split into several words that
     * each contain whole characters. RFC 2047 allows 75. A word with a single character may be
     * longer when the limit is too small for it. `false` writes one word. @default 75
     */
    wordLength?: number | false | undefined
  }
}

/**
 * Encodes all of `text` as RFC 2047 encoded words, separated by spaces. The result is safe in any
 * header, including inside a display name.
 *
 * @example
 * ```ts
 * import * as MimeHeaders from '@portable/mime-headers'
 *
 * MimeHeaders.encodeWord('See on õhin test') // '=?UTF-8?Q?See_on_=C3=B5hin_test?='
 * MimeHeaders.encodeWord('See on õhin test', { wordEncoding: 'B' }) // '=?UTF-8?B?U2VlIG9uIMO1aGluIHRlc3Q=?='
 * ```
 */
export function encodeWord(input: string | Uint8Array, options: encodeWord.Options = {}): string {
  const { charset, wordEncoding: encoding = 'Q', wordLength = 75 } = options
  if (encoding !== 'Q' && encoding !== 'B')
    throw new RangeError(`Unknown wordEncoding ${String(encoding)}.`)
  if (wordLength !== false) checkLength('wordLength', wordLength)
  const prefix = charset
    ? `=?${charset.name}?${encoding}?`
    : encoding === 'Q'
      ? '=?UTF-8?Q?'
      : '=?UTF-8?B?'
  const budget =
    wordLength === false
      ? Infinity
      : Math.max(wordLength - prefix.length - 2, encoding === 'Q' ? 12 : 4)
  const text = typeof input === 'string' ? input : toText(input)
  const bytes = charset ? undefined : encodeUtf8Scratch(text)
  if (bytes && encoding === 'B' && Math.ceil(bytes.length / 3) * 4 <= budget)
    return prefix + Base64.encode(bytes) + '?='
  const fits =
    encoding === 'Q'
      ? (length: number) => length <= budget
      : (length: number) => Math.ceil(length / 3) * 4 <= budget
  if (!bytes)
    return splitCharset(text, charset!, encoding, fits)
      .map((chunk) => prefix + (encoding === 'Q' ? encodeQ(chunk) : Base64.encode(chunk)) + '?=')
      .join(' ')
  let result = ''
  for (const chunk of splitUtf8(bytes, encoding, fits))
    result +=
      (result ? ' ' : '') +
      prefix +
      (encoding === 'Q' ? encodeQ(chunk) : Base64.encode(chunk)) +
      '?='
  return result
}

export declare namespace encodeWords {
  type Options = encodeWord.Options
}

/**
 * Encodes the part of `text` that can't appear in a header as is, and leaves the rest readable. The
 * encoded part runs from the first word that needs encoding to the last one: a word with a
 * character outside printable ASCII, or one that would read as an encoded word.
 *
 * @example
 * ```ts
 * import * as MimeHeaders from '@portable/mime-headers'
 *
 * MimeHeaders.encodeWords('Tere õhtust, Mari') // 'Tere =?UTF-8?Q?=C3=B5htust=2C?= Mari'
 * MimeHeaders.encodeWords('plain ascii') // 'plain ascii'
 * ```
 */
export function encodeWords(input: string | Uint8Array, options: encodeWords.Options = {}): string {
  const text = toText(input)
  let start = -1
  let end = -1
  let wordStart = 0
  let encodeThisWord = false
  for (let i = 0; i <= text.length; i++) {
    const code = i < text.length ? text.charCodeAt(i) : 0x20
    if (code === 0x20 || code === 0x09) {
      if (encodeThisWord) {
        if (start < 0) start = wordStart
        end = i
      }
      wordStart = i + 1
      encodeThisWord = false
    } else if (
      code < 0x20 ||
      code > 0x7e ||
      (code === 0x3f && (text.charCodeAt(i - 1) === 0x3d || text.charCodeAt(i + 1) === 0x3d))
    ) {
      encodeThisWord = true
    }
  }
  if (start < 0) return text
  return text.slice(0, start) + encodeWord(text.slice(start, end), options) + text.slice(end)
}

/**
 * Decodes the RFC 2047 encoded words in a header value and leaves other text as it is. Words
 * separated only by whitespace are joined, and adjacent words in the same charset are decoded
 * together, so a character split across two words still decodes. A charset that `TextDecoder`
 * doesn't know is read as UTF-8. Malformed input never throws.
 *
 * @example
 * ```ts
 * import * as MimeHeaders from '@portable/mime-headers'
 *
 * MimeHeaders.decodeWords('Hello =?UTF-8?Q?J=C3=B5geva?=') // 'Hello Jõgeva'
 * MimeHeaders.decodeWords('=?UTF-8?B?w7U=?= =?UTF-8?B?w7U=?=') // 'õõ'
 * ```
 */
export function decodeWords(input: string | Uint8Array): string {
  const text = toText(input)
  const word = /=\?([^?\s]+)\?([BbQq])\?([^?]*)\?=/g
  let result = ''
  let last = 0
  let charset = ''
  let pending: Uint8Array[] = []
  const flush = () => {
    if (pending.length > 0)
      result += decodeCharset(pending.length === 1 ? pending[0]! : Bytes.concat(pending), charset)
    pending = []
  }
  for (let match = word.exec(text); match; match = word.exec(text)) {
    const between = text.slice(last, match.index)
    const label = withoutLanguage(match[1]!)
    if (pending.length === 0 || !/^[ \t\r\n]*$/.test(between)) {
      flush()
      result += between
    } else if (label.toLowerCase() !== charset.toLowerCase()) flush()
    charset = label
    pending.push(
      match[2] === 'B' || match[2] === 'b'
        ? Base64.decode(match[3]!, { mode: 'mime' })
        : decodeQ(match[3]!),
    )
    last = match.index + match[0].length
  }
  flush()
  return result + text.slice(last)
}

/** RFC 2231 section 5 lets an encoded word's charset include a language, as in `UTF-8*en`. */
const withoutLanguage = (charset: string): string => {
  const star = charset.indexOf('*')
  return star < 0 ? charset : charset.slice(0, star)
}

function splitUtf8(
  bytes: Uint8Array,
  encoding: WordEncoding,
  fits: (length: number) => boolean,
): Uint8Array[] {
  const chunks: Uint8Array[] = []
  let start = 0
  let length = 0
  for (let i = 0; i < bytes.length;) {
    const lead = bytes[i]!
    const size = lead < 0x80 ? 1 : lead < 0xe0 ? 2 : lead < 0xf0 ? 3 : 4
    const added = encoding === 'B' ? size : lead < 0x80 ? qLength(lead) : size * 3
    const next = encoding === 'B' ? i + size - start : length + added
    if (i > start && !fits(next)) {
      chunks.push(bytes.subarray(start, i))
      start = i
      length = added
    } else length += added
    i += size
  }
  if (bytes.length > start || chunks.length === 0) chunks.push(bytes.subarray(start))
  return chunks
}

function splitCharset(
  text: string,
  charset: CharsetEncoder,
  encoding: WordEncoding,
  fits: (length: number) => boolean,
): Uint8Array[] {
  const characters = Array.from(text)
  const size = (bytes: Uint8Array) => (encoding === 'B' ? bytes.length : qLengthOf(bytes))
  const chunks: Uint8Array[] = []
  let start = 0
  let current = charset.encode('')
  for (let i = 0; i < characters.length; i++) {
    const candidate = charset.encode(characters.slice(start, i + 1).join(''))
    if (i > start && !fits(size(candidate))) {
      chunks.push(current)
      start = i
      current = charset.encode(characters[i]!)
    } else current = candidate
  }
  chunks.push(current)
  return chunks
}

/** RFC 2047 section 5 (3): the characters a Q word may keep as is anywhere, even in a phrase. */
const qSafe = /* @__PURE__ */ (() => {
  const table = new Uint8Array(128)
  for (const character of 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!*+-/ ')
    table[character.charCodeAt(0)] = 1
  return table
})()

const qLength = (byte: number): number => (byte < 0x80 && qSafe[byte] ? 1 : 3)

function qLengthOf(bytes: Uint8Array): number {
  let length = 0
  for (const byte of bytes) length += qLength(byte)
  return length
}

const hex = '0123456789ABCDEF'

function encodeQ(bytes: Uint8Array): string {
  let result = ''
  for (const byte of bytes) {
    if (byte === 0x20) result += '_'
    else if (byte < 0x80 && qSafe[byte]) result += String.fromCharCode(byte)
    else result += '=' + hex[byte >> 4]! + hex[byte & 15]!
  }
  return result
}

function decodeQ(payload: string): Uint8Array {
  const bytes = encodeUtf8Scratch(payload.replace(/=[ \t\r\n]+(?=[0-9A-Fa-f])/g, '='))
  const out = new Uint8Array(bytes.length)
  let length = 0
  for (let i = 0; i < bytes.length; i++) {
    const byte = bytes[i]!
    if (byte === 0x3d && i + 2 < bytes.length) {
      const high = hexDigit(bytes[i + 1]!)
      const low = hexDigit(bytes[i + 2]!)
      if (high >= 0 && low >= 0) {
        out[length++] = (high << 4) | low
        i += 2
        continue
      }
    }
    out[length++] = byte === 0x5f || byte === 0x09 || byte === 0x0d || byte === 0x0a ? 0x20 : byte
  }
  return out.subarray(0, length)
}
