import type { Charset, Definition, Encoder } from './Charset.js'
import { byteTable, codeTable } from './internal/tables.js'
import { jis0208 } from './tables/jis0208.js'

let table: Uint16Array | undefined

function build(): Uint16Array {
  const bytes = byteTable()
  bytes[0x80] = 0x180
  bytes[0xa5] = 0x15c
  bytes[0x203e] = 0x17e
  for (let codePoint = 0xff61; codePoint <= 0xff9f; codePoint++) {
    bytes[codePoint] = 0x100 | (codePoint - 0xff61 + 0xa1)
  }
  codeTable(
    bytes,
    jis0208,
    (pointer) => {
      const leading = Math.floor(pointer / 188)
      const trailing = pointer % 188
      return (
        ((leading + (leading < 0x1f ? 0x81 : 0xc1)) << 8) |
        (trailing + (trailing < 0x3f ? 0x40 : 0x41))
      )
    },
    0,
    (pointer) => pointer >= 8272 && pointer <= 8835,
  )
  bytes[0x2212] = bytes[0xff0d]!
  return bytes
}

function encoder(): Encoder {
  return { table: (table ??= build()), write: (codePoint) => codePoint }
}

/**
 * Shift_JIS as the WHATWG Encoding Standard defines it, which is Windows code page 932
 * (`windows-31j`, `cp932`) including the NEC and IBM extensions.
 *
 * @example
 * ```ts
 * import * as Charset from '@portable/charset'
 * import { shiftJis } from '@portable/charset/shift_jis'
 *
 * Charset.encode('日本ｶﾅ', shiftJis) // Uint8Array [0x93, 0xfa, 0x96, 0x7b, 0xb6, 0xc5]
 * ```
 */
export const shiftJis = {
  name: 'Shift_JIS',
  maxBytes: 2,
  encoder,
} satisfies Definition as unknown as Charset
