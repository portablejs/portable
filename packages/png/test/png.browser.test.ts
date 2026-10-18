import { describe, expect, test } from 'vite-plus/test'
import * as Png from '@portable/png'
import { fixture, fixtures, randomBytes } from './utils.js'

async function viaBrowser(bytes: Uint8Array): Promise<Uint8ClampedArray> {
  const bitmap = await createImageBitmap(new Blob([bytes.slice()], { type: 'image/png' }), {
    colorSpaceConversion: 'none',
    premultiplyAlpha: 'none',
  })
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height)
  const context = canvas.getContext('2d')!
  context.drawImage(bitmap, 0, 0)
  return context.getImageData(0, 0, bitmap.width, bitmap.height).data
}

// Canvas pixels are stored premultiplied, so color is only exact where alpha is 255, and the
// browser may round 16-bit samples down to 8 bits differently.
function largestDifference(actual: Uint8Array, expected: Uint8ClampedArray): number {
  let largest = actual.length === expected.length ? 0 : Infinity
  for (let i = 0; i < actual.length; i += 4) {
    const alpha = expected[i + 3]!
    const channels = alpha === 255 ? 4 : 1
    for (let c = 4 - channels; c < 4; c++)
      largest = Math.max(largest, Math.abs(actual[i + c]! - expected[i + c]!))
  }
  return largest
}

describe('decodes PngSuite like the browser does', () => {
  const paths = [...fixtures.keys()].filter(
    (path) => path.startsWith('pngsuite/') && !path.startsWith('pngsuite/x'),
  )
  for (const path of paths) {
    test(`${path}`, async () => {
      const bytes = fixture(path)
      const png = await Png.decode(bytes)
      const difference = largestDifference(png.data, await viaBrowser(bytes))
      expect(difference).toBeLessThanOrEqual(png.depth === 16 ? 1 : 0)
    })
  }
})

test('the browser decodes our output to the input pixels', async () => {
  const data = randomBytes(40 * 30 * 4, 9)
  for (let i = 3; i < data.length; i += 4) data[i] = 255
  const browser = await viaBrowser(await Png.encode({ width: 40, height: 30, data }))
  expect(largestDifference(data, browser)).toBe(0)
})
