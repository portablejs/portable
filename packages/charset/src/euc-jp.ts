import type { Charset, Encoder } from './Charset.js'
import { byteTable, codeTable } from './internal/tables.js'
import { jis0208 } from './tables/jis0208.js'

let table: Uint16Array | undefined

function build(): Uint16Array {
  const bytes = byteTable()
  bytes[0xa5] = 0x15c
  bytes[0x203e] = 0x17e
  for (let codePoint = 0xff61; codePoint <= 0xff9f; codePoint++) {
    bytes[codePoint] = 0x8e00 | (codePoint - 0xff61 + 0xa1)
  }
  codeTable(
    bytes,
    jis0208,
    (pointer) => ((Math.floor(pointer / 94) + 0xa1) << 8) | ((pointer % 94) + 0xa1),
  )
  bytes[0x2212] = bytes[0xff0d]!
  return bytes
}

function encoder(): Encoder {
  return { table: (table ??= build()), write: (codePoint) => codePoint }
}

/**
 * EUC-JP. As the WHATWG Encoding Standard specifies, it encodes JIS X 0208 and halfwidth katakana
 * only. JIS X 0212 characters are decoded but never encoded.
 *
 * @example
 * ```ts
 * import * as Charset from '@portable/charset'
 * import { eucJp } from '@portable/charset/euc-jp'
 *
 * Charset.encode('日本', eucJp) // Uint8Array [0xc6, 0xfc, 0xcb, 0xdc]
 * ```
 */
export const eucJp: Charset = { name: 'EUC-JP', maxBytes: 2, encoder }
