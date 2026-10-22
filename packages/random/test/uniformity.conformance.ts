import { describe, expect, test } from 'vite-plus/test'
import * as Random from '@portable/random'
import { cryptoP, draws, looksUniform, permutations, seededP } from './utils.js'

type Functions = Pick<typeof Random, 'int' | 'float' | 'string' | 'shuffle' | 'pick' | 'bytes'>

const sources: readonly [string, () => Functions, number][] = [
  ['seeded', () => Random.seeded(20261018), seededP],
  ['crypto', () => Random, cryptoP],
]

const alphabetOf = (size: number) =>
  Array.from({ length: size }, (_, i) => String.fromCodePoint(0x4e00 + i)).join('')

for (const [name, source, p] of sources) {
  describe(`${name}: chi-squared uniformity`, () => {
    const intCases: readonly [string, number, number, (value: number) => unknown, number][] = [
      ['a die', 1, 6, (v) => v, 6],
      ['0 to 36', 0, 36, (v) => v, 37],
      ['-50 to 49', -50, 49, (v) => v, 100],
      ['0 to 255', 0, 255, (v) => v, 256],
      ['0 to 256', 0, 256, (v) => v, 257],
      ['thirds of 0 to 3 * 2^30 - 1', 0, 3 * 2 ** 30 - 1, (v) => Math.floor(v / 2 ** 30), 3],
      ['2^32 + 1 integers, modulo 7', 0, 2 ** 32, (v) => v % 7, 7],
      ['thirds of 0 to 3 * 2^51 - 1', 0, 3 * 2 ** 51 - 1, (v) => Math.floor(v / 2 ** 51), 3],
      ['the low bit of 0 to 2^53 - 1', 0, Number.MAX_SAFE_INTEGER, (v) => v % 2, 2],
    ]
    for (const [label, min, max, bucket, categories] of intCases) {
      test(`int over ${label}`, () => {
        const random = source()
        const values = draws(Math.max(30000, categories * 200), () => bucket(random.int(min, max)))
        expect(looksUniform(values, categories, p).uniform).toBe(true)
      })
    }

    test('float in 100 equal bins and in its lowest bit', () => {
      const random = source()
      expect(
        looksUniform(
          draws(30000, () => Math.floor(random.float() * 100)),
          100,
          p,
        ).uniform,
      ).toBe(true)
      expect(
        looksUniform(
          draws(30000, () => (random.float() * 2 ** 53) % 2),
          2,
          p,
        ).uniform,
      ).toBe(true)
    })

    for (const size of [2, 10, 26, 36, 62, 64, 100, 255, 256, 257, 1000]) {
      test(`string characters from an alphabet of ${size}`, () => {
        const random = source()
        const text = random.string(Math.max(100000, size * 200), { alphabet: alphabetOf(size) })
        expect(looksUniform(text, size, p).uniform).toBe(true)
      })
    }

    test('string character pairs, so neighbors are independent', () => {
      const random = source()
      expect(
        looksUniform(
          draws(20000, () => random.string(2, { alphabet: '0123456789' })),
          100,
          p,
        ).uniform,
      ).toBe(true)
    })

    test('string characters from an emoji alphabet', () => {
      const random = source()
      expect(
        looksUniform(Array.from(random.string(6000, { alphabet: '😀🎉🚀' })), 3, p).uniform,
      ).toBe(true)
    })

    test('shuffle orders of 4 elements', () => {
      const random = source()
      const orders = draws(48000, () => random.shuffle([1, 2, 3, 4]).join())
      expect(looksUniform(orders, permutations(4), p).uniform).toBe(true)
    })

    test('shuffle positions of 10 elements', () => {
      const random = source()
      const elements = Array.from({ length: 10 }, (_, i) => i)
      const firstTwo = draws(18000, () => random.shuffle(elements).slice(0, 2).join())
      expect(looksUniform(firstTwo, 90, p).uniform).toBe(true)
      const positionOfZero = draws(10000, () => random.shuffle(elements).indexOf(0))
      expect(looksUniform(positionOfZero, 10, p).uniform).toBe(true)
    })

    test('pick from 7 elements', () => {
      const random = source()
      const array = ['a', 'b', 'c', 'd', 'e', 'f', 'g']
      expect(
        looksUniform(
          draws(14000, () => random.pick(array)),
          7,
          p,
        ).uniform,
      ).toBe(true)
    })

    test('bytes', () => {
      const random = source()
      expect(looksUniform(random.bytes(256 * 200), 256, p).uniform).toBe(true)
    })
  })
}

describe('the chi-squared check', () => {
  test('rejects a modulo-biased draw over thirds of 0 to 3 * 2^30 - 1', () => {
    const random = Random.seeded(1)
    const biased = draws(30000, () => {
      const word = random.int(0, 2 ** 32 - 1)
      return Math.floor((word % (3 * 2 ** 30)) / 2 ** 30)
    })
    expect(looksUniform(biased, 3, seededP).uniform).toBe(false)
  })

  test('rejects a byte reduced modulo 36', () => {
    const random = Random.seeded(1)
    const biased = Array.from(random.bytes(100000), (byte) => byte % 36)
    expect(looksUniform(biased, 36, seededP).uniform).toBe(false)
  })

  test('rejects a shuffle that swaps with any index, the classic off-by-one', () => {
    const random = Random.seeded(1)
    const naive = () => {
      const array = [1, 2, 3, 4]
      for (let i = 0; i < array.length; i++) {
        const j = random.int(0, array.length - 1)
        ;[array[i], array[j]] = [array[j]!, array[i]!]
      }
      return array.join()
    }
    expect(looksUniform(draws(48000, naive), 24, seededP).uniform).toBe(false)
  })
})
