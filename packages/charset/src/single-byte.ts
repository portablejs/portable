import type { Charset, Definition, Encoder } from './Charset.js'
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
export const ibm866 = {
  name: 'IBM866',
  maxBytes: 1,
  encoder: () => singleByte(tables.ibm866),
} satisfies Definition as unknown as Charset

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
export const iso8859_2 = {
  name: 'ISO-8859-2',
  maxBytes: 1,
  encoder: () => singleByte(tables.iso8859_2),
} satisfies Definition as unknown as Charset

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
export const iso8859_3 = {
  name: 'ISO-8859-3',
  maxBytes: 1,
  encoder: () => singleByte(tables.iso8859_3),
} satisfies Definition as unknown as Charset

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
export const iso8859_4 = {
  name: 'ISO-8859-4',
  maxBytes: 1,
  encoder: () => singleByte(tables.iso8859_4),
} satisfies Definition as unknown as Charset

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
export const iso8859_5 = {
  name: 'ISO-8859-5',
  maxBytes: 1,
  encoder: () => singleByte(tables.iso8859_5),
} satisfies Definition as unknown as Charset

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
export const iso8859_6 = {
  name: 'ISO-8859-6',
  maxBytes: 1,
  encoder: () => singleByte(tables.iso8859_6),
} satisfies Definition as unknown as Charset

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
export const iso8859_7 = {
  name: 'ISO-8859-7',
  maxBytes: 1,
  encoder: () => singleByte(tables.iso8859_7),
} satisfies Definition as unknown as Charset

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
export const iso8859_8 = {
  name: 'ISO-8859-8',
  maxBytes: 1,
  encoder: () => singleByte(tables.iso8859_8),
} satisfies Definition as unknown as Charset

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
export const iso8859_8i = {
  name: 'ISO-8859-8-I',
  maxBytes: 1,
  encoder: () => singleByte(tables.iso8859_8),
} satisfies Definition as unknown as Charset

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
export const iso8859_10 = {
  name: 'ISO-8859-10',
  maxBytes: 1,
  encoder: () => singleByte(tables.iso8859_10),
} satisfies Definition as unknown as Charset

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
export const iso8859_13 = {
  name: 'ISO-8859-13',
  maxBytes: 1,
  encoder: () => singleByte(tables.iso8859_13),
} satisfies Definition as unknown as Charset

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
export const iso8859_14 = {
  name: 'ISO-8859-14',
  maxBytes: 1,
  encoder: () => singleByte(tables.iso8859_14),
} satisfies Definition as unknown as Charset

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
export const iso8859_15 = {
  name: 'ISO-8859-15',
  maxBytes: 1,
  encoder: () => singleByte(tables.iso8859_15),
} satisfies Definition as unknown as Charset

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
export const iso8859_16 = {
  name: 'ISO-8859-16',
  maxBytes: 1,
  encoder: () => singleByte(tables.iso8859_16),
} satisfies Definition as unknown as Charset

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
export const koi8R = {
  name: 'KOI8-R',
  maxBytes: 1,
  encoder: () => singleByte(tables.koi8R),
} satisfies Definition as unknown as Charset

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
export const koi8U = {
  name: 'KOI8-U',
  maxBytes: 1,
  encoder: () => singleByte(tables.koi8U),
} satisfies Definition as unknown as Charset

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
export const macintosh = {
  name: 'macintosh',
  maxBytes: 1,
  encoder: () => singleByte(tables.macintosh),
} satisfies Definition as unknown as Charset

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
export const windows874 = {
  name: 'windows-874',
  maxBytes: 1,
  encoder: () => singleByte(tables.windows874),
} satisfies Definition as unknown as Charset

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
export const windows1250 = {
  name: 'windows-1250',
  maxBytes: 1,
  encoder: () => singleByte(tables.windows1250),
} satisfies Definition as unknown as Charset

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
export const windows1251 = {
  name: 'windows-1251',
  maxBytes: 1,
  encoder: () => singleByte(tables.windows1251),
} satisfies Definition as unknown as Charset

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
export const windows1252 = {
  name: 'windows-1252',
  maxBytes: 1,
  encoder: () => singleByte(tables.windows1252),
} satisfies Definition as unknown as Charset

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
export const windows1253 = {
  name: 'windows-1253',
  maxBytes: 1,
  encoder: () => singleByte(tables.windows1253),
} satisfies Definition as unknown as Charset

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
export const windows1254 = {
  name: 'windows-1254',
  maxBytes: 1,
  encoder: () => singleByte(tables.windows1254),
} satisfies Definition as unknown as Charset

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
export const windows1255 = {
  name: 'windows-1255',
  maxBytes: 1,
  encoder: () => singleByte(tables.windows1255),
} satisfies Definition as unknown as Charset

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
export const windows1256 = {
  name: 'windows-1256',
  maxBytes: 1,
  encoder: () => singleByte(tables.windows1256),
} satisfies Definition as unknown as Charset

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
export const windows1257 = {
  name: 'windows-1257',
  maxBytes: 1,
  encoder: () => singleByte(tables.windows1257),
} satisfies Definition as unknown as Charset

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
export const windows1258 = {
  name: 'windows-1258',
  maxBytes: 1,
  encoder: () => singleByte(tables.windows1258),
} satisfies Definition as unknown as Charset

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
export const xMacCyrillic = {
  name: 'x-mac-cyrillic',
  maxBytes: 1,
  encoder: () => singleByte(tables.xMacCyrillic),
} satisfies Definition as unknown as Charset

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
export const xUserDefined = {
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
} satisfies Definition as unknown as Charset
