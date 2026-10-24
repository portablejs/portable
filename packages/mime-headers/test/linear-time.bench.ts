import { describe, expect, test } from 'vite-plus/test'
import {
  decodeWords,
  encodeWord,
  encodeWords,
  fold,
  formatValue,
  InvalidInputError,
  parseAddresses,
  parseHeaders,
  parseValue,
  unfold,
} from '@portable/mime-headers'
import { pick, random } from './utils.js'

// Ported from the linear-time tests in nodemailer 10.1.7 test/addressparser/addressparser-test.ts
// and libmime 5.5.1 test/fuzz-test.ts. Each test times an adversarial input at two sizes eight
// times apart: linear work takes about 8 times as long for the larger one, quadratic work 64
// times. The best of seven runs is compared, so a garbage collection doesn't fail a test, and a
// failing test is retried, since other processes on a busy machine skew the timings.

const scale = 8
const maxRatio = 24

function bestOf(run: () => unknown): number {
  let best = Infinity
  for (let i = 0; i < 7; i++) {
    const start = performance.now()
    run()
    best = Math.min(best, performance.now() - start)
  }
  return best
}

function slowdown(
  size: number,
  make: (size: number) => string,
  run: (input: string) => unknown,
): number {
  const small = make(size)
  const large = make(size * scale)
  run(small)
  return (
    bestOf(() => run(large)) /
    Math.max(
      bestOf(() => run(small)),
      0.01,
    )
  )
}

const strict = (input: string) => {
  try {
    return parseAddresses(input, { strict: true })
  } catch (error) {
    if (!(error instanceof InvalidInputError)) throw error
    return []
  }
}

const repeat = (unit: string) => (size: number) => unit.repeat(Math.ceil(size / unit.length))

describe('linear time', { timeout: 120_000, retry: 3 }, () => {
  const addressInputs = [
    ['a flat list', repeat('a@b.com,')],
    ['name fragments to merge', repeat('a, b <c@d.com>,')],
    ['comment-joined atoms', (size) => 'a' + repeat('@b(c)')(size)],
    ['comment-separated atoms', (size) => 'a@' + repeat('(c)b@')(size)],
    ['free text without an "@"', repeat('[x]')],
    ['free text and a trailing "@"', (size) => repeat('[x]')(size) + '@'],
    ['free text after an "@"', (size) => '@' + repeat('[x]')(size)],
    ['free text before an address', (size) => repeat('[x]')(size) + ' a@b.com'],
    ['many runs and no "@"', repeat(' [x]')],
    ['many runs before an address', (size) => repeat(' [x]')(size) + ' a@b.com'],
    ['many runs after an address', (size) => 'a@b.com' + repeat(' [x]')(size)],
    ['many domain literals', repeat('a@[]')],
    ['many "["', repeat('[')],
    ['many comments in an angle address', (size) => 'A <a@b' + repeat('(c)d')(size) + '>'],
    ['comment openers in an angle address', (size) => 'A <a@b' + repeat('(')(size) + '>'],
    ['an unclosed quoted string in an angle address', (size) => '<"' + repeat('a')(size)],
    ['an unclosed quoted string in a group', (size) => 'G: "' + repeat(';')(size)],
    ['nested comments in an angle address', (size) => '<' + repeat('(')(size)],
    ['nested comments in a group', (size) => 'G: ' + repeat('(')(size)],
    ['quoted strings in a group', (size) => 'G: ' + repeat('"a;" ')(size) + ';'],
    ['deeply nested comments', (size) => 'a@b.com (' + repeat('(')(size) + repeat(')')(size) + ')'],
    ['an unclosed run of comment openers', (size) => 'a@b.com ' + repeat('(')(size)],
    ['many unexpected "<"', (size) => '<' + repeat('"b"(c)a<')(size) + 'd@e.com>'],
    ['a whitespace run in an angle address', (size) => '<a' + repeat(' ')(size) + 'b@c.com>'],
    [
      'whitespace runs beside the "@"',
      (size) => 'a' + repeat(' ')(size) + '@' + repeat(' ')(size) + 'b',
    ],
    ['a quoted local part and a whitespace run', (size) => '"a"' + repeat(' ')(size) + '@b.com'],
    ['many comments beside the "@"', (size) => '<a' + repeat('(x)')(size) + '@b.com>'],
    ['many group openers', (size) => repeat('g: ')(size) + 'a@b.com'],
    ['many "@"', repeat('@')],
  ] satisfies [string, (size: number) => string][]
  for (const [label, make] of addressInputs)
    test(`parseAddresses() of ${label}`, () => {
      expect(slowdown(16 * 1024, make, (input) => parseAddresses(input))).toBeLessThan(maxRatio)
      expect(slowdown(16 * 1024, make, strict)).toBeLessThan(maxRatio)
    })

  const next = random(112)
  const pieces = [
    '=?',
    '?=',
    '=?utf-8?q?',
    '=?utf-8?b?',
    '?Q?',
    '=',
    '=C3',
    '"',
    ';',
    '*0*=',
    '*1=',
    "''",
    '%',
    '%C3',
    '(',
    ')',
    '<',
    '>',
    '@',
    ',',
    ':',
    ' ',
    '\t',
    '\r\n ',
    '\n',
    'õ',
    'a',
    '\\',
  ]
  const chunk = Array.from({ length: 240 }, () => pick(next, pieces)).join('')
  const hostile = repeat(chunk)

  const textInputs = [
    ['decodeWords()', decodeWords],
    ['parseValue()', parseValue],
    ['parseHeaders()', parseHeaders],
    ['unfold()', unfold],
    ['encodeWords()', (input) => encodeWords(input)],
    ['encodeWord()', (input) => encodeWord(input, { wordLength: 52 })],
    ['encodeWord() in B', (input) => encodeWord(input, { wordEncoding: 'B' })],
    ['formatValue()', (input) => formatValue({ value: 'x', params: { f: input } })],
    ['fold()', (input) => fold(input)],
    ['parseAddresses()', (input) => parseAddresses(input)],
  ] satisfies [string, (input: string) => unknown][]
  for (const [label, run] of textInputs)
    test(`${label} of hostile text`, () => {
      expect(slowdown(16 * 1024, hostile, run)).toBeLessThan(maxRatio)
    })

  test('decodeWords() of many adjacent words', () => {
    expect(slowdown(16 * 1024, repeat('=?utf-8?q?=C3?= '), decodeWords)).toBeLessThan(maxRatio)
  })

  test('parseValue() of many sections', () => {
    const make = (size: number) =>
      'x' + Array.from({ length: size / 16 }, (_, i) => `; f*${i}*=%C3%B5`).join('')
    expect(slowdown(16 * 1024, make, parseValue)).toBeLessThan(maxRatio)
  })

  test('fold() of a line without whitespace and of a whitespace run', () => {
    expect(slowdown(16 * 1024, repeat('a'), (input) => fold(input))).toBeLessThan(maxRatio)
    expect(
      slowdown(
        16 * 1024,
        (size) => 'a' + ' '.repeat(size) + 'b',
        (input) => fold(input),
      ),
    ).toBeLessThan(maxRatio)
  })

  test('parseHeaders() of many continuation lines and of a whitespace run', () => {
    expect(
      slowdown(16 * 1024, (size) => 'A: ' + repeat('x\r\n ')(size), parseHeaders),
    ).toBeLessThan(maxRatio)
    expect(slowdown(16 * 1024, (size) => 'A:' + ' '.repeat(size) + 'x', parseHeaders)).toBeLessThan(
      maxRatio,
    )
  })
})
