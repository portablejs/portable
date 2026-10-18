import { describe, expect, test } from 'vite-plus/test'
import { createDecoder } from '../decode.js'
import { encodeFallback } from '../encode.js'
import {
  type Alphabet,
  EncoderStream,
  decode,
  InvalidInputError,
  TruncatedError,
  encode,
  type Mode,
} from '../index.js'
import {
  chunked,
  collect,
  decodeStream,
  encodedLike,
  encodeStream,
  fromChunks,
  random,
  randomBytes,
  randomChunkSizes,
  referenceEncode,
  referenceWrap,
  text,
  utf8,
} from './utils.js'

const fail = (fn: () => unknown) => {
  try {
    return fn()
  } catch (error) {
    return error
  }
}

/** The bytes, or the error's name. */
const outcome = (result: unknown) => (result instanceof Error ? result.name : result)

/** The bytes, or `'error'` for any error, because the native `SyntaxError` has no subclasses. */
const nativeOutcome = (result: unknown) => (result instanceof Error ? 'error' : result)

/** Valid base64 from random bytes, then edited the ways real input differs: whitespace, missing padding, a stray character. */
function mostlyValid(seed: number, alphabet: Alphabet): string {
  const next = random(seed)
  const data = randomBytes(Math.floor(next() * 40), seed)
  let input = encode(data, { alphabet, omitPadding: next() < 0.3 })
  const edits = Math.floor(next() * 4)
  for (let i = 0; i < edits; i++) {
    const at = Math.floor(next() * (input.length + 1))
    const insert = ' \t\n\f\r=-_+/.Aé'[Math.floor(next() * 14)]!
    input = input.slice(0, at) + insert + input.slice(at)
  }
  return input
}

describe('encode', () => {
  test('uses the base64url alphabet', () => {
    expect(encode(new Uint8Array([0xfb, 0xff, 0xbf]), { alphabet: 'base64url' })).toBe('-_-_')
    expect(encode(new Uint8Array([0xfb, 0xff]), { alphabet: 'base64url' })).toBe('-_8=')
  })

  test('omits padding', () => {
    expect(encode('a', { omitPadding: true })).toBe('YQ')
    expect(encode('ab', { omitPadding: true })).toBe('YWI')
    expect(encode('abc', { omitPadding: true })).toBe('YWJj')
  })

  test('joins lines with lineEnding', () => {
    expect(encode('abcdef', { lineLength: 4, lineEnding: '\n' })).toBe('YWJj\nZGVm')
  })

  test('adds no line ending when the output fills the last line exactly', () => {
    expect(encode(new Uint8Array(57), { lineLength: 76 })).toBe('A'.repeat(76))
  })

  test('rejects an unknown alphabet', () => {
    expect(() => encode('a', { alphabet: 'base32' as Alphabet })).toThrow(TypeError)
  })
})

describe('decode', () => {
  test("skips ASCII whitespace anywhere in 'loose' mode", () => {
    expect(text(decode(' Y\tW\nJ\fj\rZA = = '))).toBe('abcd')
  })

  test("accepts missing padding and non-zero bits before it in 'loose' mode", () => {
    expect(text(decode('YQ'))).toBe('a')
    expect(text(decode('YR=='))).toBe('a')
    expect(text(decode('YWI'))).toBe('ab')
  })

  test("rejects invalid characters and padding in 'loose' mode", () => {
    for (const input of ['YQ=.', 'YQ===', 'YQ==YQ==', '=', 'YW*j', 'YWJé', 'YW-j', 'Ł'])
      expect(() => decode(input)).toThrow(InvalidInputError)
    expect(() => decode('YW+j', { alphabet: 'base64url' })).toThrow(InvalidInputError)
  })

  test("rejects input that ends inside a group in 'loose' mode", () => {
    for (const input of ['Y', 'YWJjZ', 'YQ=', 'YQ= \r\n'])
      expect(() => decode(input)).toThrow(TruncatedError)
  })

  test("requires padding and zero bits before it in 'strict' mode", () => {
    expect(text(decode('YQ==\r\n', { mode: 'strict' }))).toBe('a')
    expect(text(decode('YWJj', { mode: 'strict' }))).toBe('abc')
    for (const input of ['YQ', 'YWI'])
      expect(() => decode(input, { mode: 'strict' })).toThrow(TruncatedError)
    for (const input of ['YR==', 'YWJ='])
      expect(() => decode(input, { mode: 'strict' })).toThrow(InvalidInputError)
  })

  test("never throws in 'mime' mode", () => {
    for (let seed = 0; seed < 200; seed++)
      expect(decode(encodedLike(seed, 100), { mode: 'mime' })).toBeInstanceOf(Uint8Array)
  })

  test('reads bytes as base64 text', () => {
    expect(text(decode(utf8('YWJj\r\n')))).toBe('abc')
  })

  test('throws errors with namespaced names', () => {
    expect(fail(() => decode('*'))).toMatchObject({ name: 'Base64.InvalidInputError' })
    expect(fail(() => decode('Y'))).toMatchObject({ name: 'Base64.TruncatedError' })
  })

  test('rejects an unknown mode', () => {
    expect(() => decode('', { mode: 'lenient' as Mode })).toThrow(TypeError)
  })
})

describe('EncoderStream', () => {
  test('encodes base64url without padding', async () => {
    const data = randomBytes(1000, 3)
    const options = { alphabet: 'base64url', omitPadding: true } as const
    expect(await encodeStream(chunked(data, [1, 7, 64]), options)).toBe(encode(data, options))
  })

  test('joins lines with lineEnding across chunks', async () => {
    const data = randomBytes(500, 4)
    const options = { lineLength: 10, lineEnding: '\n' } as const
    expect(await encodeStream(chunked(data, 1), options)).toBe(encode(data, options))
  })

  test('wraps large chunks at any line length and line ending', async () => {
    const data = randomBytes(5000, 6)
    for (const lineLength of [1, 7, 76, 1000])
      for (const lineEnding of ['\r\n', '\n', ' é '])
        for (const omitPadding of [false, true]) {
          const options = { lineLength, lineEnding, omitPadding }
          const expected = referenceWrap(
            referenceEncode(data).replace(/=+$/, omitPadding ? '' : '$&'),
            lineLength,
            lineEnding,
          )
          expect(await encodeStream(chunked(data, [700, 1001, 650]), options)).toBe(expected)
          expect(encode(data, options)).toBe(expected)
        }
  })

  test('encodes a surrogate pair split across string chunks', async () => {
    expect(await encodeStream(['a\uD842', '\uDFB7b'])).toBe(encode('a𠮷b'))
  })

  test('encodes a lone high surrogate at the end as U+FFFD', async () => {
    expect(await encodeStream(['a\uD842'])).toBe(encode('a�'))
    expect(await encodeStream(['a\uD842', utf8('b')])).toBe(encode('a�b'))
  })

  test('emits nothing for empty input', async () => {
    expect(await collect(fromChunks([]).pipeThrough(new EncoderStream()))).toEqual([])
  })
})

describe('DecoderStream', () => {
  test('decodes string and byte chunks', async () => {
    expect(text(await decodeStream(['YW', utf8('Jj'), 'ZA==']))).toBe('abcd')
  })

  test("errors on invalid input in 'loose' mode", async () => {
    await expect(decodeStream(['YWJj', '*'])).rejects.toThrow(InvalidInputError)
    await expect(decodeStream(['YQ==', '\r\nYQ=='])).rejects.toThrow(InvalidInputError)
    await expect(decodeStream(['YWJj', 'Y'])).rejects.toThrow(TruncatedError)
  })

  test("errors at the end when padding is missing in 'strict' mode", async () => {
    await expect(decodeStream(['YW', 'Jj', 'YQ'], { mode: 'strict' })).rejects.toThrow(
      TruncatedError,
    )
  })

  test('decodes a UTF-8 sequence split across byte chunks in mime mode', async () => {
    const input = utf8('YWéJj')
    expect(text(await decodeStream(chunked(input, 1), { mode: 'mime' }))).toBe('abc')
  })

  for (const mode of ['loose', 'strict', 'mime'] as const) {
    for (const alphabet of ['base64', 'base64url'] as const) {
      test(`matches decode for any chunking, ${mode} ${alphabet}`, async () => {
        for (let seed = 0; seed < 300; seed++) {
          const input = mostlyValid(seed, alphabet)
          const expected = fail(() => decode(input, { mode, alphabet }))
          const actual = await decodeStream(chunked(input, randomChunkSizes(seed, 8)), {
            mode,
            alphabet,
          }).catch((error: unknown) => error)
          expect(outcome(actual)).toEqual(outcome(expected))
        }
      })
    }
  }
})

type Native = {
  toBase64?: (this: Uint8Array, options: object) => string
  fromBase64?: (text: string, options: object) => Uint8Array
}
const native: Native = {
  toBase64: Reflect.get(Uint8Array.prototype, 'toBase64'),
  fromBase64: Reflect.get(Uint8Array, 'fromBase64'),
}

describe.runIf(native.toBase64 && native.fromBase64)('fallback matches the native API', () => {
  test('encodes like Uint8Array.prototype.toBase64', () => {
    for (let seed = 0; seed < 300; seed++) {
      const data = randomBytes(seed < 200 ? seed : seed * 31, seed)
      for (const alphabet of ['base64', 'base64url'] as const)
        for (const omitPadding of [false, true])
          expect(encodeFallback(data, alphabet, omitPadding)).toBe(
            native.toBase64!.call(data, { alphabet, omitPadding }),
          )
    }
  })

  test('decodes like Uint8Array.fromBase64', () => {
    for (let seed = 0; seed < 1000; seed++) {
      for (const alphabet of ['base64', 'base64url'] as const) {
        for (const lastChunkHandling of ['loose', 'strict'] as const) {
          const input = mostlyValid(seed, alphabet)
          const expected = fail(() => native.fromBase64!(input, { alphabet, lastChunkHandling }))
          const actual = fail(() => createDecoder(alphabet, lastChunkHandling)(input, true))
          expect(nativeOutcome(actual)).toEqual(nativeOutcome(expected))
        }
      }
    }
  })
})

describe('known upstream issues', () => {
  test('base64-js #81 and #47: a character outside the alphabet is rejected, not dropped', () => {
    expect(() => decode('G\x7F==')).toThrow(InvalidInputError)
    expect(decode('G\x7F==', { mode: 'mime' })).toEqual(new Uint8Array(0))
  })

  test('base64-js #73: input of only padding', () => {
    expect(() => decode('====')).toThrow(InvalidInputError)
    expect(decode('====', { mode: 'mime' })).toEqual(new Uint8Array(0))
  })

  test('base64-js #45: unpadded input decodes', () => {
    expect(decode('HI')).toEqual(new Uint8Array([0x1c]))
  })

  test('base64-js #31: line breaks are skipped', () => {
    expect(text(decode('YWJj\r\nZGVm\nZw=='))).toBe('abcdefg')
  })

  test('base64-js #38 and #43: typed arrays other than Uint8Array are rejected', () => {
    const digest = new Int8Array([-101, -113, 0, 1])
    expect(() => encode(digest as unknown as Uint8Array)).toThrow(TypeError)
    expect(encode(new Uint8Array(digest.buffer))).toBe('m48AAQ==')
  })

  test('base64-js #44: base64 given as bytes decodes', () => {
    expect(text(decode(utf8('YWJj\n')))).toBe('abc')
  })

  test('js-base64 #164: omitPadding removes every padding character', () => {
    const input = 'asdfasdsdfsdf'
    expect(encode(input, { omitPadding: true })).toBe(encode(input).replace(/=+$/, ''))
    expect(encode(input, { omitPadding: true })).not.toContain('=')
  })

  test('js-base64 #176: a JWT segment decodes as unpadded base64url', () => {
    const header = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9'
    expect(text(decode(header, { alphabet: 'base64url' }))).toBe('{"alg":"HS256","typ":"JWT"}')
    expect(() => decode(`${header}.e30`, { alphabet: 'base64url' })).toThrow(InvalidInputError)
  })

  test('js-base64 #170: multi-byte characters split across chunks encode as one string', async () => {
    const input = '我们'.repeat(100)
    for (const size of [1, 2, 4])
      expect(await encodeStream(chunked(utf8(input), size))).toBe(encode(input))
  })

  test('libbase64 1.3.3: many padded segments decode into one buffer of the right size', () => {
    const decoded = decode('AA==\r\n'.repeat(400_000), { mode: 'mime' })
    expect(decoded.length).toBe(400_000)
    expect(decoded.buffer.byteLength).toBe(400_000)
  })

  test('decode returns a buffer of exactly the decoded length', () => {
    const decoded = decode('YW Jj\r\nZA==')
    expect(decoded.buffer.byteLength).toBe(decoded.length)
  })
})
