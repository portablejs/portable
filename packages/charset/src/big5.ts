import type { Charset, Encoder } from './Charset.js'
import { byteTable, unpackIndex } from './internal/tables.js'
import { big5 as index, big5Start } from './tables/big5.js'

// These code points appear twice in index Big5, and the encoder uses the last pointer.
const useLast = [0x2550, 0x255e, 0x2561, 0x256a, 0x5341, 0x5345]

let tables: { bmp: Uint16Array; astral: Map<number, number> } | undefined

function code(pointer: number): number {
  const trailing = pointer % 157
  return ((Math.floor(pointer / 157) + 0x81) << 8) | (trailing + (trailing < 0x3f ? 0x40 : 0x62))
}

function encoder(): Encoder {
  if (!tables) {
    const bmp = byteTable()
    const astral = new Map<number, number>()
    unpackIndex(index, big5Start, (pointer, codePoint) => {
      if (codePoint >= 0x10000) {
        if (!astral.has(codePoint)) astral.set(codePoint, code(pointer))
      } else if (bmp[codePoint] === 0 || useLast.includes(codePoint)) {
        bmp[codePoint] = code(pointer)
      }
    })
    tables = { bmp, astral }
  }
  const { bmp, astral } = tables
  return {
    table: bmp,
    write(codePoint, out) {
      const bytes = astral.get(codePoint)
      if (bytes === undefined) return codePoint
      out.bytes[out.length++] = bytes >> 8
      out.bytes[out.length++] = bytes & 0xff
      return -1
    },
  }
}

/**
 * Big5 as the WHATWG Encoding Standard defines it, which decodes the Hong Kong Supplementary
 * Character Set but never encodes it, so the output is readable by plain Big5 decoders.
 *
 * @example
 * ```ts
 * import * as Charset from '@portable/charset'
 * import { big5 } from '@portable/charset/big5'
 *
 * Charset.encode('中文', big5) // Uint8Array [0xa4, 0xa4, 0xa4, 0xe5]
 * ```
 */
export const big5: Charset = { name: 'Big5', maxBytes: 2, encoder }
