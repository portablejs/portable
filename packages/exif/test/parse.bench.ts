import ExifParser from 'exif-parser'
import exifr from 'exifr'
import { expect, test } from 'vite-plus/test'
import * as Exif from '@portable/exif'
import { fixture } from './utils.js'

const jpeg = await fixture('starfish.jpg')
const buffer = Buffer.from(jpeg)

test('parses a phone JPEG within 25% of exif-parser', async ({ bench }) => {
  const result = await bench.compare(
    bench('@portable/exif', () => {
      Exif.parse(jpeg)
    }),
    bench('exif-parser', () => {
      ExifParser.create(buffer).parse()
    }),
    bench('exifr', async () => {
      await exifr.parse(buffer, {
        tiff: true,
        ifd1: true,
        interop: true,
        xmp: false,
        icc: false,
        iptc: false,
        jfif: false,
        ihdr: false,
      })
    }),
  )
  expect(result.get('exif-parser')).not.toBeFasterThan(result.get('@portable/exif'), {
    delta: 0.25,
  })
})
