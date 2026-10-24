import * as Idna from '@portable/idna'
import { fc, fuzz, outcome } from '@portable/fuzz'
import { expect, test } from 'vite-plus/test'

// idna.oracle.test.ts compares 20,000 random domains with tr46. For any input, these
// properties check that the functions throw only InvalidInputError and that converting a result
// back returns the same domain.

const errors = [Idna.InvalidInputError]

const domainLike = fc.string({
  unit: fc.oneof(
    { weight: 8, arbitrary: fc.constantFrom('a', 'b', 'x', 'n', 'z', '0', '7') },
    { weight: 4, arbitrary: fc.constantFrom('.', '-', 'xn--', '。', '．') },
    {
      weight: 3,
      arbitrary: fc.constantFrom('ü', 'Ü', 'ß', 'ς', 'é', 'ﬀ', 'Ａ', 'ı', '日'),
    },
    {
      weight: 1,
      arbitrary: fc.constantFrom(
        '_',
        ...[0x200d, 0x200c, 0xad, 0x640, 0x5d0, 0x663].map((code) => String.fromCodePoint(code)),
      ),
    },
  ),
  maxLength: 30,
})

const anyText = fc.string({ unit: 'grapheme', maxLength: 30 })

test('toAscii and toUnicode throw only InvalidInputError, and their results convert back', () => {
  fuzz(
    fc.property(fc.oneof(domainLike, anyText), fc.boolean(), (domain, strict) => {
      const ascii = outcome(errors, () => Idna.toAscii(domain, { strict }))
      const unicode = outcome(errors, () => Idna.toUnicode(domain, { strict }))
      if (!('value' in ascii)) return
      expect(ascii.value).toMatch(/^[\0-\x7f]*$/)
      expect(Idna.toAscii(ascii.value, { strict })).toBe(ascii.value)
      const back = 'value' in unicode ? Idna.toAscii(unicode.value, { strict }) : ascii.value
      expect(back).toBe(ascii.value)
    }),
  )
})

test('toUnicode throws only InvalidInputError for any xn-- label', () => {
  fuzz(
    fc.property(
      fc.string({ unit: fc.constantFrom('a', 'z', '0', '9', '-'), maxLength: 20 }),
      (label) => {
        outcome(errors, () => Idna.toUnicode(`xn--${label}.example`))
        outcome(errors, () => Idna.toAscii(`xn--${label}.example`, { strict: true }))
      },
    ),
  )
})
