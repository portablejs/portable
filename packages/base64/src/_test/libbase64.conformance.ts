import { describe, expect, test } from 'vite-plus/test'
import { DecoderStream, EncoderStream, decode, InvalidInputError, encode } from '../index.js'
import alice from './fixtures/alice.txt?raw'
import {
  chunked,
  collect,
  concat,
  decodeStream,
  encodedLike,
  encodeStream,
  fromChunks,
  latin1,
  randomBytes,
  randomChunkSizes,
  referenceDecode,
  referenceEncode,
  referenceWrap,
  text,
  utf8,
} from './utils.js'

const encodeFixtures = [
  ['abcd= ÕÄÖÜ', 'YWJjZD0gw5XDhMOWw5w='],
  ['foo bar  ', 'Zm9vIGJhciAg'],
  ['foo bar\t\t', 'Zm9vIGJhcgkJ'],
  ['foo \r\nbar', 'Zm9vIA0KYmFy'],
] as const

const decodeFixtures = [['foo bar\r\nbaz\r\n', 'Zm9v\r\nIGJhcg0\r\nKYmF6DQo=']] as const

const wrapFixture = [
  'dGVyZSwgdGVyZSwgdmFuYSBrZXJlLCBrdWlkYXMgc3VsIGzDpGhlYj8=',
  'dGVyZSwgdGVyZSwgdmFu\r\nYSBrZXJlLCBrdWlkYXMg\r\nc3VsIGzDpGhlYj8=',
] as const

const streamFixture = [
  '123456789012345678  90\r\nõäöüõäöüõäöüõäöüõäöüõäöüõäöüõäöü another line === ',
  'MTIzNDU2N\r\nzg5MDEyMz\r\nQ1Njc4ICA\r\n5MA0Kw7XD\r\npMO2w7zDt\r\ncOkw7bDvM\r\nO1w6TDtsO\r\n8w7XDpMO2\r\nw7zDtcOkw\r\n7bDvMO1w6\r\nTDtsO8w7X\r\nDpMO2w7zD\r\ntcOkw7bDv\r\nCBhbm90aG\r\nVyIGxpbmU\r\ngPT09IA==',
] as const

const mime = { mode: 'mime' } as const

describe('libbase64', () => {
  describe('encode', () => {
    test('encodes a string as UTF-8', () => {
      for (const [input, expected] of encodeFixtures) expect(encode(input)).toBe(expected)
    })

    test('encodes bytes', () => {
      expect(encode(new Uint8Array([0x00, 0x01, 0x02, 0x20, 0x03]))).toBe('AAECIAM=')
    })

    test('encodes a view into a larger buffer', () => {
      const buffer = new Uint8Array([0xff, 0x00, 0x01, 0x02, 0x20, 0x03, 0xff]).buffer
      expect(encode(new Uint8Array(buffer, 1, 5))).toBe('AAECIAM=')
    })
  })

  describe('decode', () => {
    test('decodes base64, skipping line breaks', () => {
      for (const [expected, input] of [...encodeFixtures, ...decodeFixtures])
        expect(text(decode(input))).toBe(expected)
    })

    test('decodes empty input to no bytes', () => {
      expect(decode('')).toEqual(new Uint8Array(0))
      expect(decode('', mime)).toEqual(new Uint8Array(0))
    })

    test("skips characters outside Latin-1 in 'mime' mode", () => {
      expect(text(decode('YWŁJj⁢', mime))).toBe('abc')
      expect(text(decode('YWJjŁ=YWJj', mime))).toBe('abcabc')
    })
  })

  describe('wrap', () => {
    test('wraps long lines', () => {
      expect(encode(decode(wrapFixture[0]), { lineLength: 20 })).toBe(wrapFixture[1])
    })

    test('matches line based wrapping', () => {
      const reference = (str: string, lineLength: number) =>
        str.replace(new RegExp('.{' + lineLength + '}', 'g'), '$&\r\n').trim()
      for (const length of [0, 1, 57, 58, 300]) {
        const data = randomBytes(length, length)
        for (const lineLength of [1, 5, 76])
          expect(encode(data, { lineLength })).toBe(reference(encode(data), lineLength))
      }
    })

    test('rejects a line length that is not a positive integer', () => {
      for (const lineLength of [-10, -1, 0, 0.5, 2.5, Infinity, NaN])
        expect(() => encode('tere', { lineLength })).toThrow(RangeError)
    })

    test('wraps empty input to an empty string', () => {
      expect(encode(new Uint8Array(0), { lineLength: 10 })).toBe('')
    })
  })

  describe('streams', () => {
    test('encodes bytes written one at a time', async () => {
      const chunks = chunked(utf8(streamFixture[0]), 1)
      expect(await encodeStream(chunks, { lineLength: 9 })).toBe(streamFixture[1])
    })

    test('decodes base64 written one byte at a time', async () => {
      const chunks = chunked(utf8(streamFixture[1]), 1)
      expect(text(await decodeStream(chunks))).toBe(streamFixture[0])
    })

    test('encodes and decodes a file', async () => {
      const bytes = utf8(alice)
      const output = fromChunks(chunked(bytes, 16384))
        .pipeThrough(new EncoderStream({ lineLength: 76 }))
        .pipeThrough(new DecoderStream())
      expect(concat(await collect(output))).toEqual(bytes)
    })

    test('encodes string chunks as UTF-8', async () => {
      expect(await encodeStream([new Uint8Array([0xf5]), 'õ'])).toBe(
        encode(new Uint8Array([0xf5, 0xc3, 0xb5])),
      )
    })
  })

  describe('decoder input', () => {
    test("skips 8-bit bytes in 'mime' mode", async () => {
      const input = concat([utf8('YW'), utf8('é'), utf8('Jj'), new Uint8Array([0xc1, 0xd1, 0xe2])])
      expect(text(decode(input, mime))).toBe('abc')
      for (const size of [1, 2, 3, input.length])
        expect(text(await decodeStream(chunked(input, size), mime))).toBe('abc')
    })

    test("skips whitespace and other characters outside the alphabet in 'mime' mode", async () => {
      const input = utf8(' YW\tJj\r\n.ZG!Vm\r\n')
      expect(text(await decodeStream(chunked(input, 3), mime))).toBe('abcdef')
    })

    test('decodes an unpadded tail when the stream ends', async () => {
      const cases = [
        ['YWJjZA', 'abcd', {}],
        ['YWJjZGU', 'abcde', {}],
        ['YW', 'a', {}],
        ['YQ==YWI', 'aab', mime],
      ] as const
      for (const [input, expected, options] of cases) {
        expect(text(decode(input, options))).toBe(expected)
        for (const size of [1, 2, 3, input.length])
          expect(text(await decodeStream(chunked(utf8(input), size), options))).toBe(expected)
      }
    })

    test('decodes input without base64 characters to nothing', async () => {
      for (const input of ['\r\n', '====', ' \t.!']) {
        expect(decode(input, mime)).toHaveLength(0)
        expect(await decodeStream(chunked(utf8(input), 1), mime)).toHaveLength(0)
      }
      expect(await decodeStream(['\r\n'])).toHaveLength(0)
    })

    test('ignores empty chunks', async () => {
      expect(text(await decodeStream(chunked(utf8('YWJj'), [0, 4])))).toBe('abc')
    })
  })

  describe('padding inside the input', () => {
    const paddedLines = 'YQ==\r\nYg==\r\nYw=='

    test("decodes padded lines concatenated in 'mime' mode", () => {
      expect(text(decode(paddedLines, mime))).toBe('abc')
      expect(text(decode('YQ==Yg==Yw==', mime))).toBe('abc')
      expect(text(decode('YWI=YWJj', mime))).toBe('ababc')
      expect(() => decode(paddedLines)).toThrow(InvalidInputError)
    })

    test("decodes padded segments separated by whitespace in 'mime' mode", () => {
      expect(text(decode('YQ== \r\n\t Yg=\r\n= Yw', mime))).toBe('abc')
    })

    test('stream decodes padded lines with any chunk size', async () => {
      const input = utf8(paddedLines)
      for (let size = 1; size <= input.length; size++)
        expect(text(await decodeStream(chunked(input, size), mime))).toBe('abc')
    })

    test('stream decodes padding split across chunks', async () => {
      const input = utf8('YWJjZA==\r\nZWY=')
      expect(text(await decodeStream(chunked(input, [7, 5, 1, 1]), mime))).toBe('abcdef')
      expect(text(await decodeStream(chunked(utf8('YWJjZA=\r\n='), [7, 2, 1])))).toBe('abcd')
    })

    test('round trips random data through both streams', { timeout: 60_000 }, async () => {
      const data = randomBytes(100 * 1024, 1)
      for (const size of [3, 4, 5, 7, 76, 78, 1000, 4096, 65536]) {
        const encoded = await encodeStream(chunked(data, size), { lineLength: 76 })
        expect(await decodeStream(chunked(encoded, size))).toEqual(data)
      }
    })

    test('decodes every input like segment by segment decoding', () => {
      const alphabet = 'AAAAQQQQYWJjZ+/-_====  \r\n\t.!é'
      for (let i = 0; i < 20000; i++) {
        const bytes = randomBytes(i % 40, i)
        const input = Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join('')
        expect(decode(input, mime)).toEqual(referenceDecode(input))
      }
    })

    test('round trips separately encoded parts', async () => {
      const parts = [1, 2, 3, 100].map((length) => randomBytes(length, length))
      const input = parts.map((part) => encode(part)).join('\r\n')
      const expected = concat(parts)
      expect(decode(input, mime)).toEqual(expected)
      for (const size of [1, 2, 3, 5, 16, input.length])
        expect(await decodeStream(chunked(input, size), mime)).toEqual(expected)
    })
  })

  describe('encoder output', () => {
    test('does not depend on how the input is chunked', async () => {
      for (const length of [0, 1, 2, 3, 57, 114, 1140, 1141, 5000]) {
        const data = randomBytes(length, length)
        const expected = encode(data, { lineLength: 76 })
        for (const sizes of [[1], [3], [57], [1139, 1], [100, 14], [length || 1]])
          expect(await encodeStream(chunked(data, sizes), { lineLength: 76 })).toBe(expected)
      }
    })

    test('never ends with a line ending', async () => {
      for (const lineLength of [1, 3, 4, 76]) {
        const data = randomBytes(lineLength * 3, lineLength)
        const output = await encodeStream(chunked(data, 1), { lineLength })
        expect(output.endsWith('\r\n')).toBe(false)
        expect(output).toBe(encode(data, { lineLength }))
      }
    })

    test('rejects a line length that is not a positive integer', () => {
      for (const lineLength of [2.5, 76.9, 0.5, Infinity, -3])
        expect(() => new EncoderStream({ lineLength })).toThrow(RangeError)
    })

    test('ignores empty chunks', async () => {
      expect(await encodeStream(chunked(utf8('abcdef'), [2, 0, 4]), { lineLength: 4 })).toBe(
        'YWJj\r\nZGVm',
      )
    })

    test('does not wrap when lineLength is false', async () => {
      const data = randomBytes(500, 5)
      expect(await encodeStream(chunked(data, [7, 3]), { lineLength: false })).toBe(encode(data))
      expect(await encodeStream(chunked(data, [7, 3]))).toBe(encode(data))
    })
  })
})

describe('libbase64 properties', () => {
  const runs = 200

  test('encode matches the reference encoder', () => {
    for (let seed = 0; seed < runs; seed++) {
      const data = randomBytes((seed * 37) % 4000, seed)
      expect(encode(data)).toBe(referenceEncode(data))
    }
  })

  test('encode of a string encodes its UTF-8 bytes', () => {
    for (let seed = 0; seed < runs; seed++) {
      const input = String.fromCharCode(...randomBytes(seed % 300, seed))
      expect(encode(input)).toBe(referenceEncode(utf8(input)))
    }
  })

  test('decode reverses encode, also for wrapped and separately padded parts', () => {
    for (let seed = 0; seed < runs; seed++) {
      const parts = Array.from({ length: seed % 5 }, (_, i) =>
        randomBytes((seed * i) % 30, seed + i),
      )
      const data = concat(parts)
      const lineLength = 1 + (seed % 200)
      expect(decode(encode(data))).toEqual(data)
      expect(decode(encode(data, { lineLength }))).toEqual(data)
      expect(decode(parts.map((part) => encode(part)).join('\r\n'), mime)).toEqual(data)
    }
  })

  test("'mime' decode matches the reference decoder for any input", () => {
    for (let seed = 0; seed < runs; seed++) {
      const input = encodedLike(seed, 200)
      expect(decode(input, mime)).toEqual(referenceDecode(input))
    }
  })

  test("the 'mime' decoder stream matches decode for any input and chunking", async () => {
    for (let seed = 0; seed < runs; seed++) {
      const input = encodedLike(seed)
      const output = await decodeStream(chunked(input, randomChunkSizes(seed)), mime)
      expect(output).toEqual(referenceDecode(input))
    }
  })

  test('the encoder stream matches encode for any chunking and line length', async () => {
    for (let seed = 0; seed < runs; seed++) {
      const data = randomBytes((seed * 37) % 4000, seed)
      const lineLength = seed % 4 === 0 ? 76 : 1 + (seed % 200)
      const output = await encodeStream(chunked(data, randomChunkSizes(seed)), { lineLength })
      expect(output).toBe(referenceWrap(referenceEncode(data), lineLength))
    }
  })

  test('the encoder stream without wrapping matches encode', async () => {
    for (let seed = 0; seed < runs; seed++) {
      const data = randomBytes((seed * 37) % 4000, seed)
      expect(await encodeStream(chunked(data, randomChunkSizes(seed)))).toBe(referenceEncode(data))
    }
  })

  test('wrapping splits base64 into lines of the line length', () => {
    for (let seed = 0; seed < runs; seed++) {
      const data = randomBytes((seed * 37) % 4000, seed)
      const lineLength = 1 + (seed % 200)
      const wrapped = encode(data, { lineLength })
      expect(wrapped).toBe(referenceWrap(referenceEncode(data), lineLength))
      expect(wrapped.replaceAll('\r\n', '')).toBe(referenceEncode(data))
      expect(wrapped.endsWith('\r\n')).toBe(false)
    }
  })

  test('the decoder stream delivers everything to a slow reader', async () => {
    for (let seed = 0; seed < 20; seed++) {
      const data = randomBytes((seed * 397) % 4000, seed)
      const input = encode(data, { lineLength: 76 })
      const stream = fromChunks(chunked(latin1(input), randomChunkSizes(seed))).pipeThrough(
        new DecoderStream(),
      )
      const received = await collect(stream, () => new Promise((resolve) => setTimeout(resolve, 0)))
      expect(concat(received)).toEqual(data)
    }
  })
})
