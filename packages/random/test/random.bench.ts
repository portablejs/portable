import { randomInt } from 'node:crypto'
import cryptoRandomString from 'crypto-random-string'
import _ from 'lodash'
import { customAlphabet, random as nanoidRandom } from 'nanoid'
import randomInteger from 'random-int'
import seedrandom from 'seedrandom'
import { expect, test } from 'vite-plus/test'
import * as Random from '@portable/random'

// Each benchmark makes 1000 calls, so the time per call is above the timer's resolution.
const calls = 1000
let sink: unknown
const repeat = (fn: () => unknown) => () => {
  for (let i = 0; i < calls; i++) sink = fn()
}

const urlAlphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'
const lowercase = 'abcdefghijklmnopqrstuvwxyz0123456789'
const urlId = customAlphabet(urlAlphabet, 21)
const lowercaseId = customAlphabet(lowercase, 12)
const deck = Array.from({ length: 52 }, (_, i) => i)

test('int(1, 100) within 25% of random-int', async ({ bench }) => {
  const result = await bench.compare(
    bench(
      '@portable/random',
      repeat(() => Random.int(1, 100)),
    ),
    bench(
      'random-int',
      repeat(() => randomInteger(1, 100)),
    ),
    bench(
      'lodash.random',
      repeat(() => _.random(1, 100)),
    ),
    bench(
      'node:crypto randomInt',
      repeat(() => randomInt(1, 101)),
    ),
  )
  expect(result.get('random-int')).not.toBeFasterThan(result.get('@portable/random'), {
    delta: 0.25,
  })
})

test('int over 2^53 integers within 25% of random-int', async ({ bench }) => {
  const max = Number.MAX_SAFE_INTEGER
  const result = await bench.compare(
    bench(
      '@portable/random',
      repeat(() => Random.int(0, max)),
    ),
    bench(
      'random-int',
      repeat(() => randomInteger(0, max)),
    ),
  )
  expect(result.get('random-int')).not.toBeFasterThan(result.get('@portable/random'), {
    delta: 0.25,
  })
})

test('float within 25% of lodash.random(0, 1, true)', async ({ bench }) => {
  const result = await bench.compare(
    bench('@portable/random', repeat(Random.float)),
    bench(
      'lodash.random',
      repeat(() => _.random(0, 1, true)),
    ),
    bench('Math.random', repeat(Math.random)),
  )
  expect(result.get('lodash.random')).not.toBeFasterThan(result.get('@portable/random'), {
    delta: 0.25,
  })
})

test('string(21) within 25% of nanoid and crypto-random-string', async ({ bench }) => {
  const result = await bench.compare(
    bench(
      '@portable/random',
      repeat(() => Random.string(21)),
    ),
    bench(
      'nanoid customAlphabet',
      repeat(() => urlId()),
    ),
    bench(
      'crypto-random-string',
      repeat(() => cryptoRandomString({ length: 21, characters: urlAlphabet })),
    ),
  )
  for (const upstream of ['nanoid customAlphabet', 'crypto-random-string'] as const)
    expect(result.get(upstream)).not.toBeFasterThan(result.get('@portable/random'), {
      delta: 0.25,
    })
})

test('string(12) from 36 characters within 25% of nanoid and crypto-random-string', async ({
  bench,
}) => {
  const result = await bench.compare(
    bench(
      '@portable/random',
      repeat(() => Random.string(12, { alphabet: lowercase })),
    ),
    bench(
      'nanoid customAlphabet',
      repeat(() => lowercaseId()),
    ),
    bench(
      'crypto-random-string',
      repeat(() => cryptoRandomString({ length: 12, characters: lowercase })),
    ),
  )
  for (const upstream of ['nanoid customAlphabet', 'crypto-random-string'] as const)
    expect(result.get(upstream)).not.toBeFasterThan(result.get('@portable/random'), {
      delta: 0.25,
    })
})

test('shuffle of 52 elements within 25% of lodash.shuffle', async ({ bench }) => {
  const result = await bench.compare(
    bench(
      '@portable/random',
      repeat(() => Random.shuffle(deck)),
    ),
    bench(
      'lodash.shuffle',
      repeat(() => _.shuffle(deck)),
    ),
  )
  expect(result.get('lodash.shuffle')).not.toBeFasterThan(result.get('@portable/random'), {
    delta: 0.25,
  })
})

test('pick within 25% of lodash.sample', async ({ bench }) => {
  const result = await bench.compare(
    bench(
      '@portable/random',
      repeat(() => Random.pick(deck)),
    ),
    bench(
      'lodash.sample',
      repeat(() => _.sample(deck)),
    ),
  )
  expect(result.get('lodash.sample')).not.toBeFasterThan(result.get('@portable/random'), {
    delta: 0.25,
  })
})

test('bytes(32) within 25% of crypto.getRandomValues and nanoid random', async ({ bench }) => {
  const result = await bench.compare(
    bench(
      '@portable/random',
      repeat(() => Random.bytes(32)),
    ),
    bench(
      'crypto.getRandomValues',
      repeat(() => crypto.getRandomValues(new Uint8Array(32))),
    ),
    bench(
      'nanoid random',
      repeat(() => nanoidRandom(32)),
    ),
  )
  for (const other of ['crypto.getRandomValues', 'nanoid random'] as const)
    expect(result.get(other)).not.toBeFasterThan(result.get('@portable/random'), { delta: 0.25 })
})

test('seeded float within 25% of seedrandom', async ({ bench }) => {
  const ours = Random.seeded(1)
  const arc4 = seedrandom('1')
  const alea = seedrandom.alea('1')
  const xor4096 = seedrandom.xor4096('1')
  const result = await bench.compare(
    bench('@portable/random seeded', repeat(ours.float)),
    bench('seedrandom', repeat(arc4)),
    bench('seedrandom alea', repeat(alea)),
    bench('seedrandom xor4096', repeat(xor4096)),
  )
  for (const upstream of ['seedrandom', 'seedrandom alea', 'seedrandom xor4096'] as const)
    expect(result.get(upstream)).not.toBeFasterThan(result.get('@portable/random seeded'), {
      delta: 0.25,
    })
  expect(sink).toBeDefined()
})
