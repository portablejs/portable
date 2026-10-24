import * as ImageSize from '@portable/image-size'
import { cuts, fc, fuzz, mutated, outcome, outcomeAsync, split } from '@portable/fuzz'
import { fromIterable } from '@portable/streams'
import { beforeAll, expect, test } from 'vite-plus/test'
import { encode, fixture, fixtures } from './utils.js'

const errors = [ImageSize.InvalidInputError, ImageSize.TruncatedError, ImageSize.UnsupportedError]
const files = new Array<Uint8Array>()
beforeAll(async () => {
  for (const path of fixtures) files.push(await fixture(path))
}, 60_000)

// The start of each format's header, so that format's parser reads the random bytes after it.
const magic = [
  [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52],
  [0xff, 0xd8, 0xff],
  [0x47, 0x49, 0x46, 0x38, 0x39, 0x61],
  [0x42, 0x4d],
  [0x49, 0x49, 0x2a, 0],
  [0x4d, 0x4d, 0, 0x2a],
  [0x49, 0x49, 0x2b, 0, 8, 0, 0, 0],
  [0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50],
  [0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70, 0x61, 0x76, 0x69, 0x66],
  [0, 0, 1, 0],
  [0, 0, 2, 0],
  [0x69, 0x63, 0x6e, 0x73],
  [0x38, 0x42, 0x50, 0x53],
  [0x44, 0x44, 0x53, 0x20],
  [0xff, 0x0a],
  [0, 0, 0, 0x0c, 0x4a, 0x58, 0x4c, 0x20, 0x0d, 0x0a, 0x87, 0x0a],
  [0xff, 0x4f, 0xff, 0x51],
  [0xab, 0x4b, 0x54, 0x58, 0x20, 0x31, 0x31, 0xbb],
  [...encode('P6\n')],
  [...encode('<svg ')],
]

const input = fc.oneof(
  fc.nat().chain((i) => mutated(files[i % files.length]!)),
  fc
    .tuple(fc.constantFrom(...magic), fc.uint8Array({ maxLength: 200 }))
    .map(([head, tail]) => Uint8Array.from([...head, ...tail])),
  fc.uint8Array({ maxLength: 64 }),
)

test('parse returns a size or throws a documented error for any input', () => {
  fuzz(
    fc.property(input, (bytes) => {
      const result = outcome(errors, () => ImageSize.parse(bytes))
      const { width, height } = 'value' in result ? result.value : { width: 0, height: 0 }
      expect([width, height].every((n) => Number.isFinite(n) && n >= 0)).toBe(true)
    }),
    { scale: 5 },
  )
})

test('parseStream returns what parse returns, however the bytes are chunked', async () => {
  await fuzz(
    fc.asyncProperty(input, cuts, async (bytes, at) => {
      expect(
        await outcomeAsync(errors, () => ImageSize.parseStream(fromIterable(split(bytes, at)))),
      ).toEqual(outcome(errors, () => ImageSize.parse(bytes)))
    }),
    { scale: 2 },
  )
})
