import { describe, expect, test } from 'vite-plus/test'
import { byteForms, toByteForm } from '@portable/fuzz'
import * as Png from '@portable/png'
import { fixture } from './utils.js'

describe('byte inputs', () => {
  for (const form of byteForms) {
    test(`decodes a ${form}`, async () => {
      const bytes = fixture('pngjs/truecoloralpha.png')
      expect(await Png.decode(toByteForm(bytes, form))).toEqual(await Png.decode(bytes))
    })

    test(`encodes pixels given as a ${form}`, async () => {
      const data = Uint8Array.from({ length: 2 * 2 * 4 }, (_, i) => i * 13)
      const image = { width: 2, height: 2, data: toByteForm(data, form) }
      const png = await Png.encode(image)
      expect(png).toEqual(await Png.encode({ width: 2, height: 2, data }))
      expect((await Png.decode(png)).data).toEqual(data)
    })
  }

  test('encodes the Uint8ClampedArray of an ImageData', async () => {
    const data = new Uint8ClampedArray([255, 0, 0, 255])
    const png = await Png.encode({ width: 1, height: 1, data })
    expect((await Png.decode(png)).data).toEqual(new Uint8Array([255, 0, 0, 255]))
  })
})
