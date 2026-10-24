import * as Jsonl from '@portable/jsonl'
import { cuts, fc, fuzz, mutated, outcomeAsync, split } from '@portable/fuzz'
import { expect, test } from 'vite-plus/test'
import { decode, encode, encodeUtf8 } from './utils.js'

/** JSON values as JSON.parse returns them, so without -0, which JSON.stringify writes as 0. */
const values = fc.array(
  fc.jsonValue().map((value) => JSON.parse(JSON.stringify(value)) as unknown),
  { maxLength: 8 },
)

const jsonlLike = fc.string({
  unit: fc.oneof(
    { weight: 6, arbitrary: fc.constantFrom('{', '}', '[', ']', '"', ':', ',', '1', 'a', 'null') },
    { weight: 3, arbitrary: fc.constantFrom('\n', '\r\n', ' ', '\t', '\\', '\u2028') },
    { weight: 1, arbitrary: fc.string({ unit: 'grapheme', minLength: 1, maxLength: 1 }) },
  ),
  maxLength: 80,
})

/** Each line that isn't blank, parsed on its own. Blank lines are skipped. */
function expected(text: string, invalid: 'error' | 'skip'): unknown[] {
  const out: unknown[] = []
  for (const line of text.split('\n')) {
    if (line.trim() === '') {
      continue
    }
    try {
      out.push(JSON.parse(line))
    } catch (error) {
      if (invalid === 'error') {
        throw new Jsonl.InvalidInputError('', { cause: error })
      }
    }
  }
  return out
}

test('decodes what EncoderStream writes, however the bytes are chunked', async () => {
  await fuzz(
    fc.asyncProperty(values, cuts, async (values, at) => {
      expect(await decode(split(encodeUtf8(await encode(values)), at))).toEqual(values)
    }),
  )
})

test('parses each line like JSON.parse, however the text is chunked', async () => {
  await fuzz(
    fc.asyncProperty(
      jsonlLike,
      cuts,
      fc.constantFrom<'error' | 'skip'>('error', 'skip'),
      async (text, at, invalid) => {
        const errors = [Jsonl.InvalidInputError]
        expect(await outcomeAsync(errors, () => decode(split(text, at), { invalid }))).toEqual(
          await outcomeAsync(errors, async () => expected(text, invalid)),
        )
      },
    ),
  )
})

test('rejects mutated JSON Lines only with InvalidInputError', async () => {
  const original = encodeUtf8(
    await encode([{ a: [1, 'two', null] }, 'three', { four: { five: 5 } }]),
  )
  await fuzz(
    fc.asyncProperty(mutated(original), cuts, async (bytes, at) => {
      await outcomeAsync([Jsonl.InvalidInputError], () => decode(split(bytes, at)))
    }),
  )
})
