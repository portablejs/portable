import { describe, expect, test } from 'vite-plus/test'
import { byteForms, streamOf, toByteForm } from '@portable/fuzz'
import * as ImageSize from '@portable/image-size'
import { fixture } from './utils.js'

describe('byte inputs', () => {
  for (const form of byteForms) {
    test(`reads a ${form}`, async () => {
      const bytes = await fixture('valid/jpg/sample.jpg')
      const expected = ImageSize.parse(bytes)
      expect(ImageSize.parse(toByteForm(bytes, form))).toEqual(expected)
      const chunks = [toByteForm(bytes.subarray(0, 50), form), toByteForm(bytes.subarray(50), form)]
      expect(await ImageSize.parseStream(streamOf(chunks))).toEqual(expected)
    })
  }
})
