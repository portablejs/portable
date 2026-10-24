import type { Charset, Encoder } from './Charset.js'
import { define } from './define.js'
import { byteTable, codeTable } from './internal/tables.js'
import { eucKr as index } from './tables/euc-kr.js'

let table: Uint16Array | undefined

function encoder(): Encoder {
  table ??= codeTable(
    byteTable(),
    index,
    (pointer) => ((Math.floor(pointer / 190) + 0x81) << 8) | ((pointer % 190) + 0x41),
  )
  return { table, write: (codePoint) => codePoint }
}

/**
 * EUC-KR as the WHATWG Encoding Standard defines it, which is Windows code page 949 (Unified
 * Hangul Code) and covers every Hangul syllable.
 *
 * @example
 * ```ts
 * import * as Charset from '@portable/charset'
 * import { eucKr } from '@portable/charset/euc-kr'
 *
 * Charset.encode('한국', eucKr) // Uint8Array [0xc7, 0xd1, 0xb1, 0xb9]
 * ```
 */
export const eucKr: Charset = /* @__PURE__ */ define({
  name: 'EUC-KR',
  maxBytes: 2,
  encoder,
})
