import * as Csv from '@portable/csv'
import {
  byteForm,
  cuts,
  fc,
  fuzz,
  mutated,
  outcome,
  outcomeAsync,
  split,
  toByteForm,
} from '@portable/fuzz'
import { fromIterable, toArray } from '@portable/streams'
import { expect, test } from 'vite-plus/test'
import { bom, encodeUtf8 } from './utils.js'

const errors = [Csv.InvalidInputError, Csv.TruncatedError, Csv.MaxLengthError]

const field = fc.string({
  unit: fc.oneof(
    { weight: 6, arbitrary: fc.constantFrom('a', 'b', ' ', '1') },
    { weight: 3, arbitrary: fc.constantFrom(',', '"', '\n', '\r', '\r\n', '\t', ';', '=') },
    { weight: 1, arbitrary: fc.string({ unit: 'grapheme', minLength: 1, maxLength: 1 }) },
  ),
  maxLength: 12,
})

const csvLike = fc.string({
  unit: fc.oneof(
    { weight: 6, arbitrary: fc.constantFrom('a', '1', ' ', ',', '"', '""') },
    { weight: 3, arbitrary: fc.constantFrom('\n', '\r\n', '\r', '\t', bom) },
    { weight: 1, arbitrary: fc.string({ unit: 'grapheme', minLength: 1, maxLength: 1 }) },
  ),
  maxLength: 80,
})

const options = fc.record(
  {
    delimiter: fc.constantFrom(',', ';', '\t'),
    quote: fc.constantFrom<string | false>('"', "'", false),
    relaxColumnCount: fc.boolean(),
    skipEmpty: fc.boolean(),
    maxLength: fc.integer({ min: 0, max: 40 }),
  },
  { requiredKeys: [] },
)

async function decodeStream(
  chunks: readonly (string | Uint8Array)[],
  options: Csv.DecoderStream.Options,
): Promise<string[][]> {
  return (await toArray(
    fromIterable(chunks).pipeThrough(new Csv.DecoderStream(options)),
  )) as string[][]
}

test('decodes what encode writes', () => {
  fuzz(
    fc.property(
      fc
        .integer({ min: 1, max: 4 })
        .chain((width) =>
          fc.array(fc.array(field, { minLength: width, maxLength: width }), { maxLength: 6 }),
        ),
      fc.constantFrom(',', ';', '\t'),
      fc.constantFrom<'\r\n' | '\n'>('\r\n', '\n'),
      (rows, delimiter, newline) => {
        const text = Csv.encode(rows, { delimiter, newline })
        expect(Csv.decode(text, { delimiter, skipEmpty: false })).toEqual(rows)
      },
    ),
  )
})

test('decode and DecoderStream agree however the input is chunked', async () => {
  await fuzz(
    fc.asyncProperty(csvLike, cuts, options, fc.boolean(), async (text, at, options, bytes) => {
      const input = bytes ? encodeUtf8(text) : text
      const whole = outcome(errors, () => Csv.decode(input, options))
      const streamed = await outcomeAsync(errors, () => decodeStream(split(input, at), options))
      expect(streamed).toEqual(whole)
    }),
  )
})

test('rejects mutated CSV only with documented errors', () => {
  const original = encodeUtf8(
    Csv.encode([
      ['name', 'note'],
      ['Ada', 'said "hi", left'],
      ['Grace', 'line\r\nbreak'],
    ]),
  )
  fuzz(
    fc.property(mutated(original), (bytes) => {
      outcome(errors, () => Csv.decode(bytes))
    }),
  )
})

test('decode reads every byte form like a Uint8Array', () => {
  fuzz(
    fc.property(fc.uint8Array({ maxLength: 64 }), byteForm, (bytes, form) => {
      const errors = [Csv.InvalidInputError, Csv.TruncatedError]
      expect(outcome(errors, () => Csv.decode(toByteForm(bytes, form)))).toEqual(
        outcome(errors, () => Csv.decode(bytes)),
      )
    }),
  )
})
