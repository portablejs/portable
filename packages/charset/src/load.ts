import type { Charset, Name } from './Charset.js'
import { UnsupportedError } from './errors.js'
import { normalizeLabel } from './labels.js'
import { utf8 } from './utf-8.js'

const singleByte = () => import('./single-byte.js')

const loaders: Record<Name, () => Promise<Charset>> = {
  'UTF-8': async () => utf8,
  IBM866: async () => (await singleByte()).ibm866,
  'ISO-8859-2': async () => (await singleByte()).iso8859_2,
  'ISO-8859-3': async () => (await singleByte()).iso8859_3,
  'ISO-8859-4': async () => (await singleByte()).iso8859_4,
  'ISO-8859-5': async () => (await singleByte()).iso8859_5,
  'ISO-8859-6': async () => (await singleByte()).iso8859_6,
  'ISO-8859-7': async () => (await singleByte()).iso8859_7,
  'ISO-8859-8': async () => (await singleByte()).iso8859_8,
  'ISO-8859-8-I': async () => (await singleByte()).iso8859_8i,
  'ISO-8859-10': async () => (await singleByte()).iso8859_10,
  'ISO-8859-13': async () => (await singleByte()).iso8859_13,
  'ISO-8859-14': async () => (await singleByte()).iso8859_14,
  'ISO-8859-15': async () => (await singleByte()).iso8859_15,
  'ISO-8859-16': async () => (await singleByte()).iso8859_16,
  'KOI8-R': async () => (await singleByte()).koi8R,
  'KOI8-U': async () => (await singleByte()).koi8U,
  macintosh: async () => (await singleByte()).macintosh,
  'windows-874': async () => (await singleByte()).windows874,
  'windows-1250': async () => (await singleByte()).windows1250,
  'windows-1251': async () => (await singleByte()).windows1251,
  'windows-1252': async () => (await singleByte()).windows1252,
  'windows-1253': async () => (await singleByte()).windows1253,
  'windows-1254': async () => (await singleByte()).windows1254,
  'windows-1255': async () => (await singleByte()).windows1255,
  'windows-1256': async () => (await singleByte()).windows1256,
  'windows-1257': async () => (await singleByte()).windows1257,
  'windows-1258': async () => (await singleByte()).windows1258,
  'x-mac-cyrillic': async () => (await singleByte()).xMacCyrillic,
  'x-user-defined': async () => (await singleByte()).xUserDefined,
  GBK: async () => (await import('./gbk.js')).gbk,
  gb18030: async () => (await import('./gbk.js')).gb18030,
  Big5: async () => (await import('./big5.js')).big5,
  'EUC-JP': async () => (await import('./euc-jp.js')).eucJp,
  'ISO-2022-JP': async () => (await import('./iso-2022-jp.js')).iso2022Jp,
  Shift_JIS: async () => (await import('./shift_jis.js')).shiftJis,
  'EUC-KR': async () => (await import('./euc-kr.js')).eucKr,
  'UTF-16BE': async () => (await import('./utf-16.js')).utf16be,
  'UTF-16LE': async () => (await import('./utf-16.js')).utf16le,
}

/**
 * Loads the charset a label names, for when the charset is only known at runtime, such as from
 * a `Content-Type` header. Each family's tables are imported on first use, so bundlers split
 * them into chunks that load only when needed. Throws `UnsupportedError` for a label
 * `normalizeLabel` doesn't know.
 *
 * @example
 * ```ts
 * import * as Charset from '@portable/charset'
 *
 * Charset.encode('日本', await Charset.load('windows-31j')) // Uint8Array [0x93, 0xfa, 0x96, 0x7b]
 * ```
 */
export async function load(label: string): Promise<Charset> {
  const name = normalizeLabel(label)
  if (name === undefined) throw new UnsupportedError(`No encoder for charset "${label}".`)
  return loaders[name]()
}
