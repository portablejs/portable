import { parse as parseSync } from 'csv-parse/sync'
import { stringify } from 'csv-stringify/sync'
import * as Csv from '@portable/csv'
import { fc, fuzz, outcome } from '@portable/fuzz'
import { expect, test } from 'vite-plus/test'
import { bom } from './utils.js'

const csvParseOptions = {
  bom: true,
  record_delimiter: ['\r\n', '\n', '\r'],
  relax_quotes: true,
  skip_empty_lines: true,
}

const csvLike = fc.string({
  unit: fc.oneof(
    { weight: 6, arbitrary: fc.constantFrom('a', '1', ' ', ',', '"', '""') },
    { weight: 3, arbitrary: fc.constantFrom('\n', '\r\n', '\r', '\t', bom) },
    { weight: 1, arbitrary: fc.string({ unit: 'grapheme', minLength: 1, maxLength: 1 }) },
  ),
  maxLength: 80,
})

const field = fc.string({
  unit: fc.oneof(
    { weight: 6, arbitrary: fc.constantFrom('a', 'b', ' ', '1') },
    { weight: 3, arbitrary: fc.constantFrom(',', '"', '\n', '\r', '\r\n', '\t', ';', '=') },
    { weight: 1, arbitrary: fc.string({ unit: 'grapheme', minLength: 1, maxLength: 1 }) },
  ),
  maxLength: 12,
})

const rows = fc
  .integer({ min: 1, max: 4 })
  .chain((width) =>
    fc.array(fc.array(field, { minLength: width, maxLength: width }), { maxLength: 8 }),
  )

test('decode reads what csv-stringify writes as csv-parse does', () => {
  fuzz(
    fc.property(rows, (rows) => {
      const text = stringify(rows)
      expect(Csv.decode(text)).toEqual(parseSync(text, csvParseOptions))
    }),
  )
})

test('decode agrees with csv-parse on any input both accept', () => {
  fuzz(
    fc.property(csvLike, (text) => {
      // decode skips spaces and tabs after a closing quote, as csv-parse does only with `rtrim`.
      if (/"[ \t]/.test(text)) {
        return
      }
      const ours = outcome([Csv.InvalidInputError, Csv.TruncatedError], () => Csv.decode(text))
      let theirs: string[][]
      try {
        theirs = parseSync(text, csvParseOptions)
      } catch {
        return
      }
      if (!('value' in ours)) {
        return
      }
      expect(ours.value).toEqual(theirs)
    }),
  )
})

test('csv-parse reads what encode writes', () => {
  fuzz(
    fc.property(rows, (rows) => {
      expect(parseSync(Csv.encode(rows), { skip_empty_lines: false })).toEqual(rows)
    }),
  )
})
