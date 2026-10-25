import type { Name } from './Charset.js';
import { labels } from './tables/labels.js';

/**
 * Returns the WHATWG Encoding Standard name for a charset label, or `undefined` for an unknown
 * label. Accepts every WHATWG label and every iconv-lite name for the same charsets. Leading
 * and trailing ASCII whitespace, case, punctuation and a trailing year such as `:1988` are
 * ignored. A label with any other character, such as NUL or a no-break space, returns
 * `undefined`.
 *
 * Where iconv-lite disagrees with WHATWG, the WHATWG mapping is used: `latin1`, `ascii` and
 * `iso-8859-1` are `windows-1252`, and `gb2312` is `GBK`. Labels mapped to the replacement
 * encoding, such as `iso-2022-kr`, return `undefined`, because the replacement encoding has no
 * encoder. This package can encode a label exactly when `normalizeLabel` returns a name.
 *
 * @example
 * ```ts
 * import * as Charset from '@portable/charset';
 *
 * Charset.normalizeLabel('sjis'); // 'Shift_JIS'
 * Charset.normalizeLabel(' Latin1 '); // 'windows-1252'
 * Charset.normalizeLabel('ISO_8859-5:1988'); // 'ISO-8859-5'
 * Charset.normalizeLabel('cp437'); // undefined
 * Charset.normalizeLabel('iso-2022-kr'); // undefined
 * ```
 */
export function normalizeLabel(label: string): Name | undefined {
  const trimmed = label.replace(/^[\t\n\f\r ]+|[\t\n\f\r ]+$/g, '');
  if (!/^[\x20-\x7e]+$/.test(trimmed)) {
    return undefined;
  }
  const key = trimmed.toLowerCase().replace(/:\d{4}$|[^0-9a-z]/g, '');
  const name = Object.hasOwn(labels, key) ? labels[key] : undefined;
  return name === 'replacement' ? undefined : name;
}
