import { describe, expect, test } from 'vite-plus/test'
import * as Base64 from '@portable/base64'
import {
  attempt,
  byteForms,
  readBytes,
  rejectedByteForms,
  streamOf,
  toByteForm,
} from '@portable/fuzz'

const bytes = new Uint8Array([0xfb, 0xff, 0x00, 0x61, 0x62])
const text = new TextEncoder().encode('+/8AYWI=')

describe('byte inputs', () => {
  for (const form of byteForms) {
    test(`reads a ${form}`, async () => {
      expect(Base64.encode(toByteForm(bytes, form))).toBe('+/8AYWI=')
      expect(Base64.decode(toByteForm(text, form))).toEqual(bytes)
      const encoded = await readBytes(
        streamOf([
          toByteForm(bytes.subarray(0, 2), form),
          toByteForm(bytes.subarray(2), form),
        ]).pipeThrough(new Base64.EncoderStream()),
      )
      expect(encoded).toEqual(text)
      const decoded = await readBytes(
        streamOf([
          toByteForm(text.subarray(0, 3), form),
          toByteForm(text.subarray(3), form),
        ]).pipeThrough(new Base64.DecoderStream()),
      )
      expect(decoded).toEqual(bytes)
    })
  }
})

describe('rejected byte inputs', () => {
  for (const [name, value] of Object.entries(rejectedByteForms)) {
    test(`throws a TypeError for ${name}`, async () => {
      const v = value as never
      await expect(attempt(() => Base64.encode(v))).rejects.toThrow(TypeError)
      await expect(attempt(() => Base64.decode(v))).rejects.toThrow(TypeError)
      await expect(
        attempt(() => readBytes(streamOf([v]).pipeThrough(new Base64.EncoderStream()))),
      ).rejects.toThrow(TypeError)
      await expect(
        attempt(() => readBytes(streamOf([v]).pipeThrough(new Base64.DecoderStream()))),
      ).rejects.toThrow(TypeError)
    })
  }
})
