import { cuts, fc, fuzz, outcomeAsync, split } from '@portable/fuzz'
import * as Streams from '@portable/streams'
import { expect, test } from 'vite-plus/test'

const items = fc.array(fc.integer({ min: -100, max: 100 }), { maxLength: 30 })
const text = fc.string({ unit: 'grapheme', maxLength: 40 })

test('map, filter, tap and batch match the array methods', async () => {
  await fuzz(
    fc.asyncProperty(items, fc.integer({ min: 1, max: 7 }), async (items, size) => {
      const seen = new Array<number>()
      const output = await Streams.toArray(
        Streams.fromIterable(items)
          .pipeThrough(Streams.tap((item: number) => void seen.push(item)))
          .pipeThrough(Streams.map(async (item: number) => item * 2))
          .pipeThrough(Streams.filter((item: number) => item % 3 !== 0))
          .pipeThrough(Streams.batch(size)),
      )
      const expected = items.map((item) => item * 2).filter((item) => item % 3 !== 0)
      const batches = new Array<number[]>()
      for (let i = 0; i < expected.length; i += size) batches.push(expected.slice(i, i + size))
      expect(output).toEqual(batches)
      expect(seen).toEqual(items)
    }),
  )
})

test('toText, toBytes and toBlob give the same text however it is chunked, as bytes or strings', async () => {
  await fuzz(
    fc.asyncProperty(text, cuts, async (value, at) => {
      const bytes = new TextEncoder().encode(value)
      expect(await Streams.toText(Streams.fromIterable(split(bytes, at)))).toBe(value)
      expect(await Streams.toText(Streams.fromIterable(split(value, at)))).toBe(
        split(value, at).join(''),
      )
      expect(await Streams.toBytes(Streams.fromIterable(split(bytes, at)))).toEqual(bytes)
      const blob = await Streams.toBlob(Streams.fromIterable(split(bytes, at)))
      expect(new Uint8Array(await blob.arrayBuffer())).toEqual(bytes)
    }),
  )
})

test('limitBytes and maxBytes allow exactly that many bytes', async () => {
  await fuzz(
    fc.asyncProperty(
      fc.uint8Array({ maxLength: 60 }),
      cuts,
      fc.nat(70),
      async (bytes, at, maxBytes) => {
        const expected =
          bytes.length > maxBytes ? { error: Streams.MaxBytesError } : { value: bytes }
        const errors = [Streams.MaxBytesError]
        expect(
          await outcomeAsync(errors, () =>
            Streams.toBytes(
              Streams.fromIterable(split(bytes, at)).pipeThrough(Streams.limitBytes(maxBytes)),
            ),
          ),
        ).toEqual(expected)
        expect(
          await outcomeAsync(errors, () =>
            Streams.toBytes(Streams.fromIterable(split(bytes, at)), { maxBytes }),
          ),
        ).toEqual(expected)
      },
    ),
  )
})

test('concat keeps the order of its sources, merge keeps the order within each', async () => {
  await fuzz(
    fc.asyncProperty(fc.array(items, { maxLength: 4 }), async (lists) => {
      const streams = () => lists.map((list) => Streams.fromIterable(list))
      expect(await Streams.toArray(Streams.concat(streams()))).toEqual(lists.flat())
      const merged = await Streams.toArray(
        Streams.merge(
          lists.map((list, source) => Streams.fromIterable(list.map((item) => ({ source, item })))),
        ),
      )
      expect(merged).toHaveLength(lists.flat().length)
      for (const [source, list] of lists.entries())
        expect(
          merged.filter((entry) => entry.source === source).map((entry) => entry.item),
        ).toEqual(list)
    }),
  )
})

test('tee gives every branch the whole stream', async () => {
  await fuzz(
    fc.asyncProperty(items, fc.integer({ min: 1, max: 4 }), async (items, count) => {
      const branches = Streams.tee(Streams.fromIterable(items), count)
      expect(await Promise.all(branches.map((branch) => Streams.toArray(branch)))).toEqual(
        Array.from({ length: count }, () => items),
      )
    }),
  )
})

test('toJson parses the text however it is chunked', async () => {
  await fuzz(
    fc.asyncProperty(fc.jsonValue(), cuts, async (value, at) => {
      const json = JSON.stringify(value)
      expect(
        await Streams.toJson(Streams.fromIterable(split(new TextEncoder().encode(json), at))),
      ).toEqual(JSON.parse(json))
    }),
  )
})
