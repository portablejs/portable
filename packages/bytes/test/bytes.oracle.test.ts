import { timingSafeEqual as nodeTimingSafeEqual } from 'node:crypto'
import {
  areUint8ArraysEqual,
  concatUint8Arrays,
  hexToUint8Array,
  uint8ArrayToHex,
} from 'uint8array-extras'
import { describe, expect, test } from 'vite-plus/test'
import * as Bytes from '@portable/bytes'
import { fromHexFallback, toHexFallback } from '../src/hex.js'
import { atOffset, randomBytes } from './utils.js'

const fail = <T>(fn: () => T): T | 'error' => {
  try {
    return fn()
  } catch {
    return 'error'
  }
}

const sizes = [0, 1, 2, 31, 32, 33, 64, 127, 128, 129, 1000, 65537]

function randomHex(seed: number): string {
  const bytes = randomBytes(1 + (seed % 12), seed)
  const characters = '0123456789abcdefABCDEF'
  let text = Array.from(bytes, (byte) => characters[byte % characters.length]).join('')
  if (seed % 4 === 0) {
    const at = bytes[0]! % text.length
    text = text.slice(0, at) + String.fromCharCode(bytes[1]! & 0x7f) + text.slice(at + 1)
  }
  return text
}

describe('matches uint8array-extras', () => {
  test('toHex', () => {
    for (const size of sizes) {
      const bytes = randomBytes(size, size)
      expect(Bytes.toHex(bytes)).toBe(uint8ArrayToHex(bytes))
      expect(toHexFallback(bytes)).toBe(uint8ArrayToHex(bytes))
    }
  })

  test('fromHex, on valid and invalid input', () => {
    for (let seed = 0; seed < 2000; seed++) {
      const text = randomHex(seed)
      const expected = fail(() => hexToUint8Array(text))
      expect({ text, result: fail(() => Bytes.fromHex(text)) }).toEqual({ text, result: expected })
      expect({ text, result: fail(() => fromHexFallback(text)) }).toEqual({
        text,
        result: expected,
      })
    }
  })

  test('concat', () => {
    for (let seed = 0; seed < 200; seed++) {
      const chunks = Array.from({ length: seed % 7 }, (_, i) =>
        atOffset(randomBytes((seed * 7 + i * 13) % 300, seed + i), i % 3),
      )
      expect(Bytes.concat(chunks)).toEqual(concatUint8Arrays(chunks))
    }
  })

  test('equal', () => {
    for (let seed = 0; seed < 500; seed++) {
      const size = sizes[seed % sizes.length]!
      const a = randomBytes(size, seed)
      const b = atOffset(a, seed % 5)
      if (seed % 3 === 1 && size > 0) b[seed % size]! ^= 0x80
      const c = seed % 3 === 2 ? b.subarray(0, b.length >> 1) : b
      expect(Bytes.equal(a, c)).toBe(areUint8ArraysEqual(a, c))
    }
  })
})

describe('matches node:crypto', () => {
  test('timingSafeEqual on arrays of the same length', () => {
    for (let seed = 0; seed < 500; seed++) {
      const size = sizes[seed % sizes.length]!
      const a = atOffset(randomBytes(size, seed), seed % 4)
      const b = atOffset(a, (seed >> 2) % 5)
      if (seed % 2 === 1 && size > 0) b[(seed * 31) % size]! ^= 1 << (seed % 8)
      expect(Bytes.timingSafeEqual(a, b)).toBe(nodeTimingSafeEqual(a, b))
    }
  })

  test('timingSafeEqual returns false where node:crypto throws on different lengths', () => {
    const a = new Uint8Array([1, 2, 3])
    const b = new Uint8Array([1, 2])
    expect(() => nodeTimingSafeEqual(a, b)).toThrow(RangeError)
    expect(Bytes.timingSafeEqual(a, b)).toBe(false)
  })
})
