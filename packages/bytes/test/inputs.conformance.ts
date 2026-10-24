import { describe, expect, test } from 'vite-plus/test'
import * as Bytes from '@portable/bytes'
import { byteForms, toByteForm } from '@portable/fuzz'

const bytes = new Uint8Array([0, 1, 0x7f, 0x80, 0xfe, 0xff])

describe('byte inputs', () => {
  for (const form of byteForms) {
    test(`reads ${form} input as the bytes in its range`, () => {
      const input = toByteForm(bytes, form)
      expect(Bytes.toHex(input)).toBe('00017f80feff')
      expect(Bytes.fromHex(toByteForm(new TextEncoder().encode('00ff'), form))).toEqual(
        new Uint8Array([0, 0xff]),
      )
      expect(Bytes.concat([input, input])).toEqual(Bytes.concat([bytes, bytes]))
      expect(Bytes.equal(input, bytes)).toBe(true)
      expect(Bytes.equal(bytes, input)).toBe(true)
      expect(Bytes.timingSafeEqual(input, bytes)).toBe(true)
    })
  }

  test('reads a typed array with wider elements as its bytes in memory', () => {
    const words = new Uint16Array(new Uint8Array([1, 2, 3, 4]).buffer)
    expect(Bytes.toHex(words)).toBe('01020304')
    expect(Bytes.toHex(new Float64Array(1))).toBe('0000000000000000')
  })

  test('does not read the bytes of the buffer outside a view', () => {
    const buffer = new Uint8Array([9, 1, 2, 9]).buffer
    expect(Bytes.equal(new DataView(buffer, 1, 2), new Uint8Array([1, 2]))).toBe(true)
    expect(Bytes.equal(new DataView(buffer, 1, 2), new Uint8Array(buffer))).toBe(false)
  })

  test('returns a copy for concat, never the input memory', () => {
    const input = new Uint8Array([1, 2]).buffer
    const result = Bytes.concat([input])
    new Uint8Array(input)[0] = 9
    expect(result).toEqual(new Uint8Array([1, 2]))
  })

  test.skipIf(typeof SharedArrayBuffer !== 'function')(
    'reads a SharedArrayBuffer and views of one',
    () => {
      const shared = new SharedArrayBuffer(2)
      new Uint8Array(shared).set([0xab, 0xcd])
      expect(Bytes.toHex(shared)).toBe('abcd')
      expect(Bytes.toHex(new DataView(shared, 1))).toBe('cd')
      expect(Bytes.concat([shared]).buffer).toBeInstanceOf(ArrayBuffer)
    },
  )

  for (const [name, value] of Object.entries({
    'an array of numbers': [1, 2],
    'a string': '0102',
    'a plain object': { byteLength: 2 },
    null: null,
    undefined: undefined,
  })) {
    test(`throws a TypeError for ${name}`, () => {
      expect(() => Bytes.toHex(value as never)).toThrow(TypeError)
      expect(() => Bytes.equal(value as never, bytes)).toThrow(TypeError)
      expect(() => Bytes.timingSafeEqual(bytes, value as never)).toThrow(TypeError)
      expect(() => Bytes.concat([value as never])).toThrow(TypeError)
    })
  }
})
