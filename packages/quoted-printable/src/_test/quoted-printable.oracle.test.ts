import { Buffer } from 'node:buffer'
import { Readable } from 'node:stream'
import { buffer } from 'node:stream/consumers'
import libqp2Module from 'libqp'
import { describe, expect, test } from 'vite-plus/test'
import { decode, encode } from '../index.js'
import * as libqp from './fixtures/libqp-3.0.1.js'
import {
  decodeStream,
  encodeStream,
  random,
  randomBytes,
  randomQuotedPrintable,
  randomSizes,
  randomText,
  split,
} from './utils.js'

// @types/libqp describes libqp 1.x, which took fewer input types than 2.1.3 does.
const libqp2 = libqp2Module as unknown as {
  encode: (input: Uint8Array | string) => string
  decode: (input: Uint8Array | string) => Uint8Array
}

const runs = 300
const lineLengths = [4, 5, 6, 7, 8, 10, 16, 20, 33, 76, 100]

async function viaLibqpEncoder(
  chunks: readonly Uint8Array[],
  options: { lineLength: number | false; binary?: boolean },
): Promise<string> {
  const encoder = new libqp.Encoder(options)
  return (
    await buffer(Readable.from(chunks.map((chunk) => Buffer.from(chunk))).pipe(encoder))
  ).toString()
}

async function viaLibqpDecoder(chunks: readonly Uint8Array[]): Promise<Uint8Array> {
  const decoder = new libqp.Decoder()
  return new Uint8Array(
    await buffer(Readable.from(chunks.map((chunk) => Buffer.from(chunk))).pipe(decoder)),
  )
}

const bytesOf = (value: Uint8Array) => new Uint8Array(value)

// libqp 2.1.3 kept a hyphen after a lone CR literal; 3.0.1 escapes it.
const escapeHyphenAfterCr = (encoded: string) => encoded.replaceAll('\r-', '\r=2D')

describe('encode() matches libqp 3.0.1 wrap(encode())', () => {
  test('random bytes at every line length', () => {
    const next = random(1)
    for (let run = 0; run < runs; run++) {
      const input = randomBytes(next, 300)
      for (const lineLength of lineLengths)
        expect(encode(input, { lineLength })).toBe(libqp.wrap(libqp.encode(input), lineLength))
      expect(encode(input, { lineLength: false })).toBe(libqp.encode(input))
    }
  })

  test('random text with multi-byte characters and whitespace', () => {
    const next = random(2)
    for (let run = 0; run < runs; run++) {
      const input = randomText(next, 120)
      for (const lineLength of lineLengths)
        expect(encode(input, { lineLength })).toBe(libqp.wrap(libqp.encode(input), lineLength))
    }
  })

  test('long lines of prose', () => {
    const next = random(3)
    const words = ['the', 'quick', 'brown', 'fox,', 'jõgeva', 'naïve', '€uro', '—', 'end.', '?!']
    for (let run = 0; run < 50; run++) {
      let input = ''
      for (let i = 0; i < 400; i++)
        input += words[Math.floor(next() * words.length)]! + (next() < 0.05 ? '\r\n' : ' ')
      for (const lineLength of lineLengths)
        expect(encode(input, { lineLength })).toBe(libqp.wrap(libqp.encode(input), lineLength))
    }
  })

  test('binary matches the libqp Encoder with binary set', async () => {
    const next = random(4)
    for (let run = 0; run < runs; run++) {
      const input = randomBytes(next, 200)
      const lineLength = lineLengths[run % lineLengths.length]!
      expect(encode(input, { binary: true, lineLength })).toBe(
        await viaLibqpEncoder([input], { binary: true, lineLength }),
      )
      expect(encode(input, { binary: true, lineLength: false })).toBe(
        await viaLibqpEncoder([input], { binary: true, lineLength: false }),
      )
    }
  })
})

describe('streams match libqp 3.0.1 with random chunking', () => {
  test('QuotedPrintableEncoderStream', async () => {
    const next = random(5)
    for (let run = 0; run < runs; run++) {
      const input =
        run % 2 ? randomBytes(next, 200) : new TextEncoder().encode(randomText(next, 80))
      const chunks = split(input, randomSizes(next))
      const lineLength = run % 5 === 0 ? false : lineLengths[run % lineLengths.length]!
      const binary = run % 3 === 0
      const expected = await viaLibqpEncoder([input], { lineLength, binary })
      expect(await encodeStream(chunks, { lineLength, binary })).toBe(expected)
      expect(await viaLibqpEncoder(chunks, { lineLength, binary })).toBe(expected)
    }
  })

  test('QuotedPrintableDecoderStream', async () => {
    const next = random(6)
    for (let run = 0; run < runs; run++) {
      const input = run % 2 ? randomQuotedPrintable(next, 80) : randomBytes(next, 200)
      const chunks = split(input, randomSizes(next))
      expect(await decodeStream(chunks)).toEqual(await viaLibqpDecoder(chunks))
    }
  })
})

describe('decode() matches libqp', () => {
  test('quoted-printable-like input', () => {
    const next = random(7)
    for (let run = 0; run < runs * 3; run++) {
      const input = randomQuotedPrintable(next, 120)
      expect(decode(input)).toEqual(bytesOf(libqp.decode(input)))
      expect(decode(input)).toEqual(bytesOf(libqp2.decode(Buffer.from(input))))
    }
  })

  test('arbitrary bytes', () => {
    const next = random(8)
    for (let run = 0; run < runs; run++) {
      const input = randomBytes(next, 300)
      expect(decode(input)).toEqual(bytesOf(libqp.decode(input)))
    }
  })

  test('ASCII strings', () => {
    const next = random(9)
    for (let run = 0; run < runs; run++) {
      const input = Buffer.from(randomQuotedPrintable(next, 120).map((b) => b & 0x7f)).toString(
        'latin1',
      )
      expect(decode(input)).toEqual(bytesOf(libqp.decode(input)))
    }
  })
})

describe('matches libqp 2.1.3 where 3.0.1 did not change the output', () => {
  test('encode() without line breaks', () => {
    const next = random(10)
    for (let run = 0; run < runs; run++) {
      const input = run % 2 ? randomBytes(next, 300) : randomText(next, 120)
      expect(encode(input, { lineLength: false })).toBe(escapeHyphenAfterCr(libqp2.encode(input)))
    }
  })

  test('decode() round trips our output to the same bytes', () => {
    const next = random(11)
    for (let run = 0; run < runs; run++) {
      const input = randomBytes(next, 300)
      expect(bytesOf(libqp2.decode(encode(input)))).toEqual(input)
    }
  })
})
