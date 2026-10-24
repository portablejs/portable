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

  test('returns a copy for concat, never the input memory', () => {
    const input = new Uint8Array([1, 2])
    const result = Bytes.concat([input])
    input[0] = 9
    expect(result).toEqual(new Uint8Array([1, 2]))
  })

  for (const [name, value] of Object.entries({
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
