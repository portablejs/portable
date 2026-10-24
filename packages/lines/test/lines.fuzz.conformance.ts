import { cuts, fc, fuzz, outcomeAsync, split as splitAt } from '@portable/fuzz'
import * as Lines from '@portable/lines'
import { expect, test } from 'vite-plus/test'
import { encode, split, unicodeLineBreak } from './utils.js'

const text = fc.string({
  unit: fc.constantFrom('a', 'b', '\r', '\n', '\r\n', '|', ';', '\u2028', '\x85', 'é', '😀'),
  maxLength: 60,
})

const separators = [undefined, '\n', '\r\n', '||', /;|\|/, unicodeLineBreak] satisfies readonly (
  | Lines.Separator
  | undefined
)[]
const separator = fc.constantFrom(...separators)

function expected(input: string, options: Lines.DecoderStream.Options): string[] {
  const { separator = /\r?\n/, skipEmpty = false, maxLength = Infinity } = options
  const lines =
    typeof separator === 'string' ? input.split(separator) : input.split(separator as RegExp)
  if (lines.at(-1) === '') lines.pop()
  return lines.filter((line) => !(skipEmpty && line === '') && line.length <= maxLength)
}

const options = fc.record(
  { separator, skipEmpty: fc.boolean() },
  { requiredKeys: [] },
) as fc.Arbitrary<Lines.DecoderStream.Options>

test('splits text the same way however it is chunked', async () => {
  await fuzz(
    fc.asyncProperty(text, cuts, options, async (input, at, options) => {
      expect(await split(splitAt(input, at), options)).toEqual(expected(input, options))
    }),
  )
})

test('splits UTF-8 bytes the same way however they are chunked', async () => {
  await fuzz(
    fc.asyncProperty(text, cuts, options, async (input, at, options) => {
      expect(await split(splitAt(encode(input), at), options)).toEqual(expected(input, options))
    }),
  )
})

test("with overflow: 'skip', drops exactly the lines longer than maxLength", async () => {
  await fuzz(
    fc.asyncProperty(
      text,
      cuts,
      options,
      fc.nat({ max: 8 }),
      async (input, at, options, maxLength) => {
        const all = { ...options, maxLength, overflow: 'skip' as const }
        expect(await split(splitAt(input, at), all)).toEqual(expected(input, all))
      },
    ),
  )
})

test("with overflow: 'error', fails exactly when a line is longer than maxLength", async () => {
  await fuzz(
    fc.asyncProperty(
      text,
      cuts,
      options,
      fc.nat({ max: 8 }),
      async (input, at, options, maxLength) => {
        const lines = expected(input, options)
        const tooLong = lines.some((line) => line.length > maxLength)
        const result = outcomeAsync([Lines.MaxLengthError], () =>
          split(splitAt(input, at), { ...options, maxLength }),
        )
        expect(await result).toEqual(tooLong ? { error: Lines.MaxLengthError } : { value: lines })
      },
    ),
  )
})
