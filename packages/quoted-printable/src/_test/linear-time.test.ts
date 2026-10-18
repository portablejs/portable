import { describe, expect, test } from 'vite-plus/test'
import { decode, encode } from '../index.js'
import { decodeStream, encodeStream, split, utf8 } from './utils.js'

// Ported from libqp 3.0.1 test/complexity-test.ts. Each test times an adversarial input at two
// sizes eight times apart: linear work takes about 8 times as long for the larger one, quadratic
// work 64 times. The best of seven runs is compared, so a garbage collection doesn't fail a test.

const scale = 8
const maxRatio = 24

async function bestOf(run: () => unknown): Promise<number> {
  let best = Infinity
  for (let i = 0; i < 7; i++) {
    const start = performance.now()
    await run()
    best = Math.min(best, performance.now() - start)
  }
  return best
}

async function slowdown<T>(
  size: number,
  make: (size: number) => T,
  run: (input: T) => unknown,
): Promise<number> {
  const small = make(size)
  const large = make(size * scale)
  await run(small)
  return (await bestOf(() => run(large))) / Math.max(await bestOf(() => run(small)), 0.01)
}

const repeat = (unit: string) => (size: number) => unit.repeat(Math.ceil(size / unit.length))

describe('linear time', { timeout: 120_000 }, () => {
  const decodeInputs: [string, (size: number) => string][] = [
    ['a run of spaces', (size) => ' '.repeat(size) + 'x'],
    ['a run of tabs', (size) => '\t'.repeat(size) + 'x'],
    ['alternating spaces and tabs', repeat(' \t')],
    ['a run of "="', repeat('=')],
    ['soft line breaks', repeat('=\r\n')],
    ['whitespace in front of soft line breaks', repeat(' =\r\n')],
    ['incomplete escapes', repeat('=A')],
    ['escapes', repeat('=C3=B5')],
    ['line breaks', repeat('\r\n')],
    ['whitespace lines', repeat(' \t\r\n')],
  ]
  for (const [label, make] of decodeInputs)
    test(`decode() of ${label}`, async () => {
      expect(await slowdown(64 * 1024, make, decode)).toBeLessThan(maxRatio)
    })

  const encodeInputs: [string, (size: number) => Uint8Array][] = [
    ['a line without spaces', (size) => utf8(repeat('a')(size))],
    ['multi-byte characters', (size) => utf8(repeat('õ')(size))],
    ['continuation bytes', (size) => new Uint8Array(size).fill(0x80)],
    ['hyphens', (size) => utf8(repeat('-')(size))],
    ['line breaks', (size) => utf8(repeat('\n')(size))],
    ['spaces', (size) => utf8(repeat(' ')(size))],
    ['"="', (size) => utf8(repeat('=')(size))],
    ['punctuation', (size) => utf8(repeat('.,!?')(size))],
    ['every byte value', (size) => Uint8Array.from({ length: size }, (_, i) => i % 256)],
  ]
  for (const [label, make] of encodeInputs)
    test(`encode() of ${label}`, async () => {
      expect(await slowdown(64 * 1024, make, (input) => encode(input))).toBeLessThan(maxRatio)
    })

  test('the encoder stream with one-byte chunks', async () => {
    const run = (input: string) => encodeStream(split(utf8(input), 1))
    expect(await slowdown(8 * 1024, repeat('a -\t\r\n'), run)).toBeLessThan(maxRatio)
  })

  test('the encoder stream with one large chunk of whitespace', async () => {
    const run = (input: string) => encodeStream([utf8(input)])
    expect(await slowdown(64 * 1024, repeat(' '), run)).toBeLessThan(maxRatio)
  })

  test('the decoder stream with one-byte chunks', async () => {
    const run = (input: string) => decodeStream(split(utf8(input), 1))
    expect(await slowdown(8 * 1024, repeat('=C3 =\r\n'), run)).toBeLessThan(maxRatio)
  })

  test('the decoder stream with a whitespace run split into one-byte chunks', async () => {
    const run = (input: string) => decodeStream(split(utf8(input), 1))
    expect(await slowdown(8 * 1024, (size) => ' '.repeat(size) + 'x', run)).toBeLessThan(maxRatio)
  })
})
