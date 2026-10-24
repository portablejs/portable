import { describe, expect, test } from 'vite-plus/test'
import * as Charset from '@portable/charset'
import { windows1251 } from '@portable/charset/single-byte'
import { byteForms, readBytes, streamOf, toByteForm } from '@portable/fuzz'

const utf8 = new TextEncoder().encode('Привет')
const expected = new Uint8Array([0xcf, 0xf0, 0xe8, 0xe2, 0xe5, 0xf2])

describe('byte inputs', () => {
  for (const form of byteForms) {
    test(`reads a ${form} as UTF-8`, async () => {
      expect(Charset.encode(toByteForm(utf8, form), windows1251)).toEqual(expected)
      const chunks = [toByteForm(utf8.subarray(0, 3), form), toByteForm(utf8.subarray(3), form)]
      expect(
        await readBytes(streamOf(chunks).pipeThrough(new Charset.EncoderStream(windows1251))),
      ).toEqual(expected)
    })
  }

  test('throws a TypeError for an array of numbers', () => {
    expect(() => Charset.encode([0x61] as never, windows1251)).toThrow(TypeError)
  })
})
