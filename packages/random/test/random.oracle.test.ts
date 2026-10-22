import { randomInt } from 'node:crypto'
import cryptoRandomString from 'crypto-random-string'
import _ from 'lodash'
import { customAlphabet, nanoid } from 'nanoid'
import randomInteger from 'random-int'
import seedrandom from 'seedrandom'
import { describe, expect, test } from 'vite-plus/test'
import * as Random from '@portable/random'

const draws = <T>(count: number, draw: () => T): Set<T> =>
  new Set(Array.from({ length: count }, draw))
const characters = (text: string) => new Set(Array.from(text))
const sorted = (values: Set<number>) => [...values].sort((a, b) => a - b)

describe('matches the upstream libraries where they agree on a contract', () => {
  test('int includes both ends, as random-int, lodash.random and node:crypto randomInt(min, max + 1) do', () => {
    for (const [min, max] of [
      [0, 1],
      [5, 10],
      [-10, -5],
      [0, 0],
    ] as const) {
      const ours = sorted(draws(2000, () => Random.int(min, max)))
      expect(ours).toEqual(sorted(draws(2000, () => randomInteger(min, max))))
      expect(ours).toEqual(sorted(draws(2000, () => _.random(min, max))))
      expect(ours).toEqual(sorted(draws(2000, () => randomInt(min, max + 1))))
    }
  })

  test("string's default alphabet holds the same 64 characters as nanoid's", () => {
    const ours = characters(Random.string(64 * 640))
    expect(ours).toEqual(characters(nanoid(64 * 640)))
    expect(Random.string(21)).toHaveLength(nanoid().length)
  })

  test('string with an alphabet gives the same characters as nanoid customAlphabet', () => {
    for (const alphabet of ['abc', '0123456789abcdef', 'абвгд', 'aaab'])
      expect(characters(Random.string(4000, { alphabet }))).toEqual(
        characters(customAlphabet(alphabet, 4000)()),
      )
  })

  // The README tells crypto-random-string users which alphabet replaces each `type`.
  const types = {
    hex: '0123456789abcdef',
    base64: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/',
    'url-safe': 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-._~',
    numeric: '0123456789',
    distinguishable: 'CDEHKMPRTUWXY012458',
    'ascii-printable':
      '!"#$%&\'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`abcdefghijklmnopqrstuvwxyz{|}~',
    alphanumeric: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789',
  } as const
  for (const [type, alphabet] of Object.entries(types)) {
    test(`string with the ${type} alphabet gives crypto-random-string's ${type} characters`, () => {
      const length = alphabet.length * 640
      expect(characters(Random.string(length, { alphabet }))).toEqual(
        characters(cryptoRandomString({ length, type: type as keyof typeof types })),
      )
    })
  }

  test('shuffle and pick return what lodash.shuffle and lodash.sample return', () => {
    const array = [1, 2, 3, 4]
    const orders = (shuffle: (array: number[]) => number[]) =>
      draws(2000, () => shuffle(array).join())
    expect(orders((array) => Random.shuffle(array))).toEqual(orders((array) => _.shuffle(array)))
    expect(sorted(draws(500, () => Random.pick(array)))).toEqual(
      sorted(draws(500, () => _.sample(array)!)),
    )
  })
})

describe('known upstream issues', () => {
  test('random-int returns values outside fractional bounds', () => {
    const values = draws(2000, () => randomInteger(1.5, 3.5))
    expect([...values].some((value) => value < 1.5 || value > 3.5)).toBe(true)
    expect(() => Random.int(1.5, 3.5)).toThrow(RangeError)
  })

  test('random-int and lodash.random swap reversed bounds; int throws', () => {
    expect(randomInteger(10, 5)).toBeGreaterThanOrEqual(5)
    expect(_.random(10, 5)).toBeGreaterThanOrEqual(5)
    expect(() => Random.int(10, 5)).toThrow(RangeError)
  })

  test('lodash.random(0, 2 ** 62) returns unsafe integers; int throws', () => {
    expect(Number.isSafeInteger(_.random(2 ** 60, 2 ** 62))).toBe(false)
    expect(() => Random.int(0, 2 ** 62)).toThrow(RangeError)
  })

  test('lodash.sample returns undefined for an empty array; pick throws', () => {
    expect(_.sample([])).toBeUndefined()
    expect(() => Random.pick([])).toThrow(RangeError)
  })

  test('nanoid customAlphabet splits emoji into lone surrogates', () => {
    const loneSurrogate = /\p{Cs}/u
    expect(customAlphabet('😀🎉', 100)()).toMatch(loneSurrogate)
    const ours = Random.string(100, { alphabet: '😀🎉' })
    expect(ours).not.toMatch(loneSurrogate)
    expect(Array.from(ours)).toHaveLength(100)
  })

  test('crypto-random-string rejects more than 65,536 characters; string accepts them', () => {
    const alphabet = Array.from({ length: 70000 }, (_, i) => String.fromCodePoint(0x10000 + i))
    expect(() => cryptoRandomString({ length: 1, characters: alphabet.join('') })).toThrow(
      /at most 65536 characters/,
    )
    expect(alphabet).toContain(Random.string(1, { alphabet: alphabet.join('') }))
  })

  test('seedrandom gives the same sequence for seeds that repeat a pattern; seeded does not', () => {
    expect(seedrandom('sf')()).toBe(seedrandom('sfsf')())
    expect(Random.seeded(1).float()).not.toBe(Random.seeded(11).float())
    const firsts = new Set(Array.from({ length: 10000 }, (_, seed) => Random.seeded(seed).float()))
    expect(firsts.size).toBe(10000)
  })
})
