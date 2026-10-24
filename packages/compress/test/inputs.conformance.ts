import { describe, expect, test } from 'vite-plus/test'
import * as Compress from '@portable/compress'
import { byteForms, readBytes, streamOf, toByteForm } from '@portable/fuzz'

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
