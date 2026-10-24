import { toArray } from '@portable/streams'
import { describe, expect, test } from 'vite-plus/test'
import * as Csv from '@portable/csv'
import { decodeStream, encodeUtf8, randomChunks } from './utils.js'

function rows(count: number): string[][] {
  const words = ['', 'plain', 'a,b', 'say "hi"', 'two\r\nlines', 'lf\nonly', 'cr\ronly', 'ü🚀', ' ']
  return Array.from({ length: count }, (_, i) =>
    Array.from({ length: 5 }, (_, j) => `${words[(i * 7 + j * 3) % words.length]}${i}`),
  )
}

describe('DecoderStream', () => {
  const expected = rows(300)
  const text = Csv.encode(expected)

  for (const seed of [1, 2, 3, 4, 5]) {
    test(`gives the same rows for random byte chunks, seed ${seed}`, async () => {
      expect(await decodeStream(randomChunks(encodeUtf8(text), seed, 64))).toEqual(expected)
    })

    test(`gives the same rows for random text chunks, seed ${seed}`, async () => {
      expect(await decodeStream(randomChunks(text, seed, 8))).toEqual(expected)
    })
  }

  test('gives the same rows for LF line breaks in random chunks', async () => {
    const lf = Csv.encode(expected, { newline: '\n' })
    expect(await decodeStream(randomChunks(lf, 9, 5))).toEqual(expected)
  })

  test('accepts byte and text chunks in one stream', async () => {
    expect(await decodeStream([encodeUtf8('a,"b'), 'c",d\n', encodeUtf8('e,f,g')])).toEqual([
      ['a', 'bc', 'd'],
      ['e', 'f', 'g'],
    ])
  })

  test('fails with MaxLengthError before reading all of an endless quoted field', async () => {
    let pulls = 0
    const source = new ReadableStream<string>({
      start: (controller) => controller.enqueue('a,"'),
      pull: (controller) => {
        pulls++
        controller.enqueue('x'.repeat(1024))
      },
    })
    const rows = source.pipeThrough(new Csv.DecoderStream({ maxLength: 10_000 }))
    await expect(toArray(rows)).rejects.toThrow(Csv.MaxLengthError)
    expect(pulls).toBeLessThan(20)
  })

  test('cancelling the output cancels the source', async () => {
    let cancelled = false
    const source = new ReadableStream<string>({
      pull: (controller) => controller.enqueue('a,b\n'),
      cancel: () => {
        cancelled = true
      },
    })
    const reader = source.pipeThrough(new Csv.DecoderStream()).getReader()
    expect((await reader.read()).value).toEqual(['a', 'b'])
    await reader.cancel()
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(cancelled).toBe(true)
  })

  test('types rows as objects when header is set', async () => {
    const [row] = await decodeStream(['name\nAda\n'], { header: true })
    const name = row?.name satisfies string | undefined
    expect(name).toBe('Ada')
  })
})

test('a row over maxLength with text after a closing quote throws MaxLengthError however it is chunked', async () => {
  expect(() => Csv.decode('""a', { maxLength: 0 })).toThrow(Csv.MaxLengthError)
  await expect(decodeStream(['"', '"a'], { maxLength: 0 })).rejects.toThrow(Csv.MaxLengthError)
})
