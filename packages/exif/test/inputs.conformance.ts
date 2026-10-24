import { describe, expect, test } from 'vite-plus/test'
import * as Exif from '@portable/exif'
import { byteForms, readBytes, streamOf, toByteForm } from '@portable/fuzz'
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
