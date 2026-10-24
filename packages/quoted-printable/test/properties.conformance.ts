import { describe, expect, test } from 'vite-plus/test'
import { decode, encode } from '@portable/quoted-printable'
import {
  decodeStream,
  encodeStream,
  latin1,
  random,
  randomBytes,
  randomQuotedPrintable,
  randomSizes,
  randomText,
  split,
  utf8,
} from './utils.js'

// Ported from libqp 3.0.1 test/property-test.ts. libqp generates inputs with fast-check; these
// tests draw them from a seeded generator instead, so a failure reproduces on every run.

const runs = 200
const lineLengths = [4, 5, 6, 7, 9, 13, 20, 40, 76, 100]

// Characters the format allows, escapes with uppercase hex digits, no whitespace in front of a
// line break or at the end, and no line that starts with a hyphen.
const malformed = [/[^\t\r\n\x20-\x7e]/, /[=](?![0-9A-F]{2}|\r\n)/, /[ \t](?:\r|\n|$)/, /(?:^|\n)-/]

const problems = (output: string) => malformed.filter((pattern) => pattern.test(output))

const linesOf = (output: string) => output.split(/\r\n|\r|\n/)

const isUtf8 = (bytes: Uint8Array) => {
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(bytes)
    return true
  } catch {
    return false
  }
}

// A decoder written from RFC 2045, independent of the one in src: strip whitespace at the end of
// every line, drop soft line breaks, then read =XX escapes left to right.
function modelDecode(input: Uint8Array): Uint8Array {
  const isWhitespace = (c: number | undefined) => c === 0x20 || c === 0x09
  const isBreak = (c: number | undefined) => c === undefined || c === 0x0a || c === 0x0d
  const stripped = new Array<number>()
  for (let i = 0; i < input.length; i++) {
    if (isWhitespace(input[i])) {
      let end = i
      while (isWhitespace(input[end])) end++
      if (!isBreak(input[end])) stripped.push(...input.subarray(i, end))
      i = end - 1
      continue
    }
    stripped.push(input[i]!)
  }
  const joined = new Array<number>()
  for (let i = 0; i < stripped.length; i++) {
    if (stripped[i] === 0x3d) {
      if (i === stripped.length - 1) continue
      if (stripped[i + 1] === 0x0a) {
        i++
        continue
      }
      if (stripped[i + 1] === 0x0d && stripped[i + 2] === 0x0a) {
        i += 2
        continue
      }
    }
    joined.push(stripped[i]!)
  }
  const isHex = (c: number | undefined) =>
    c !== undefined && /^[0-9a-fA-F]$/.test(String.fromCharCode(c))
  const output = new Array<number>()
  for (let i = 0; i < joined.length; i++) {
    if (joined[i] === 0x3d && isHex(joined[i + 1]) && isHex(joined[i + 2])) {
      output.push(parseInt(String.fromCharCode(joined[i + 1]!, joined[i + 2]!), 16))
      i += 2
      continue
    }
    output.push(joined[i]!)
  }
  return Uint8Array.from(output)
}

describe('encode() without line breaks', () => {
  test('round trips any bytes through decode()', () => {
    const next = random(101)
    for (let run = 0; run < runs; run++) {
      const input = randomBytes(next, 300)
      expect(decode(encode(input, { lineLength: false }))).toEqual(input)
    }
  })

  test('round trips any text through decode()', () => {
    const next = random(102)
    for (let run = 0; run < runs; run++) {
      const input = randomText(next, 120)
      expect(decode(encode(input, { lineLength: false }))).toEqual(utf8(input))
    }
  })

  test('produces well-formed output', () => {
    const next = random(103)
    for (let run = 0; run < runs; run++)
      expect(problems(encode(randomBytes(next, 300), { lineLength: false }))).toEqual([])
  })

  test('keeps a printable ASCII character literal unless it is "=", a hyphen at a line start or trailing whitespace', () => {
    const next = random(104)
    const units = ['a', 'Z', '0', '.', '~', '-', ' ', '\t', '=']
    for (let run = 0; run < runs; run++) {
      let input = ''
      const length = Math.floor(next() * 20)
      for (let i = 0; i < length; i++) input += units[Math.floor(next() * units.length)]!
      const expected = input
        .replaceAll('=', '=3D')
        .replace(/^-/, '=2D')
        .replace(/ $/, '=20')
        .replace(/\t$/, '=09')
      expect(encode(input, { lineLength: false })).toBe(expected)
    }
  })

  test('treats a string as its UTF-8 bytes', () => {
    const next = random(105)
    for (let run = 0; run < runs; run++) {
      const input = randomText(next, 120)
      expect(encode(input)).toBe(encode(utf8(input)))
    }
  })
})

describe('decode()', () => {
  test('matches an independent model of the format', () => {
    const next = random(106)
    for (let run = 0; run < runs; run++) {
      const input = randomQuotedPrintable(next, 120)
      expect(decode(input)).toEqual(modelDecode(input))
    }
  })

  test('matches the model for arbitrary bytes', () => {
    const next = random(107)
    for (let run = 0; run < runs; run++) {
      const input = randomBytes(next, 300)
      expect(decode(input)).toEqual(modelDecode(input))
    }
  })

  test('reads an ASCII string the same as its bytes', () => {
    const next = random(108)
    for (let run = 0; run < runs; run++) {
      const input = randomQuotedPrintable(next, 120).map((b) => b & 0x7f)
      expect(decode(String.fromCharCode(...input))).toEqual(decode(input))
    }
  })

  test('never produces more bytes than it was given', () => {
    const next = random(109)
    for (let run = 0; run < runs; run++) {
      const input = randomBytes(next, 200)
      expect(decode(input).length).toBeLessThanOrEqual(input.length)
    }
  })
})

describe('encode() with line breaks', () => {
  test('round trips any bytes through decode()', () => {
    const next = random(110)
    for (let run = 0; run < runs; run++) {
      const input = randomBytes(next, 300)
      for (const lineLength of lineLengths)
        expect(decode(encode(input, { lineLength }))).toEqual(input)
    }
  })

  test('keeps every line within the line length', () => {
    const next = random(111)
    for (let run = 0; run < runs; run++) {
      const input = randomBytes(next, 300)
      for (const lineLength of lineLengths)
        for (const line of linesOf(encode(input, { lineLength })))
          expect(line.length).toBeLessThanOrEqual(lineLength)
    }
  })

  test('produces well-formed output', () => {
    const next = random(112)
    for (let run = 0; run < runs; run++) {
      const input = randomBytes(next, 300)
      for (const lineLength of lineLengths)
        expect(problems(encode(input, { lineLength }))).toEqual([])
    }
  })

  test('only adds soft line breaks', () => {
    const next = random(113)
    const unescapeHyphens = (value: string) => value.replaceAll('=2D', '-')
    for (let run = 0; run < runs; run++) {
      const input = randomBytes(next, 300)
      const unwrapped = encode(input, { lineLength: false })
      for (const lineLength of lineLengths)
        expect(unescapeHyphens(encode(input, { lineLength }).replaceAll('=\r\n', ''))).toBe(
          unescapeHyphens(unwrapped),
        )
    }
  })

  test('returns output that fits on a line as is', () => {
    const next = random(114)
    for (let run = 0; run < runs; run++) {
      const input = randomBytes(next, 30)
      const unwrapped = encode(input, { lineLength: false })
      for (const lineLength of lineLengths.filter((length) => length >= unwrapped.length))
        expect(encode(input, { lineLength })).toBe(unwrapped)
    }
  })

  test('breaks every line on its own', () => {
    const next = random(115)
    for (let run = 0; run < runs; run++) {
      const input = randomBytes(next, 300)
      for (const lineLength of lineLengths) {
        const lines = encode(input, { lineLength: false }).split(/(\r?\n)/)
        const expected = lines
          .map((line, i) => (i % 2 ? line : encode(decode(line), { lineLength })))
          .join('')
        expect(encode(input, { lineLength })).toBe(expected)
      }
    }
  })

  test('never splits an escape sequence', () => {
    const next = random(116)
    for (let run = 0; run < runs; run++) {
      const input = randomBytes(next, 300)
      for (const lineLength of lineLengths)
        for (const line of encode(input, { lineLength }).split('=\r\n'))
          expect(line).not.toMatch(/[=][0-9A-F]?$/)
    }
  })

  test('never splits a UTF-8 character when a line fits the longest one after an escaped hyphen', () => {
    const next = random(117)
    for (let run = 0; run < runs; run++) {
      const input = randomText(next, 120)
      for (const lineLength of [16, 20, 40, 76, 100])
        for (const line of encode(input, { lineLength }).split('=\r\n'))
          expect(isUtf8(decode(line))).toBe(true)
    }
  })
})

describe('streams', () => {
  test('the encoder stream without line breaks matches encode() however the input is split', async () => {
    const next = random(118)
    for (let run = 0; run < runs; run++) {
      const input = randomBytes(next, 300)
      expect(await encodeStream(split(input, randomSizes(next)), { lineLength: false })).toBe(
        encode(input, { lineLength: false }),
      )
    }
  })

  test('the encoder stream with line breaks matches encode() however the input is split', async () => {
    const next = random(119)
    for (let run = 0; run < runs; run++) {
      const input = randomBytes(next, 300)
      const lineLength = lineLengths[run % lineLengths.length]!
      const output = await encodeStream(split(input, randomSizes(next)), { lineLength })
      expect(output).toBe(encode(input, { lineLength }))
      expect(decode(output)).toEqual(input)
      expect(problems(output)).toEqual([])
    }
  })

  test('the binary encoder stream keeps only CRLF pairs literal and does not depend on the chunking', async () => {
    const next = random(120)
    const options = { lineLength: false, binary: true } as const
    for (let run = 0; run < runs; run++) {
      const input = randomBytes(next, 300)
      const output = await encodeStream(split(input, randomSizes(next)), options)
      expect(output).toBe(encode(input, options))
      expect(output).not.toMatch(/\r(?!\n)|(?<!\r)\n/)
      expect(decode(output)).toEqual(input)
      expect(problems(output)).toEqual([])
    }
  })

  test('the decoder stream matches decode() however the input is split', async () => {
    const next = random(121)
    for (let run = 0; run < runs; run++) {
      const input = randomQuotedPrintable(next, 120)
      expect(await decodeStream(split(input, randomSizes(next)))).toEqual(decode(input))
    }
  })

  test('the decoder stream round trips the encoder stream output', async () => {
    const next = random(122)
    for (let run = 0; run < runs; run++) {
      const input = randomBytes(next, 300)
      const encoded = await encodeStream(split(input, randomSizes(next)), { binary: run % 2 === 0 })
      expect(await decodeStream(split(latin1(encoded), randomSizes(next)))).toEqual(input)
    }
  })
})
