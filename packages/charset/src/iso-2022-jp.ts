import type { Charset, Encoder, Output } from './Charset.js'
import { codeTable, unpackIndex } from './internal/tables.js'
import { jis0208 } from './tables/jis0208.js'
import { katakana } from './tables/iso-2022-jp-katakana.js'

const ascii = 0
const roman = 1
const jis = 2

let fullwidth: number[] | undefined
let codes: Uint16Array | undefined

function escape(out: Output, final: number, intermediate = 0x28): void {
  out.bytes[out.length++] = 0x1b
  out.bytes[out.length++] = intermediate
  out.bytes[out.length++] = final
}

function encoder(): Encoder {
  codes ??= codeTable(
    new Uint16Array(0x10000),
    jis0208,
    (pointer) => ((Math.floor(pointer / 94) + 0x21) << 8) | ((pointer % 94) + 0x21),
  )
  const jisCodes = codes
  if (!fullwidth) {
    const table: number[] = []
    unpackIndex(katakana, 0, (pointer, codePoint) => (table[pointer] = codePoint))
    fullwidth = table
  }
  const halfToFull = fullwidth
  let state = ascii

  const write = (codePoint: number, out: Output): number => {
    const { bytes } = out
    if (state !== jis && (codePoint === 0x0e || codePoint === 0x0f || codePoint === 0x1b)) {
      return 0xfffd
    }
    if (state === ascii && codePoint < 0x80) {
      bytes[out.length++] = codePoint
      return -1
    }
    if (state === roman) {
      if (codePoint < 0x80 && codePoint !== 0x5c && codePoint !== 0x7e) {
        bytes[out.length++] = codePoint
        return -1
      }
      if (codePoint === 0xa5 || codePoint === 0x203e) {
        bytes[out.length++] = codePoint === 0xa5 ? 0x5c : 0x7e
        return -1
      }
    }
    if (codePoint < 0x80) {
      escape(out, 0x42)
      state = ascii
      return write(codePoint, out)
    }
    if (codePoint === 0xa5 || codePoint === 0x203e) {
      escape(out, 0x4a)
      state = roman
      return write(codePoint, out)
    }
    let target = codePoint === 0x2212 ? 0xff0d : codePoint
    if (target >= 0xff61 && target <= 0xff9f) target = halfToFull[target - 0xff61]!
    const code = jisCodes[target] ?? 0
    if (code === 0) return codePoint
    if (state !== jis) {
      escape(out, 0x42, 0x24)
      state = jis
    }
    bytes[out.length++] = code >> 8
    bytes[out.length++] = code & 0xff
    return -1
  }

  return {
    write,
    flush(out) {
      if (state === ascii) return
      escape(out, 0x42)
      state = ascii
    },
  }
}

/**
 * ISO-2022-JP, the 7-bit Japanese charset used in email. It switches between ASCII, JIS X 0201
 * Roman and JIS X 0208 with escape sequences and always ends in ASCII. Halfwidth katakana are
 * encoded as their fullwidth forms.
 *
 * @example
 * ```ts
 * import * as Charset from '@portable/charset'
 * import { iso2022Jp } from '@portable/charset/iso-2022-jp'
 *
 * Charset.encode('a日', iso2022Jp) // Uint8Array [0x61, 0x1b, 0x24, 0x42, 0x46, 0x7c, 0x1b, 0x28, 0x42]
 * ```
 */
export const iso2022Jp: Charset = { name: 'ISO-2022-JP', maxBytes: 5, encoder }
