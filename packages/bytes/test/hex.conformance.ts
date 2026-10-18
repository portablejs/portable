import { describe, expect, test } from 'vite-plus/test'
import * as Bytes from '@portable/bytes'
import { fromHexFallback, toHexFallback } from '../src/hex.js'
import { randomBytes, utf8 } from './utils.js'

const unicode = 'Hello - a Ā 𐀀 文 🦄'
const unicodeHex = '48656c6c6f202d206120c48020f090808020e6968720f09fa684'

const implementations = {
  'toHex and fromHex': { toHex: Bytes.toHex, fromHex: Bytes.fromHex },
  fallback: { toHex: toHexFallback, fromHex: fromHexFallback },
}

for (const [name, { toHex, fromHex }] of Object.entries(implementations)) {
  describe(`${name}`, () => {
    test('encodes UTF-8 text', () => {
      expect(toHex(utf8(unicode))).toBe(unicodeHex)
    })

    test('encodes every byte value with two lowercase digits', () => {
      expect(toHex(new Uint8Array([0, 15, 16, 255]))).toBe('000f10ff')
      const all = Uint8Array.from({ length: 256 }, (_, i) => i)
      const expected = Array.from(all, (byte) => byte.toString(16).padStart(2, '0')).join('')
      expect(toHex(all)).toBe(expected)
    })

    test('encodes only the bytes a subarray covers', () => {
      expect(toHex(new Uint8Array([1, 2, 3, 4]).subarray(1, 3))).toBe('0203')
    })

    test('encodes input longer than 128 bytes', () => {
      const bytes = randomBytes(1000, 1)
      const expected = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
      expect(toHex(bytes)).toBe(expected)
    })

    test('decodes UTF-8 text', () => {
      expect(fromHex(unicodeHex)).toEqual(utf8(unicode))
    })

    test('decodes upper and mixed case', () => {
      expect(fromHex('000F10FF')).toEqual(new Uint8Array([0, 15, 16, 255]))
      expect(fromHex('aBcD')).toEqual(new Uint8Array([0xab, 0xcd]))
    })

    test('decodes empty input', () => {
      expect(toHex(new Uint8Array(0))).toBe('')
      expect(fromHex('')).toEqual(new Uint8Array(0))
    })

    test('round-trips random bytes', () => {
      for (let seed = 0; seed < 50; seed++) {
        const bytes = randomBytes(seed * 13, seed)
        expect(fromHex(toHex(bytes))).toEqual(bytes)
      }
    })

    test('throws on odd length', () => {
      expect(() => fromHex('A')).toThrow(Bytes.InvalidInputError)
      expect(() => fromHex('abc')).toThrow(Bytes.InvalidInputError)
    })

    test('throws on a character that is not a hex digit', () => {
      for (const input of ['0G', 'G0', '0x00', ' 0', '00 ', '0\n', '+0', '-0', 'éa', '🦄', '0\0'])
        expect(() => fromHex(input)).toThrow(Bytes.InvalidInputError)
    })
  })
}

describe('fromHex', () => {
  test('takes hex as ASCII bytes', () => {
    expect(Bytes.fromHex(utf8('000f10FF'))).toEqual(new Uint8Array([0, 15, 16, 255]))
    expect(() => Bytes.fromHex(new Uint8Array([0x30, 0xb0]))).toThrow(Bytes.InvalidInputError)
  })

  test('returns bytes that a Blob accepts', () => {
    expect(new Blob([Bytes.fromHex('6869')]).size).toBe(2)
  })
})

type Native = {
  toHex?: (this: Uint8Array) => string
  fromHex?: (text: string) => Uint8Array
}
const native: Native = {
  toHex: Reflect.get(Uint8Array.prototype, 'toHex'),
  fromHex: Reflect.get(Uint8Array, 'fromHex'),
}

const fail = <T>(fn: () => T): T | 'error' => {
  try {
    return fn()
  } catch {
    return 'error'
  }
}

function mostlyHex(seed: number): string {
  const bytes = randomBytes(1 + (seed % 9), seed)
  const characters = '0123456789abcdefABCDEF'
  let text = Array.from(bytes, (byte) => characters[byte % characters.length]).join('')
  if (seed % 3 === 0) text += String.fromCharCode(bytes[0]! & 0x7f)
  return text
}

describe.runIf(native.toHex && native.fromHex)('fallback matches the native API', () => {
  test('encodes like Uint8Array.prototype.toHex', () => {
    for (let seed = 0; seed < 300; seed++) {
      const bytes = randomBytes(seed < 200 ? seed : seed * 31, seed)
      expect(toHexFallback(bytes)).toBe(native.toHex!.call(bytes))
    }
  })

  test('decodes and throws like Uint8Array.fromHex', () => {
    for (let seed = 0; seed < 1000; seed++) {
      const input = mostlyHex(seed)
      expect({ input, result: fail(() => fromHexFallback(input)) }).toEqual({
        input,
        result: fail(() => native.fromHex!(input)),
      })
    }
  })
})

describe('known upstream issues', () => {
  test('uint8array-extras: the error gives the position of the bad digit, not of its pair', () => {
    expect(() => Bytes.fromHex('0G')).toThrow(/at 1\./)
    expect(() => Bytes.fromHex('00G0')).toThrow(/at 2\./)
  })
})
