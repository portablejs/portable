import { describe, expect, test } from 'vite-plus/test'
import * as Exif from '@portable/exif'
import {
  attempt,
  byteForms,
  readBytes,
  rejectedByteForms,
  streamOf,
  toByteForm,
} from '@portable/fuzz'
import { fixture } from './utils.js'

describe('byte inputs', () => {
  for (const form of byteForms) {
    test(`reads a ${form}`, async () => {
      const bytes = await fixture('starfish.jpg')
      const expected = Exif.parse(bytes)
      expect(Exif.parse(toByteForm(bytes, form))).toEqual(expected)
      const chunks = [
        toByteForm(bytes.subarray(0, 100), form),
        toByteForm(bytes.subarray(100), form),
      ]
      expect(await Exif.parseStream(streamOf(chunks))).toEqual(expected)
      const stripped = Exif.strip(bytes)
      expect(Exif.strip(toByteForm(bytes, form))).toEqual(stripped)
      expect(await readBytes(streamOf(chunks).pipeThrough(new Exif.StripStream()))).toEqual(
        stripped,
      )
    })
  }
})

describe('rejected byte inputs', () => {
  for (const [name, value] of Object.entries(rejectedByteForms)) {
    test(`throws a TypeError for ${name}`, async () => {
      const v = value as never
      await expect(attempt(() => Exif.parse(v))).rejects.toThrow(TypeError)
      await expect(attempt(() => Exif.strip(v))).rejects.toThrow(TypeError)
      await expect(attempt(() => Exif.parseStream(streamOf([v])))).rejects.toThrow(TypeError)
      await expect(
        attempt(() => readBytes(streamOf([v]).pipeThrough(new Exif.StripStream()))),
      ).rejects.toThrow(TypeError)
    })
  }
})
