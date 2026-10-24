import { describe, expect, test } from 'vite-plus/test'
import * as Compress from '@portable/compress'
import {
  attempt,
  byteForms,
  readBytes,
  rejectedByteForms,
  streamOf,
  toByteForm,
} from '@portable/fuzz'

const bytes = new TextEncoder().encode('hello hello hello hello')

describe('byte inputs', () => {
  for (const form of byteForms) {
    test(`reads a ${form}`, async () => {
      expect(Compress.crc32(toByteForm(bytes, form))).toBe(Compress.crc32(bytes))
      const gzipped = await Compress.encode(toByteForm(bytes, form))
      expect(await Compress.decode(gzipped)).toEqual(bytes)
      expect(await Compress.decode(toByteForm(gzipped, form))).toEqual(bytes)
      const chunks = [
        toByteForm(gzipped.subarray(0, 5), form),
        toByteForm(gzipped.subarray(5), form),
      ]
      expect(await readBytes(streamOf(chunks).pipeThrough(new Compress.DecoderStream()))).toEqual(
        bytes,
      )
    })
  }
})

describe('rejected byte inputs', () => {
  for (const [name, value] of Object.entries(rejectedByteForms)) {
    test(`throws a TypeError for ${name}`, async () => {
      const v = value as never
      await expect(attempt(() => Compress.encode(v))).rejects.toThrow(TypeError)
      await expect(attempt(() => Compress.decode(v))).rejects.toThrow(TypeError)
      await expect(attempt(() => Compress.crc32(v))).rejects.toThrow(TypeError)
      await expect(
        attempt(() => readBytes(streamOf([v]).pipeThrough(new Compress.DecoderStream()))),
      ).rejects.toThrow(TypeError)
    })
  }
})
