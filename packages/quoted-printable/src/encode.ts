import { createUtf8Encoder, encodeUtf8 } from './utf8.js'

export declare namespace encode {
  type Options = {
    /**
     * Encode a CR or LF that is not part of a CRLF pair, so that a transport that rewrites line
     * endings can't change the data. Use it for binary content. @default false
     */
    binary?: boolean | undefined
    /**
     * Longest output line, not counting the line break. Lines are broken with soft line breaks
     * (`=` followed by CRLF). An integer of at least 4, or `false` for no soft line breaks; anything
     * else throws a `RangeError`. @default 76
     */
    lineLength?: number | false | undefined
  }
}

/**
 * Encodes bytes as quoted-printable (RFC 2045 section 6.7). A string is encoded as UTF-8 first.
 *
 * Line breaks in the input are kept, whitespace before a line break or at the end is escaped, and
 * a hyphen that would start a line is escaped so that no line can be read as a MIME boundary.
 *
 * @example
 * ```ts
 * import * as QuotedPrintable from '@portable/quoted-printable'
 *
 * QuotedPrintable.encode('tere jõgeva') // 'tere j=C3=B5geva'
 * QuotedPrintable.encode('a'.repeat(80)) // 75 a's, a soft line break ('=\r\n'), then 5 a's
 * ```
 */
export function encode(input: Uint8Array | string, options: encode.Options = {}): string {
  const bytes = typeof input === 'string' ? encodeUtf8(input) : input
  return createEncoder(options).write(bytes, true)
}

/**
 * A `TransformStream` that encodes bytes or text as quoted-printable. Its output is the same as
 * `encode()` of the whole input, however the input is split into chunks.
 *
 * @example
 * ```ts
 * import * as QuotedPrintable from '@portable/quoted-printable'
 *
 * const body = file.stream().pipeThrough(new QuotedPrintable.EncoderStream())
 * ```
 */
export class EncoderStream extends TransformStream<Uint8Array | string, string> {
  constructor(options: EncoderStream.Options = {}) {
    const encoder = createEncoder(options)
    const utf8 = createUtf8Encoder()
    super({
      transform(chunk, controller) {
        const output = encoder.write(utf8.write(chunk), false)
        if (output !== '') controller.enqueue(output)
      },
      flush(controller) {
        const output = encoder.write(utf8.flush(), true)
        if (output !== '') controller.enqueue(output)
      },
    })
  }
}

export declare namespace EncoderStream {
  type Options = encode.Options
}

const EQUALS = 0x3d
const HYPHEN = 0x2d
const SPACE = 0x20
const TAB = 0x09
const CR = 0x0d
const LF = 0x0a
const OUTPUT_CHUNK = 64 * 1024

const ESCAPE = 0
const LITERAL = 1
const DEPENDS_ON_NEIGHBOURS = 2
const kind = new Uint8Array(256)
for (let i = 0x20; i <= 0x7e; i++) kind[i] = LITERAL
for (const b of [SPACE, TAB, HYPHEN, CR, LF]) kind[b] = DEPENDS_ON_NEIGHBOURS
kind[EQUALS] = ESCAPE

const hexDigits = new TextEncoder().encode('0123456789ABCDEF')

const hexValue = new Int8Array(256).fill(-1)
for (let i = 0; i < 16; i++) {
  hexValue[hexDigits[i]!] = i
  hexValue[hexDigits[i]! | 0x20] = i
}

// libqp prefers to break a line after one of these characters.
const breakAfter = new Uint8Array(256)
for (const c of ' \t.,!?') breakAfter[c.charCodeAt(0)] = 1

const outputDecoder = new TextDecoder()

type Encoder = { write: (bytes: Uint8Array, final: boolean) => string }

// Produces the output of libqp 3.0.1's `wrap(encode(input), lineLength)`, one byte at a time so
// that a stream can stop anywhere. libqp decides each soft line break from the first `lineLength`
// characters of the rest of the line, so a line is broken as soon as it holds more than that.
// The unfinished line stays at the end of `out` until it is complete.
function createEncoder(options: encode.Options): Encoder {
  const { binary = false, lineLength: lineLengthOption = 76 } = options
  if (
    lineLengthOption !== false &&
    (!Number.isInteger(lineLengthOption) || (lineLengthOption as number) < 4)
  )
    throw new RangeError(
      `lineLength must be false or an integer of at least 4, got ${String(lineLengthOption)}.`,
    )
  const wrap = lineLengthOption !== false
  const lineLength = wrap ? lineLengthOption : Infinity
  const margin = wrap ? Math.floor(lineLengthOption / 3) : 0

  const out = new Uint8Array(OUTPUT_CHUNK + (wrap ? lineLengthOption : 0) + 64)
  let o = 0
  let lineStart = 0
  // Whether the current line follows a soft line break. A hyphen that starts it is then escaped.
  let afterSoftBreak = false
  let previous = -1
  let held = -1
  let parts = ''

  // Whether the line ends at `end` with "=" and from `minDigits` to 2 hex digits.
  const endsInEscape = (end: number, minDigits: number) => {
    for (let digits = minDigits; digits <= 2; digits++) {
      if (end - digits - 1 < lineStart || out[end - digits - 1] !== EQUALS) continue
      let hex = true
      for (let d = 1; d <= digits; d++) if (hexValue[out[end - d]!]! < 0) hex = false
      if (hex) return true
    }
    return false
  }

  // Moves the escapes of a multi-byte UTF-8 sequence at the end of a line to the next line,
  // unless they are all the line holds.
  const trimUtf8Sequence = (end: number) => {
    let cut = end
    while (cut - 3 >= lineStart && out[cut - 3] === EQUALS) {
      const hi = hexValue[out[cut - 2]!]!
      const lo = hexValue[out[cut - 1]!]!
      if (hi < 0 || lo < 0) break
      const code = (hi << 4) | lo
      if (code < 0x80) break
      cut -= 3
      if (code >= 0xc0) break
    }
    const s = lineStart
    const start = out[s] === EQUALS && out[s + 1] === 0x32 && out[s + 2] === 0x44 ? s + 3 : s
    return cut > start ? cut : end
  }

  const breakLine = () => {
    const s = lineStart
    let end = s + lineLength
    let k = end - 1
    while (k >= end - margin && breakAfter[out[k]!] === 0) k--
    if (k >= end - margin) end = k + 1
    else if (endsInEscape(end, 0)) {
      if (out[end - 1] === EQUALS) end -= 1
      else if (out[end - 2] === EQUALS && hexValue[out[end - 1]!]! >= 0) end -= 2
      end = trimUtf8Sequence(end)
    }
    if (end === s + lineLength) end -= endsInEscape(end, 2) ? 3 : 1

    out.copyWithin(end + 3, end, o)
    out[end] = EQUALS
    out[end + 1] = CR
    out[end + 2] = LF
    o += 3
    lineStart = end + 3
    afterSoftBreak = true
    if (o > lineStart && out[lineStart] === HYPHEN) {
      out.copyWithin(lineStart + 3, lineStart + 1, o)
      out[lineStart] = EQUALS
      out[lineStart + 1] = 0x32
      out[lineStart + 2] = 0x44
      o += 2
    }
  }

  // A CR at the end of the line doesn't count while an LF may still follow it.
  const fitLine = (crMayEndLine: boolean) => {
    while (
      o - lineStart - (crMayEndLine && o > lineStart && out[o - 1] === CR ? 1 : 0) >
      lineLength
    )
      breakLine()
  }

  const encodeByte = (b: number, next: number) => {
    let escape = kind[b] === ESCAPE
    if (kind[b] === DEPENDS_ON_NEIGHBOURS) {
      if (b === SPACE || b === TAB) escape = next < 0 || next === LF || next === CR
      else if (b === HYPHEN)
        escape =
          previous < 0 || previous === LF || previous === CR || (afterSoftBreak && o === lineStart)
      else if (b === CR) escape = binary && next !== LF
      else escape = binary && previous !== CR
    }
    previous = b
    if (escape) {
      out[o++] = EQUALS
      out[o++] = hexDigits[b >> 4]!
      out[o++] = hexDigits[b & 15]!
    } else {
      out[o++] = b
      if (b === LF) {
        lineStart = o
        afterSoftBreak = false
        return
      }
    }
    if (o - lineStart > lineLength) fitLine(true)
  }

  const takeOutput = () => {
    const end = wrap ? lineStart : o
    parts += outputDecoder.decode(out.subarray(0, end))
    out.copyWithin(0, end, o)
    o -= end
    lineStart = 0
  }

  return {
    write(bytes, final) {
      parts = ''
      const length = bytes.length
      if (held >= 0) {
        if (length === 0 && !final) return ''
        encodeByte(held, length > 0 ? bytes[0]! : -1)
        held = -1
      }
      let end = length
      if (!final && end > 0) {
        const last = bytes[end - 1]!
        if (last === SPACE || last === TAB || (binary && last === CR)) {
          held = last
          end--
        }
      }
      for (let i = 0; i < end; i++) {
        const b = bytes[i]!
        if (kind[b] === LITERAL) {
          out[o++] = b
          previous = b
          if (o - lineStart > lineLength) fitLine(false)
        } else encodeByte(b, i + 1 < length ? bytes[i + 1]! : -1)
        if (o > OUTPUT_CHUNK) takeOutput()
      }
      if (final) {
        fitLine(false)
        lineStart = o
      }
      takeOutput()
      return parts
    },
  }
}
