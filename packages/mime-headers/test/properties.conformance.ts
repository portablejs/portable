import { describe, expect, test } from 'vite-plus/test'
import * as MimeHeaders from '@portable/mime-headers'
import {
  decodeWords,
  encodeWord,
  encodeWords,
  fold,
  formatAddresses,
  formatValue,
  parseAddresses,
  parseMailboxes,
  parseHeaders,
  parseValue,
  unfold,
  type Address,
  type CharsetEncoder,
  type Mailbox,
} from '@portable/mime-headers'
import { pick, random, randomText, utf8, wellFormed, type Alphabet } from './utils.js'

// Ported from libmime 5.5.1 test/property-test.ts and test/fuzz-test.ts, with properties for the
// address functions added. Each test runs a fixed number of seeded cases, and a failure reports
// the case it ran, so it can be reproduced.

const cases = 300
const each = (seed: number, run: (next: () => number) => void) => {
  const next = random(seed)
  for (let i = 0; i < cases; i++) run(next)
}

const encodedWords = /^=\?UTF-8\?[QB]\?[!-~]*?\?=(?: =\?UTF-8\?[QB]\?[!-~]*?\?=)*$/
const printable = /^[ -~]*$/
const sorted = (params: Readonly<Record<string, string>>) =>
  Object.fromEntries(Object.entries(params).sort(([a], [b]) => (a < b ? -1 : 1)))
const words = (next: () => number, max: number, kinds?: readonly Alphabet[]) =>
  Array.from({ length: Math.floor(next() * max) + 1 }, () => randomText(next, 8, kinds)).join(' ')
const loneSurrogate = (next: () => number) =>
  String.fromCharCode(pick(next, [0xd800, 0xdbff, 0xdc00, 0xdfff]))

describe('encoded words', () => {
  test('decodeWords gives back what encodeWord encoded, as well-formed words', () => {
    const failures: unknown[] = []
    each(1, (next) => {
      const input = randomText(next, 80)
      for (const encoding of ['Q', 'B'] as const) {
        const maxLength = pick(next, [false, 13, 20, 30, 52, 75] as const)
        const encoded = encodeWord(input, { wordEncoding: encoding, maxLength })
        const ok =
          encodedWords.test(encoded) &&
          decodeWords(encoded) === input &&
          encodeWord(utf8(input), { wordEncoding: encoding, maxLength }) === encoded &&
          (maxLength === false ||
            input === '' ||
            encoded.split(' ').every((word) => {
              const decoded = decodeWords(word)
              return (
                word.length <= Math.max(maxLength, 24) &&
                decoded !== '' &&
                !decoded.includes('\ufffd')
              )
            }))
        if (!ok) failures.push({ input, encoding, maxLength, encoded })
      }
    })
    expect(failures).toEqual([])
  })

  test('a lone surrogate becomes U+FFFD and the text around it is kept', () => {
    const failures: unknown[] = []
    each(2, (next) => {
      const input = randomText(next, 10) + loneSurrogate(next) + randomText(next, 10)
      for (const encoding of ['Q', 'B'] as const) {
        const encoded = encodeWord(input, {
          wordEncoding: encoding,
          maxLength: pick(next, [false, 20, 40] as const),
        })
        if (decodeWords(encoded) !== wellFormed(input)) failures.push({ input, encoded })
      }
    })
    expect(failures).toEqual([])
  })

  test('decodeWords gives back what encodeWords encoded, and printable ASCII is left as it is', () => {
    const failures: unknown[] = []
    each(3, (next) => {
      const input = words(next, 10, ['ascii', 'specials', 'latin', 'cjk', 'astral', 'controls'])
      const encoded = encodeWords(input, {
        wordEncoding: pick(next, ['Q', 'B'] as const),
        maxLength: pick(next, [false, 40] as const),
      })
      const plain = /^[ -~\t]*$/.test(input) && !/=\?|\?=/.test(input)
      if (
        decodeWords(encoded) !== input ||
        /[\u0080-\uffff]/.test(encoded) ||
        (plain && encoded !== input)
      )
        failures.push({ input, encoded })
    })
    expect(failures).toEqual([])
  })

  test('words in another charset decode the way TextDecoder decodes them', () => {
    const latin1: CharsetEncoder = {
      name: 'ISO-8859-1',
      encode: (text) => Uint8Array.from(text, (c) => c.charCodeAt(0)),
    }
    const decoder = new TextDecoder('iso-8859-1')
    const failures: unknown[] = []
    each(4, (next) => {
      const input = Array.from({ length: Math.floor(next() * 20) }, () =>
        pick(next, Array.from('abc XYZ 019 õäöüéèàçñ!?=_')),
      ).join('')
      const bytes = latin1.encode(input)
      const base64 = btoa(String.fromCharCode(...bytes))
      for (const encoding of ['Q', 'B'] as const) {
        const encoded = encodeWord(input, { charset: latin1, wordEncoding: encoding })
        if (decodeWords(encoded) !== input) failures.push({ input, encoded })
      }
      if (decodeWords(`=?iso-8859-1*en?B?${base64}?=`) !== decoder.decode(bytes))
        failures.push({ input })
    })
    expect(failures).toEqual([])
  })

  test('decodeWords leaves text without encoded words as it is', () => {
    const failures: unknown[] = []
    each(5, (next) => {
      const input = randomText(next, 60, ['ascii', 'specials', 'latin', 'controls']).replaceAll(
        '=?',
        '=',
      )
      if (decodeWords(input) !== input) failures.push(input)
    })
    expect(failures).toEqual([])
  })

  test('decodeWords returns a string for any input', () => {
    each(6, (next) => {
      const parts = [
        '=?',
        '?=',
        '?Q?',
        '?B?',
        'utf-8',
        'utf-7',
        '=C3',
        '_',
        ' ',
        '\r\n ',
        'x',
        'õ',
        '*en',
      ]
      const input = Array.from({ length: Math.floor(next() * 30) }, () => pick(next, parts)).join(
        '',
      )
      expect(typeof decodeWords(input)).toBe('string')
    })
  })
})

describe('header values', () => {
  const paramName = (next: () => number) =>
    Array.from({ length: Math.floor(next() * 10) + 1 }, () =>
      pick(next, Array.from('abcdefghijklmnopqrstuvwxyz0123456789-_.')),
    ).join('')

  test('parseValue gives back the params formatValue formatted, whatever they hold', () => {
    const failures: unknown[] = []
    each(7, (next) => {
      const params: Record<string, string> = {}
      for (let i = Math.floor(next() * 4) + 1; i > 0; i--)
        params[paramName(next)] = randomText(next, 120, [
          'ascii',
          'specials',
          'latin',
          'cjk',
          'astral',
          'controls',
        ])
      const value = pick(next, ['attachment', 'inline', 'text/plain', 'multipart/mixed'])
      const built = formatValue({ value, params })
      const parsed = parseValue(built)
      if (
        !printable.test(built) ||
        parsed.value !== value ||
        JSON.stringify(sorted(parsed.params)) !== JSON.stringify(sorted(params))
      )
        failures.push({ params, built })
    })
    expect(failures).toEqual([])
  })

  test('parseValue returns plain params and never sets a prototype', () => {
    each(8, (next) => {
      const parts = [
        '__proto__',
        'constructor',
        'prototype',
        '*',
        '*0',
        '*1*',
        '=',
        ';',
        '"',
        "'",
        'x',
        ' ',
        '%41',
        'utf-8',
      ]
      const input =
        'x; ' + Array.from({ length: Math.floor(next() * 20) }, () => pick(next, parts)).join('')
      const { params } = parseValue(input)
      expect(Object.getPrototypeOf(params)).toBe(Object.prototype)
      expect(Object.values(params).every((value) => typeof value === 'string')).toBe(true)
    })
  })
})

describe('folding', () => {
  test('fold only inserts line breaks before whitespace, and unfold removes them', () => {
    const failures: unknown[] = []
    each(9, (next) => {
      const input = words(next, 40, ['ascii', 'latin', 'specials'])
      const lineLength = Math.floor(next() * 76) + 5
      const folded = fold(input, { lineLength })
      const ok =
        folded.replaceAll('\r\n', '') === input &&
        unfold(folded) === input &&
        folded
          .split('\r\n')
          .every((line) => line.trimEnd().length <= lineLength || !/\S\s+\S/.test(line.trim()))
      if (!ok) failures.push({ input, lineLength, folded })
    })
    expect(failures).toEqual([])
  })

  test('parseHeaders reads a name without line breaks or a colon for every header', () => {
    each(10, (next) => {
      const parts = ['A', 'b-c', ':', ' ', '\t', '\r\n', '\n', '\r', 'x', 'õ', '\r\n\r\n']
      const input = Array.from({ length: Math.floor(next() * 40) }, () => pick(next, parts)).join(
        '',
      )
      for (const header of parseHeaders(input)) expect(header.name).not.toMatch(/[\r\n:]/)
    })
  })
})

describe('addresses', () => {
  const local = (next: () => number) =>
    pick(next, [
      () => randomText(next, 10, ['ascii']) || 'a',
      () => `${randomText(next, 5, ['ascii']) || 'a'}.${randomText(next, 5, ['ascii']) || 'b'}`,
      () => `"a ${randomText(next, 10, ['ascii', 'specials']).replace(/["\\]/g, '\\$&')}"`,
      () => randomText(next, 6, ['latin', 'cjk']) || 'õ',
    ])()
  const domain = (next: () => number) =>
    pick(next, ['example.com', 'mail.example.org', 'localhost', '[192.0.2.1]', 'bücher.example'])
  const mailbox = (next: () => number): Mailbox => ({
    name: pick(next, [
      () => '',
      () => randomText(next, 30, ['ascii', 'specials', 'latin', 'cjk', 'astral']),
    ])(),
    address: `${local(next)}@${domain(next)}`,
  })

  test('parseAddresses gives back what formatAddresses formatted', () => {
    const failures: unknown[] = []
    each(11, (next) => {
      const list: Address[] = Array.from({ length: Math.floor(next() * 4) + 1 }, () =>
        next() < 0.2
          ? {
              name: randomText(next, 10, ['ascii', 'latin']) || 'g',
              group: [mailbox(next), mailbox(next)],
            }
          : mailbox(next),
      )
      const formatted = formatAddresses(list)
      const normal = (entry: Mailbox) => ({
        name: entry.name.trim().replace(/\s+/g, ' '),
        address: entry.address,
      })
      const parsed = parseAddresses(formatted, { strict: true })
      const expected = list.map((entry) =>
        'group' in entry
          ? { name: normal({ name: entry.name, address: '' }).name, group: entry.group.map(normal) }
          : normal(entry),
      )
      const actual = parsed.map((entry) =>
        'group' in entry ? { name: entry.name, group: entry.group.map(normal) } : normal(entry),
      )
      if (JSON.stringify(actual) !== JSON.stringify(expected))
        failures.push({ list, formatted, actual })
    })
    expect(failures).toEqual([])
  })

  test('parseAddresses reads any input without throwing, as mailboxes and groups', () => {
    each(12, (next) => {
      const parts = [
        'a',
        'b.c',
        '@',
        '<',
        '>',
        ',',
        ';',
        ':',
        '"',
        '(',
        ')',
        '\\',
        ' ',
        '[',
        ']',
        'õ',
        '=?utf-8?q?x?=',
      ]
      const input = Array.from({ length: Math.floor(next() * 40) }, () => pick(next, parts)).join(
        '',
      )
      const mailboxes = parseAddresses(input).flatMap((entry) =>
        'group' in entry ? entry.group : [entry],
      )
      expect(
        mailboxes.every(
          (entry) => typeof entry.name === 'string' && typeof entry.address === 'string',
        ),
      ).toBe(true)
      expect(parseMailboxes(input).every((entry) => !('group' in entry))).toBe(true)
    })
  })
})

describe('parseHeaders maxLength', () => {
  const block = 'Subject: Hello\r\nTo: a@example.com'

  test('accepts a block exactly maxLength long and counts no body', () => {
    const message = `${block}\r\n\r\n${'x'.repeat(1000)}`
    expect(MimeHeaders.parseHeaders(message, { maxLength: block.length })).toEqual([
      { name: 'Subject', value: 'Hello' },
      { name: 'To', value: 'a@example.com' },
    ])
  })

  test('throws MaxLengthError for a block one code unit longer', () => {
    let error: unknown
    try {
      MimeHeaders.parseHeaders(`${block}\r\n\r\nbody`, { maxLength: block.length - 1 })
    } catch (caught) {
      error = caught
    }
    expect(error).toBeInstanceOf(MimeHeaders.MaxLengthError)
    expect((error as MimeHeaders.MaxLengthError).maxLength).toBe(block.length - 1)
  })

  test('counts a long folded field', () => {
    const folded = `Subject: ${'a'.repeat(50)}\r\n ${'b'.repeat(50)}`
    expect(() => MimeHeaders.parseHeaders(folded, { maxLength: 80 })).toThrow(
      MimeHeaders.MaxLengthError,
    )
  })

  test('rejects a negative or NaN maxLength', () => {
    expect(() => MimeHeaders.parseHeaders(block, { maxLength: -1 })).toThrow(RangeError)
    expect(() => MimeHeaders.parseHeaders(block, { maxLength: Number.NaN })).toThrow(RangeError)
  })
})
