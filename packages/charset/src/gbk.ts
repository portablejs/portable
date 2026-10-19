import type { Charset, Encoder } from './Charset.js'
import { byteTable, codeTable, unpackInts } from './internal/tables.js'
import { gb18030 as index, gb18030Ranges } from './tables/gb18030.js'

let tables: { gb18030: Uint16Array; gbk: Uint16Array } | undefined
let ranges: { pointers: number[]; codePoints: number[] } | undefined

// GB18030-2022 moved these characters out of the Private Use Area. The encoder keeps their
// GB18030-2005 two-byte forms (see the gb18030 encoder in the WHATWG Encoding Standard).
const privateUse: Record<number, number> = {
  0xe78d: 0xa6d9,
  0xe78e: 0xa6da,
  0xe78f: 0xa6db,
  0xe790: 0xa6dc,
  0xe791: 0xa6dd,
  0xe792: 0xa6de,
  0xe793: 0xa6df,
  0xe794: 0xa6ec,
  0xe795: 0xa6ed,
  0xe796: 0xa6f3,
  0xe81e: 0xfe59,
  0xe826: 0xfe61,
  0xe82b: 0xfe66,
  0xe82c: 0xfe67,
  0xe832: 0xfe6d,
  0xe843: 0xfe7e,
  0xe854: 0xfe90,
  0xe864: 0xfea0,
}

function rangesPointer(codePoint: number): number {
  if (codePoint === 0xe7c7) return 7457
  if (!ranges) {
    const values = unpackInts(gb18030Ranges)
    ranges = { pointers: [], codePoints: [] }
    for (let i = 0, pointer = 0, start = 0; i < values.length; i += 2) {
      ranges.pointers.push((pointer += values[i]!))
      ranges.codePoints.push((start += values[i + 1]!))
    }
  }
  const { codePoints } = ranges
  let low = 0
  let high = codePoints.length - 1
  while (low < high) {
    const middle = (low + high + 1) >> 1
    if (codePoints[middle]! <= codePoint) low = middle
    else high = middle - 1
  }
  return ranges.pointers[low]! + codePoint - codePoints[low]!
}

function build(): { gb18030: Uint16Array; gbk: Uint16Array } {
  const gb18030 = byteTable()
  for (const [codePoint, bytes] of Object.entries(privateUse)) gb18030[Number(codePoint)] = bytes
  codeTable(gb18030, index, (pointer) => {
    const trailing = pointer % 190
    return ((Math.floor(pointer / 190) + 0x81) << 8) | (trailing + (trailing < 0x3f ? 0x40 : 0x41))
  })
  const gbk = gb18030.slice()
  gbk[0x20ac] = 0x180
  return { gb18030, gbk }
}

function encoder(isGbk: boolean): Encoder {
  tables ??= build()
  return {
    table: isGbk ? tables.gbk : tables.gb18030,
    write(codePoint, out) {
      if (isGbk || codePoint === 0xe5e5) return codePoint
      const pointer = rangesPointer(codePoint)
      const { bytes } = out
      bytes[out.length++] = Math.floor(pointer / 12600) + 0x81
      bytes[out.length++] = Math.floor((pointer % 12600) / 1260) + 0x30
      bytes[out.length++] = Math.floor((pointer % 1260) / 10) + 0x81
      bytes[out.length++] = (pointer % 10) + 0x30
      return -1
    },
  }
}

/**
 * GBK, which the WHATWG Encoding Standard also uses for the labels `gb2312` and `x-gbk`. It is
 * gb18030 without the four-byte sequences, and it writes € as the single byte 0x80.
 *
 * @example
 * ```ts
 * import * as Charset from '@portable/charset'
 * import { gbk } from '@portable/charset/gbk'
 *
 * Charset.encode('中国€', gbk) // Uint8Array [0xd6, 0xd0, 0xb9, 0xfa, 0x80]
 * ```
 */
export const gbk: Charset = { name: 'GBK', maxBytes: 2, encoder: () => encoder(true) }

/**
 * gb18030, which encodes every Unicode scalar value except U+E5E5.
 *
 * @example
 * ```ts
 * import * as Charset from '@portable/charset'
 * import { gb18030 } from '@portable/charset/gbk'
 *
 * Charset.encode('中€😀', gb18030) // Uint8Array [0xd6, 0xd0, 0xa2, 0xe3, 0x94, 0x39, 0xfc, 0x36]
 * ```
 */
export const gb18030: Charset = { name: 'gb18030', maxBytes: 4, encoder: () => encoder(false) }
