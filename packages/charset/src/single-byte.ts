import type { Charset, Encoder } from './Charset.js'
import { define } from './define.js'
import { asciiTable, byteTable, unpackIndex } from './internal/tables.js'
import * as tables from './tables/single-byte.js'

let cache: Map<string, Uint16Array> | undefined

function singleByte(index: string): Encoder {
  cache ??= new Map()
  let table = cache.get(index)
  if (!table) {
    const bytes = byteTable()
    unpackIndex(index, 0, (pointer, codePoint) => {
      if (bytes[codePoint] === 0) bytes[codePoint] = 0x100 | (0x80 + pointer)
    })
    table = bytes
    cache.set(index, table)
  }
  return { table, write: (codePoint) => codePoint }
}

/**
 * IBM866.
 *
 * @example
 * ```ts
 * import * as Charset from '@portable/charset'
 * import { ibm866 } from '@portable/charset/single-byte'
 *
 * Charset.encode('р', ibm866) // Uint8Array [0xe0]
 * ```
 */
export const ibm866: Charset = /* @__PURE__ */ define({
  name: 'IBM866',
  maxBytes: 1,
  encoder: () => singleByte(tables.ibm866),
})

/**
 * ISO-8859-2.
 *
 * @example
 * ```ts
 * import * as Charset from '@portable/charset'
 * import { iso8859_2 } from '@portable/charset/single-byte'
 *
 * Charset.encode('ŕ', iso8859_2) // Uint8Array [0xe0]
 * ```
 */
export const iso8859_2: Charset = /* @__PURE__ */ define({
  name: 'ISO-8859-2',
  maxBytes: 1,
  encoder: () => singleByte(tables.iso8859_2),
})

/**
 * ISO-8859-3.
 *
 * @example
 * ```ts
 * import * as Charset from '@portable/charset'
 * import { iso8859_3 } from '@portable/charset/single-byte'
 *
 * Charset.encode('à', iso8859_3) // Uint8Array [0xe0]
 * ```
 */
export const iso8859_3: Charset = /* @__PURE__ */ define({
  name: 'ISO-8859-3',
  maxBytes: 1,
  encoder: () => singleByte(tables.iso8859_3),
})

/**
 * ISO-8859-4.
 *
 * @example
 * ```ts
 * import * as Charset from '@portable/charset'
 * import { iso8859_4 } from '@portable/charset/single-byte'
 *
 * Charset.encode('ā', iso8859_4) // Uint8Array [0xe0]
 * ```
 */
export const iso8859_4: Charset = /* @__PURE__ */ define({
  name: 'ISO-8859-4',
  maxBytes: 1,
  encoder: () => singleByte(tables.iso8859_4),
})

/**
 * ISO-8859-5.
 *
 * @example
 * ```ts
 * import * as Charset from '@portable/charset'
 * import { iso8859_5 } from '@portable/charset/single-byte'
 *
 * Charset.encode('р', iso8859_5) // Uint8Array [0xe0]
 * ```
 */
export const iso8859_5: Charset = /* @__PURE__ */ define({
  name: 'ISO-8859-5',
  maxBytes: 1,
  encoder: () => singleByte(tables.iso8859_5),
})

/**
 * ISO-8859-6.
 *
 * @example
 * ```ts
 * import * as Charset from '@portable/charset'
 * import { iso8859_6 } from '@portable/charset/single-byte'
 *
 * Charset.encode('ـ', iso8859_6) // Uint8Array [0xe0]
 * ```
 */
export const iso8859_6: Charset = /* @__PURE__ */ define({
  name: 'ISO-8859-6',
  maxBytes: 1,
  encoder: () => singleByte(tables.iso8859_6),
})

/**
 * ISO-8859-7.
 *
 * @example
 * ```ts
 * import * as Charset from '@portable/charset'
 * import { iso8859_7 } from '@portable/charset/single-byte'
 *
 * Charset.encode('ΰ', iso8859_7) // Uint8Array [0xe0]
 * ```
 */
export const iso8859_7: Charset = /* @__PURE__ */ define({
  name: 'ISO-8859-7',
  maxBytes: 1,
  encoder: () => singleByte(tables.iso8859_7),
})

/**
 * ISO-8859-8.
 *
 * @example
 * ```ts
 * import * as Charset from '@portable/charset'
 * import { iso8859_8 } from '@portable/charset/single-byte'
 *
 * Charset.encode('א', iso8859_8) // Uint8Array [0xe0]
 * ```
 */
export const iso8859_8: Charset = /* @__PURE__ */ define({
  name: 'ISO-8859-8',
  maxBytes: 1,
  encoder: () => singleByte(tables.iso8859_8),
})

/**
 * ISO-8859-8-I. The same bytes as ISO-8859-8, but the name tells a reader the text is in logical
 * order.
 *
 * @example
 * ```ts
 * import * as Charset from '@portable/charset'
 * import { iso8859_8i } from '@portable/charset/single-byte'
 *
 * Charset.encode('א', iso8859_8i) // Uint8Array [0xe0]
 * ```
 */
export const iso8859_8i: Charset = /* @__PURE__ */ define({
  name: 'ISO-8859-8-I',
  maxBytes: 1,
  encoder: () => singleByte(tables.iso8859_8),
})

/**
 * ISO-8859-10.
 *
 * @example
 * ```ts
 * import * as Charset from '@portable/charset'
 * import { iso8859_10 } from '@portable/charset/single-byte'
 *
 * Charset.encode('ā', iso8859_10) // Uint8Array [0xe0]
 * ```
 */
export const iso8859_10: Charset = /* @__PURE__ */ define({
  name: 'ISO-8859-10',
  maxBytes: 1,
  encoder: () => singleByte(tables.iso8859_10),
})

/**
 * ISO-8859-13.
 *
 * @example
 * ```ts
 * import * as Charset from '@portable/charset'
 * import { iso8859_13 } from '@portable/charset/single-byte'
 *
 * Charset.encode('ą', iso8859_13) // Uint8Array [0xe0]
 * ```
 */
export const iso8859_13: Charset = /* @__PURE__ */ define({
  name: 'ISO-8859-13',
  maxBytes: 1,
  encoder: () => singleByte(tables.iso8859_13),
})

/**
 * ISO-8859-14.
 *
 * @example
 * ```ts
 * import * as Charset from '@portable/charset'
 * import { iso8859_14 } from '@portable/charset/single-byte'
 *
 * Charset.encode('à', iso8859_14) // Uint8Array [0xe0]
 * ```
 */
export const iso8859_14: Charset = /* @__PURE__ */ define({
  name: 'ISO-8859-14',
  maxBytes: 1,
  encoder: () => singleByte(tables.iso8859_14),
})

/**
 * ISO-8859-15.
 *
 * @example
 * ```ts
 * import * as Charset from '@portable/charset'
 * import { iso8859_15 } from '@portable/charset/single-byte'
 *
 * Charset.encode('à', iso8859_15) // Uint8Array [0xe0]
 * ```
 */
export const iso8859_15: Charset = /* @__PURE__ */ define({
  name: 'ISO-8859-15',
  maxBytes: 1,
  encoder: () => singleByte(tables.iso8859_15),
})

/**
 * ISO-8859-16.
 *
 * @example
 * ```ts
 * import * as Charset from '@portable/charset'
 * import { iso8859_16 } from '@portable/charset/single-byte'
 *
 * Charset.encode('à', iso8859_16) // Uint8Array [0xe0]
 * ```
 */
export const iso8859_16: Charset = /* @__PURE__ */ define({
  name: 'ISO-8859-16',
  maxBytes: 1,
  encoder: () => singleByte(tables.iso8859_16),
})

/**
 * KOI8-R.
 *
 * @example
 * ```ts
 * import * as Charset from '@portable/charset'
 * import { koi8R } from '@portable/charset/single-byte'
 *
 * Charset.encode('Ю', koi8R) // Uint8Array [0xe0]
 * ```
 */
export const koi8R: Charset = /* @__PURE__ */ define({
  name: 'KOI8-R',
  maxBytes: 1,
  encoder: () => singleByte(tables.koi8R),
})

/**
 * KOI8-U.
 *
 * @example
 * ```ts
 * import * as Charset from '@portable/charset'
 * import { koi8U } from '@portable/charset/single-byte'
 *
 * Charset.encode('Ю', koi8U) // Uint8Array [0xe0]
 * ```
 */
export const koi8U: Charset = /* @__PURE__ */ define({
  name: 'KOI8-U',
  maxBytes: 1,
  encoder: () => singleByte(tables.koi8U),
})

/**
 * macintosh.
 *
 * @example
 * ```ts
 * import * as Charset from '@portable/charset'
 * import { macintosh } from '@portable/charset/single-byte'
 *
 * Charset.encode('‡', macintosh) // Uint8Array [0xe0]
 * ```
 */
export const macintosh: Charset = /* @__PURE__ */ define({
  name: 'macintosh',
  maxBytes: 1,
  encoder: () => singleByte(tables.macintosh),
})

/**
 * windows-874.
 *
 * @example
 * ```ts
 * import * as Charset from '@portable/charset'
 * import { windows874 } from '@portable/charset/single-byte'
 *
 * Charset.encode('เ', windows874) // Uint8Array [0xe0]
 * ```
 */
export const windows874: Charset = /* @__PURE__ */ define({
  name: 'windows-874',
  maxBytes: 1,
  encoder: () => singleByte(tables.windows874),
})

/**
 * windows-1250.
 *
 * @example
 * ```ts
 * import * as Charset from '@portable/charset'
 * import { windows1250 } from '@portable/charset/single-byte'
 *
 * Charset.encode('ŕ', windows1250) // Uint8Array [0xe0]
 * ```
 */
export const windows1250: Charset = /* @__PURE__ */ define({
  name: 'windows-1250',
  maxBytes: 1,
  encoder: () => singleByte(tables.windows1250),
})

/**
 * windows-1251.
 *
 * @example
 * ```ts
 * import * as Charset from '@portable/charset'
 * import { windows1251 } from '@portable/charset/single-byte'
 *
 * Charset.encode('а', windows1251) // Uint8Array [0xe0]
 * ```
 */
export const windows1251: Charset = /* @__PURE__ */ define({
  name: 'windows-1251',
  maxBytes: 1,
  encoder: () => singleByte(tables.windows1251),
})

/**
 * windows-1252.
 *
 * @example
 * ```ts
 * import * as Charset from '@portable/charset'
 * import { windows1252 } from '@portable/charset/single-byte'
 *
 * Charset.encode('à', windows1252) // Uint8Array [0xe0]
 * ```
 */
export const windows1252: Charset = /* @__PURE__ */ define({
  name: 'windows-1252',
  maxBytes: 1,
  encoder: () => singleByte(tables.windows1252),
})

/**
 * windows-1253.
 *
 * @example
 * ```ts
 * import * as Charset from '@portable/charset'
 * import { windows1253 } from '@portable/charset/single-byte'
 *
 * Charset.encode('ΰ', windows1253) // Uint8Array [0xe0]
 * ```
 */
export const windows1253: Charset = /* @__PURE__ */ define({
  name: 'windows-1253',
  maxBytes: 1,
  encoder: () => singleByte(tables.windows1253),
})

/**
 * windows-1254.
 *
 * @example
 * ```ts
 * import * as Charset from '@portable/charset'
 * import { windows1254 } from '@portable/charset/single-byte'
 *
 * Charset.encode('à', windows1254) // Uint8Array [0xe0]
 * ```
 */
export const windows1254: Charset = /* @__PURE__ */ define({
  name: 'windows-1254',
  maxBytes: 1,
  encoder: () => singleByte(tables.windows1254),
})

/**
 * windows-1255.
 *
 * @example
 * ```ts
 * import * as Charset from '@portable/charset'
 * import { windows1255 } from '@portable/charset/single-byte'
 *
 * Charset.encode('א', windows1255) // Uint8Array [0xe0]
 * ```
 */
export const windows1255: Charset = /* @__PURE__ */ define({
  name: 'windows-1255',
  maxBytes: 1,
  encoder: () => singleByte(tables.windows1255),
})

/**
 * windows-1256.
 *
 * @example
 * ```ts
 * import * as Charset from '@portable/charset'
 * import { windows1256 } from '@portable/charset/single-byte'
 *
 * Charset.encode('à', windows1256) // Uint8Array [0xe0]
 * ```
 */
export const windows1256: Charset = /* @__PURE__ */ define({
  name: 'windows-1256',
  maxBytes: 1,
  encoder: () => singleByte(tables.windows1256),
})

/**
 * windows-1257.
 *
 * @example
 * ```ts
 * import * as Charset from '@portable/charset'
 * import { windows1257 } from '@portable/charset/single-byte'
 *
 * Charset.encode('ą', windows1257) // Uint8Array [0xe0]
 * ```
 */
export const windows1257: Charset = /* @__PURE__ */ define({
  name: 'windows-1257',
  maxBytes: 1,
  encoder: () => singleByte(tables.windows1257),
})

/**
 * windows-1258.
 *
 * @example
 * ```ts
 * import * as Charset from '@portable/charset'
 * import { windows1258 } from '@portable/charset/single-byte'
 *
 * Charset.encode('à', windows1258) // Uint8Array [0xe0]
 * ```
 */
export const windows1258: Charset = /* @__PURE__ */ define({
  name: 'windows-1258',
  maxBytes: 1,
  encoder: () => singleByte(tables.windows1258),
})

/**
 * x-mac-cyrillic.
 *
 * @example
 * ```ts
 * import * as Charset from '@portable/charset'
 * import { xMacCyrillic } from '@portable/charset/single-byte'
 *
 * Charset.encode('а', xMacCyrillic) // Uint8Array [0xe0]
 * ```
 */
export const xMacCyrillic: Charset = /* @__PURE__ */ define({
  name: 'x-mac-cyrillic',
  maxBytes: 1,
  encoder: () => singleByte(tables.xMacCyrillic),
})

/**
 * x-user-defined, which maps bytes 0x80 to 0xFF to the private use code points U+F780 to U+F7FF.
 *
 * @example
 * ```ts
 * import * as Charset from '@portable/charset'
 * import { xUserDefined } from '@portable/charset/single-byte'
 *
 * Charset.encode('\uf7ff', xUserDefined) // Uint8Array [0xff]
 * ```
 */
export const xUserDefined: Charset = /* @__PURE__ */ define({
  name: 'x-user-defined',
  maxBytes: 1,
  encoder: () => ({
    table: asciiTable(),
    write(codePoint, out) {
      if (codePoint < 0xf780 || codePoint > 0xf7ff) return codePoint
      out.bytes[out.length++] = codePoint - 0xf700
      return -1
    },
  }),
})
