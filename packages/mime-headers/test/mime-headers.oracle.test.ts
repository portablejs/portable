import { isDeepStrictEqual } from 'node:util'
import emailAddresses from 'email-addresses'
import libmime from 'libmime'
import addressparser from 'nodemailer/lib/addressparser'
import { describe, expect, test } from 'vite-plus/test'
import {
  decodeWords,
  encodeWord,
  encodeWords,
  fold,
  formatAddresses,
  formatValue,
  parseAddresses,
  parseHeaders,
  parseValue,
  type Address,
  type Mailbox,
} from '@portable/mime-headers'
import { pick, random, randomText } from './utils.js'

// Compares this package with libmime 5.4.9, nodemailer 10.1.2's addressparser and
// email-addresses 5.0.0 on generated well-formed input. Where the output may differ by design
// (see "Differences" in the README), the test compares what each side decodes back instead.
// Neither addressparser nor email-addresses decodes encoded words in names, so their names are
// passed through libmime.decodeWords before the comparison.

const runs = 300
const each = (seed: number, run: (next: () => number) => void) => {
  const next = random(seed)
  for (let i = 0; i < runs; i++) run(next)
}
// libmime 5.4.9 splits an astral character outside the emoji block (U+1F000 to U+1FFFF) between
// two B words, which turns it into two U+FFFD. 5.5.0 fixed it.
const splitsAstral = (input: string) => /[\u{10000}-\u{1EFFF}\u{20000}-\u{10FFFF}]/u.test(input)

const words = (next: () => number, max: number) =>
  Array.from({ length: Math.floor(next() * max) + 1 }, () =>
    randomText(next, 8, ['ascii', 'specials', 'latin', 'cjk', 'astral']),
  ).join(' ')

describe('encoded words', () => {
  test('libmime decodes what encodeWord encoded, and the reverse', () => {
    const failures = new Array<unknown>()
    each(1, (next) => {
      const input = randomText(next, 80)
      const encoding = pick(next, ['Q', 'B'] as const)
      const maxLength = pick(next, [0, 20, 52, 75])
      const ours = encodeWord(input, { wordEncoding: encoding, maxLength: maxLength || false })
      const theirs = libmime.encodeWord(input, encoding, maxLength)
      const skip = encoding === 'B' && maxLength > 0 && splitsAstral(input)
      if (libmime.decodeWords(ours) !== input || (!skip && decodeWords(theirs) !== input))
        failures.push({ input, encoding, maxLength, ours, theirs })
    })
    expect(failures).toEqual([])
  })

  test('encodeWord writes what libmime writes without a length limit', () => {
    const failures = new Array<unknown>()
    each(2, (next) => {
      // libmime writes a trailing space in a Q word as "=20", and this package as "_".
      const input = randomText(next, 80).trimEnd()
      const encoding = pick(next, ['Q', 'B'] as const)
      const ours = encodeWord(input, { wordEncoding: encoding, maxLength: false })
      if (ours !== libmime.encodeWord(input, encoding)) failures.push({ input, encoding, ours })
    })
    expect(failures).toEqual([])
  })

  test('libmime decodes what encodeWords encoded, and the reverse', () => {
    const failures = new Array<unknown>()
    each(3, (next) => {
      const input = words(next, 10)
      const encoding = pick(next, ['Q', 'B'] as const)
      const ours = encodeWords(input, { wordEncoding: encoding })
      const theirs = libmime.encodeWords(input, encoding, 75)
      const skip = encoding === 'B' && splitsAstral(input)
      if (libmime.decodeWords(ours) !== input || (!skip && decodeWords(theirs) !== input))
        failures.push({ input, encoding, ours, theirs })
    })
    expect(failures).toEqual([])
  })

  test('decodeWords reads mixed text and words the way libmime does', () => {
    const failures = new Array<unknown>()
    each(4, (next) => {
      const parts = Array.from({ length: Math.floor(next() * 6) + 1 }, () =>
        next() < 0.5
          ? libmime.encodeWord(randomText(next, 20), pick(next, ['Q', 'B'] as const))
          : randomText(next, 10, ['ascii', 'latin']),
      )
      const input = parts.join(pick(next, [' ', '\r\n ', '']))
      if (decodeWords(input) !== libmime.decodeWords(input)) failures.push({ input })
    })
    expect(failures).toEqual([])
  })
})

describe('folding', () => {
  test('fold breaks lines where libmime.foldLines breaks them', () => {
    const failures = new Array<unknown>()
    each(5, (next) => {
      // libmime breaks in front of trailing whitespace, which leaves a line of only whitespace.
      // fold never does.
      const input = words(next, 40).trimEnd()
      const lineLength = Math.floor(next() * 70) + 10
      // libmime keeps each line shorter than lineLength, and fold allows lineLength itself.
      const ours = fold(input, { lineLength: lineLength - 1 })
      if (ours !== libmime.foldLines(input, lineLength)) failures.push({ input, lineLength, ours })
    })
    expect(failures).toEqual([])
  })

  test('parseHeaders reads the headers libmime.decodeHeaders reads', () => {
    const failures = new Array<unknown>()
    each(6, (next) => {
      const headers = Array.from({ length: Math.floor(next() * 5) + 1 }, () => ({
        name: pick(next, ['Subject', 'X-Test', 'Content-Type', 'From']),
        value:
          words(next, 12)
            .replace(/[^\x21-\x7e ]/g, 'x')
            .trim() || 'x',
      }))
      const input = headers
        .map(({ name, value }) => fold(`${name}: ${value}`, { lineLength: 30 }))
        .join('\r\n')
      const theirs = libmime.decodeHeaders(input)
      const ours: Record<string, string[]> = {}
      for (const { name, value } of parseHeaders(input))
        (ours[name.toLowerCase()] ??= []).push(value)
      const collapse = (values: readonly string[] = []) =>
        values.map((value) => value.replace(/\s+/g, ' '))
      for (const key of Object.keys(theirs))
        if (JSON.stringify(collapse(ours[key])) !== JSON.stringify(collapse(theirs[key])))
          failures.push({ input, key, ours: ours[key], theirs: theirs[key] })
    })
    expect(failures).toEqual([])
  })
})

describe('header values', () => {
  const paramName = (next: () => number) =>
    Array.from({ length: Math.floor(next() * 8) + 1 }, () =>
      pick(next, Array.from('abcdefghij-_')),
    ).join('')
  const params = (next: () => number) => {
    const result: Record<string, string> = {}
    for (let i = Math.floor(next() * 3) + 1; i > 0; i--)
      result[paramName(next)] = randomText(next, 100, [
        'ascii',
        'specials',
        'latin',
        'cjk',
        'astral',
      ])
    return result
  }

  test('libmime parses what formatValue formatted', () => {
    const failures = new Array<unknown>()
    each(7, (next) => {
      const input = { value: pick(next, ['attachment', 'text/plain']), params: params(next) }
      const theirs = libmime.parseHeaderValue(formatValue(input))
      if (!isDeepStrictEqual(theirs, { value: input.value, params: input.params }))
        failures.push({ input, built: formatValue(input), theirs })
    })
    expect(failures).toEqual([])
  })

  test('parseValue parses what libmime built', () => {
    const failures = new Array<unknown>()
    each(8, (next) => {
      const input = { value: pick(next, ['attachment', 'text/plain']), params: params(next) }
      const built = libmime.buildHeaderValue(input)
      const ours = parseValue(built)
      if (!isDeepStrictEqual(ours, input)) failures.push({ input, built, ours })
    })
    expect(failures).toEqual([])
  })
})

describe('addresses', () => {
  const atom = (next: () => number) => randomText(next, 8, ['ascii']) || 'a'
  const mailbox = (next: () => number): Mailbox => ({
    name: pick(next, [
      () => '',
      () => `${atom(next)} ${atom(next)}`,
      () => randomText(next, 20, ['ascii', 'specials', 'latin']).trim(),
    ])(),
    address: `${pick(next, [() => atom(next), () => `${atom(next)}.${atom(next)}`, () => `"${atom(next)} ${atom(next)}"`])()}@${pick(next, ['example.com', 'mail.example.org', 'localhost'])}`,
  })
  const list = (next: () => number): Address[] =>
    Array.from({ length: Math.floor(next() * 4) + 1 }, () =>
      next() < 0.2 ? { name: atom(next), group: [mailbox(next), mailbox(next)] } : mailbox(next),
    )

  test('parseAddresses reads lists the way addressparser does', () => {
    const failures = new Array<unknown>()
    each(9, (next) => {
      const input = formatAddresses(list(next))
      const decode = (entry: { name: string; address?: string | undefined }) => ({
        name: libmime.decodeWords(entry.name),
        address: entry.address ?? '',
      })
      const theirs = addressparser(input).map((entry) =>
        entry.group ? { name: entry.name, group: entry.group.map(decode) } : decode(entry),
      )
      const ours = parseAddresses(input)
      if (!isDeepStrictEqual(ours, theirs)) failures.push({ input, ours, theirs })
    })
    expect(failures).toEqual([])
  })

  test('parseAddresses in strict mode accepts what email-addresses accepts', () => {
    const failures = new Array<unknown>()
    each(10, (next) => {
      const entries = list(next)
      const input = formatAddresses(entries)
      const theirs = emailAddresses.parseAddressList({ input, rfc6532: true }) ?? []
      const ours = parseAddresses(input, { strict: true })
      const simplify = (entry: emailAddresses.ParsedMailbox | emailAddresses.ParsedGroup) =>
        entry.type === 'group'
          ? {
              name: libmime.decodeWords(entry.name),
              group: entry.addresses.map((member) => member.address),
            }
          : { name: libmime.decodeWords(entry.name ?? ''), address: entry.address }
      const mine = ours.map((entry) =>
        'group' in entry
          ? {
              name: entry.name,
              group: entry.group.map((member) => member.address.replace(/^"([^"\\]*)"@/, '$1@')),
            }
          : { name: entry.name, address: entry.address.replace(/^"([^"\\]*)"@/, '$1@') },
      )
      if (!isDeepStrictEqual(mine, theirs.map(simplify)))
        failures.push({ input, mine, theirs: theirs.map(simplify) })
    })
    expect(failures).toEqual([])
  })
})
