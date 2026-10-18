import { Buffer } from 'node:buffer'
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
  type Mailbox,
} from '../index.js'
import { pick, random } from './utils.js'

const next = random(42)
const vocabulary = [
  'the',
  'quick',
  'brown',
  'fox',
  'jumps',
  'över',
  'naïve',
  'café',
  '€5',
  'déjà',
  'vu,',
  '日本語',
  '😀',
]
const sentence = (count: number) =>
  Array.from({ length: count }, () => pick(next, vocabulary)).join(' ')

const subjects = Array.from({ length: 200 }, () => sentence(12))
const qSubjects = subjects.map((subject) => encodeWords(subject))
const bWords = subjects.map((subject) => encodeWord(subject, { encoding: 'B', maxLength: false }))
const bPayloads = bWords.map((word) => word.slice('=?UTF-8?B?'.length, -2))
const longHeader = 'Subject: ' + sentence(2000).replace(/[^\x20-\x7e]/g, 'x')

const values = Array.from({ length: 200 }, (_, i) => ({
  value: i % 2 ? 'attachment' : 'text/plain',
  params:
    i % 2
      ? { filename: sentence(8) + '.pdf', size: String(i * 1024) }
      : { charset: 'utf-8', format: 'flowed' },
}))
const builtValues = values.map((value) => formatValue(value))

const mailboxes: Mailbox[] = Array.from({ length: 500 }, (_, i) => ({
  name: i % 3 ? `User ${i}` : '',
  address: `user.${i}@example.com`,
}))
const addressList = formatAddresses(mailboxes)

const headerBlock = Array.from({ length: 200 }, (_, i) =>
  fold(`X-Header-${i}: ${sentence(20).replace(/[^\x20-\x7e]/g, 'x')}`),
).join('\r\n')

const decoder = new TextDecoder()
const encoder = new TextEncoder()

let sink = ''

describe('encoded words', () => {
  test('decodeWords of 200 Q-encoded subjects', async ({ bench }) => {
    const result = await bench.compare(
      bench('@portable/mime-headers', () => {
        for (const subject of qSubjects) decodeWords(subject)
      }),
      bench('libmime 5.4.9', () => {
        for (const subject of qSubjects) libmime.decodeWords(subject)
      }),
    )
    for (const upstream of ['libmime 5.4.9'] as const)
      expect(result.get(upstream)).not.toBeFasterThan(result.get('@portable/mime-headers'), {
        delta: 0.25,
      })
  })

  test('decodeWords of 200 B words', async ({ bench }) => {
    const result = await bench.compare(
      bench('@portable/mime-headers', () => {
        for (const word of bWords) decodeWords(word)
      }),
      bench('libmime 5.4.9', () => {
        for (const word of bWords) libmime.decodeWords(word)
      }),
      bench('Buffer and TextDecoder', () => {
        for (const payload of bPayloads) decoder.decode(Buffer.from(payload, 'base64'))
      }),
    )
    for (const upstream of ['libmime 5.4.9'] as const)
      expect(result.get(upstream)).not.toBeFasterThan(result.get('@portable/mime-headers'), {
        delta: 0.25,
      })
  })

  test('encodeWords of 200 subjects', async ({ bench }) => {
    const result = await bench.compare(
      bench('@portable/mime-headers', () => {
        for (const subject of subjects) encodeWords(subject)
      }),
      bench('libmime 5.4.9', () => {
        for (const subject of subjects) libmime.encodeWords(subject, 'Q', 75)
      }),
    )
    for (const upstream of ['libmime 5.4.9'] as const)
      expect(result.get(upstream)).not.toBeFasterThan(result.get('@portable/mime-headers'), {
        delta: 0.25,
      })
  })

  test('encodeWord in B of 200 subjects', async ({ bench }) => {
    const result = await bench.compare(
      bench('@portable/mime-headers', () => {
        for (const subject of subjects) encodeWord(subject, { encoding: 'B', maxLength: false })
      }),
      bench('libmime 5.4.9', () => {
        for (const subject of subjects) libmime.encodeWord(subject, 'B')
      }),
      bench('TextEncoder and Buffer', () => {
        for (const subject of subjects)
          sink = `=?UTF-8?B?${Buffer.from(encoder.encode(subject)).toString('base64')}?=`
      }),
    )
    for (const upstream of ['libmime 5.4.9'] as const)
      expect(result.get(upstream)).not.toBeFasterThan(result.get('@portable/mime-headers'), {
        delta: 0.25,
      })
    expect(sink).toBe(encodeWord(subjects.at(-1)!, { encoding: 'B', maxLength: false }))
  })
})

describe('folding', () => {
  test('fold of a 2000-word header', async ({ bench }) => {
    const result = await bench.compare(
      bench('@portable/mime-headers', () => {
        fold(longHeader)
      }),
      bench('libmime 5.4.9', () => {
        libmime.foldLines(longHeader, 76)
      }),
    )
    for (const upstream of ['libmime 5.4.9'] as const)
      expect(result.get(upstream)).not.toBeFasterThan(result.get('@portable/mime-headers'), {
        delta: 0.25,
      })
  })

  test('parseHeaders of 200 folded headers', async ({ bench }) => {
    const result = await bench.compare(
      bench('@portable/mime-headers', () => {
        parseHeaders(headerBlock)
      }),
      bench('libmime 5.4.9', () => {
        libmime.decodeHeaders(headerBlock)
      }),
    )
    for (const upstream of ['libmime 5.4.9'] as const)
      expect(result.get(upstream)).not.toBeFasterThan(result.get('@portable/mime-headers'), {
        delta: 0.25,
      })
  })
})

describe('header values', () => {
  test('parseValue of 200 values', async ({ bench }) => {
    const result = await bench.compare(
      bench('@portable/mime-headers', () => {
        for (const value of builtValues) parseValue(value)
      }),
      bench('libmime 5.4.9', () => {
        for (const value of builtValues) libmime.parseHeaderValue(value)
      }),
    )
    for (const upstream of ['libmime 5.4.9'] as const)
      expect(result.get(upstream)).not.toBeFasterThan(result.get('@portable/mime-headers'), {
        delta: 0.25,
      })
  })

  test('formatValue of 200 values', async ({ bench }) => {
    const result = await bench.compare(
      bench('@portable/mime-headers', () => {
        for (const value of values) formatValue(value)
      }),
      bench('libmime 5.4.9', () => {
        for (const value of values) libmime.buildHeaderValue(value)
      }),
    )
    for (const upstream of ['libmime 5.4.9'] as const)
      expect(result.get(upstream)).not.toBeFasterThan(result.get('@portable/mime-headers'), {
        delta: 0.25,
      })
  })
})

describe('addresses', () => {
  test('parseAddresses of 500 addresses', async ({ bench }) => {
    const result = await bench.compare(
      bench('@portable/mime-headers', () => {
        parseAddresses(addressList)
      }),
      bench('addressparser (nodemailer 10.1.2)', () => {
        addressparser(addressList)
      }),
      bench('email-addresses 5.0.0', () => {
        emailAddresses.parseAddressList(addressList)
      }),
    )
    for (const upstream of ['addressparser (nodemailer 10.1.2)', 'email-addresses 5.0.0'] as const)
      expect(result.get(upstream)).not.toBeFasterThan(result.get('@portable/mime-headers'), {
        delta: 0.25,
      })
  })

  test('parseAddresses in strict mode of 500 addresses', async ({ bench }) => {
    const result = await bench.compare(
      bench('@portable/mime-headers', () => {
        parseAddresses(addressList, { strict: true })
      }),
      bench('email-addresses 5.0.0', () => {
        emailAddresses.parseAddressList(addressList)
      }),
    )
    for (const upstream of ['email-addresses 5.0.0'] as const)
      expect(result.get(upstream)).not.toBeFasterThan(result.get('@portable/mime-headers'), {
        delta: 0.25,
      })
  })
})
