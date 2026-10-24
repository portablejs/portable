import * as Charset from '@portable/charset'
import { cuts, fc, fuzz, outcome, outcomeAsync, split } from '@portable/fuzz'
import { beforeAll, describe, expect, test } from 'vite-plus/test'
import { encodeStream } from './utils.js'

const names = [
  'UTF-8',
  'IBM866',
  'ISO-8859-2',
  'ISO-8859-8-I',
  'KOI8-U',
  'macintosh',
  'windows-874',
  'windows-1252',
  'windows-1258',
  'x-mac-cyrillic',
  'x-user-defined',
  'GBK',
  'gb18030',
  'Big5',
  'EUC-JP',
  'ISO-2022-JP',
  'Shift_JIS',
  'EUC-KR',
  'UTF-16BE',
  'UTF-16LE',
] satisfies readonly Charset.Name[]
const charsets: Charset.Charset[] = []
beforeAll(async () => {
  for (const name of names) charsets.push(await Charset.load(name))
})
const charset = fc.nat({ max: names.length - 1 }).map((i) => charsets[i]!)

// Characters from every script the charsets cover, the escapes ISO-2022-JP uses, and surrogates
// that may be split or left alone.
const text = fc.string({
  unit: fc.oneof(
    fc.constantFrom('a', '~', '\\', '\x1b', '\x0e', '\x0f', '\x7f', '\x80', 'é', 'ő', 'Ж', 'א'),
    fc.constantFrom('ｱ', 'ﾟ', '¥', '‾', '−', '日', '本', '한', '中', '€', '😀', '\u{20000}'),
    fc.constantFrom('\ud83d', '\ude00', '\ue78d', '\ufffd', '\ufeff'),
    fc.string({ unit: 'binary', minLength: 1, maxLength: 1 }),
  ),
  maxLength: 40,
})

const unmappable = fc.constantFrom<Charset.encode.Options['unmappable']>(
  undefined,
  'replace',
  'html',
  'error',
  (codePoint) => `[${codePoint}]`,
)
const options = fc.record({ bom: fc.boolean(), unmappable }, { requiredKeys: [] })
const errors = [Charset.UnsupportedError]

describe('encode', () => {
  test("throws only UnsupportedError, and only with unmappable: 'error'", () => {
    fuzz(
      fc.property(text, charset, options, (text, charset, options) => {
        const result = outcome(errors, () => Charset.encode(text, charset, options))
        expect(options.unmappable === 'error' || 'value' in result).toBe(true)
      }),
    )
  })

  test('encodes UTF-8 bytes the same as the text they hold', () => {
    fuzz(
      fc.property(text, charset, options, (text, charset, options) => {
        const bytes = new TextEncoder().encode(text)
        const wellFormed = new TextDecoder().decode(bytes)
        expect(outcome(errors, () => Charset.encode(bytes, charset, options))).toEqual(
          outcome(errors, () => Charset.encode(wellFormed, charset, options)),
        )
      }),
    )
  })
})

describe('EncoderStream', () => {
  test('writes what encode writes, however the text is chunked', async () => {
    await fuzz(
      fc.asyncProperty(text, cuts, charset, options, async (text, at, charset, options) => {
        expect(
          await outcomeAsync(errors, () => encodeStream(split(text, at), charset, options)),
        ).toEqual(outcome(errors, () => Charset.encode(text, charset, options)))
      }),
    )
  })

  // Node 24's streaming TextDecoder drops a U+FEFF that follows a chunk it returned nothing for,
  // so this test leaves U+FEFF out.
  test('writes what encode writes, however the UTF-8 bytes are chunked', async () => {
    const noBom = text.filter((text) => !text.includes('\ufeff'))
    await fuzz(
      fc.asyncProperty(noBom, cuts, charset, options, async (text, at, charset, options) => {
        const bytes = new TextEncoder().encode(text)
        expect(
          await outcomeAsync(errors, () => encodeStream(split(bytes, at), charset, options)),
        ).toEqual(outcome(errors, () => Charset.encode(bytes, charset, options)))
      }),
    )
  })
})

describe('labels', () => {
  const known = [
    ...names,
    'utf8',
    'unicode-1-1-utf-8',
    'latin1',
    'ascii',
    'iso_8859-1:1987',
    'iso-ir-100',
    'l2',
    'cp1250',
    'x-cp1251',
    'sjis',
    'ms_kanji',
    'csshiftjis',
    'gb2312',
    'chinese',
    'x-gbk',
    'big5-hkscs',
    'cseuckr',
    'korean',
    'csiso2022jp',
    'iso-2022-kr',
    'unicodefffe',
    'utf-16',
    'logical',
    'visual',
  ]
  const label = fc
    .tuple(
      fc.constantFrom(...known),
      fc.array(fc.boolean(), { maxLength: 20 }),
      fc.constantFrom('', ' ', '\t', '\n\f\r', '\u00a0', '\0'),
      fc.constantFrom('', ' ', '\r\n', '\v'),
    )
    .map(
      ([label, upper, before, after]) =>
        before +
        Array.from(label, (char, i) => (upper[i] ? char.toUpperCase() : char)).join('') +
        after,
    )

  test('normalizeLabel agrees with TextDecoder on every label TextDecoder accepts', () => {
    fuzz(
      fc.property(label, (label) => {
        let encoding: string | undefined
        try {
          encoding = new TextDecoder(label).encoding
        } catch {
          encoding = undefined
        }
        const normalized = Charset.normalizeLabel(label)?.toLowerCase()
        expect(encoding === undefined || normalized === encoding).toBe(true)
      }),
    )
  })

  test('load throws only UnsupportedError, for any label', async () => {
    await fuzz(
      fc.asyncProperty(fc.oneof(label, fc.string()), async (label) => {
        const result = await outcomeAsync(errors, () => Charset.load(label))
        expect('value' in result).toBe(Charset.normalizeLabel(label) !== undefined)
      }),
    )
  })
})
