import { labels, type CharsetName } from './tables/labels.js'

/**
 * Returns the WHATWG Encoding Standard name for a charset label, or `undefined` for an unknown
 * label. Accepts every WHATWG label and every iconv-lite name for the same charsets. Leading
 * and trailing ASCII whitespace, case, punctuation and a trailing year such as `:1988` are
 * ignored. A label with any other character, such as NUL or a no-break space, is rejected.
 *
 * WHATWG labels win where iconv-lite disagrees: `latin1`, `ascii` and `iso-8859-1` are
 * `windows-1252`, and `gb2312` is `GBK`. A name that resolves to `replacement`, such as
 * `iso-2022-kr`, has no encoder.
 *
 * @example
 * ```ts
 * import * as Charset from '@portable/charset'
 *
 * Charset.normalizeLabel('sjis') // 'Shift_JIS'
 * Charset.normalizeLabel(' Latin1 ') // 'windows-1252'
 * Charset.normalizeLabel('ISO_8859-5:1988') // 'ISO-8859-5'
 * Charset.normalizeLabel('cp437') // undefined
 * ```
 */
export function normalizeLabel(label: string): CharsetName | undefined {
  const trimmed = label.replace(/^[\t\n\f\r ]+|[\t\n\f\r ]+$/g, '')
  if (!/^[\x20-\x7e]+$/.test(trimmed)) return undefined
  const key = trimmed.toLowerCase().replace(/:\d{4}$|[^0-9a-z]/g, '')
  return Object.hasOwn(labels, key) ? labels[key] : undefined
}

/**
 * Returns whether `load` and the subpath entries can encode the charset a label names.
 *
 * @example
 * ```ts
 * import * as Charset from '@portable/charset'
 *
 * Charset.isSupported('windows-31j') // true
 * Charset.isSupported('iso-2022-kr') // false, WHATWG maps it to the replacement encoding
 * ```
 */
export function isSupported(label: string): boolean {
  const name = normalizeLabel(label)
  return name !== undefined && name !== 'replacement'
}
