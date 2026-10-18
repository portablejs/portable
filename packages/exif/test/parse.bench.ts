import ExifParser from 'exif-parser'
import exifr from 'exifr'
import { expect, test } from 'vite-plus/test'
import * as Exif from '@portable/exif'
import { chunked, fixture, tracked } from './utils.js'

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

test('parseStream reads less of a phone JPEG than parse after collecting the stream', async ({
  bench,
}) => {
  const chunks = chunked(jpeg, 16 * 1024)
  let streamRead = 0
  let collectRead = 0
  const result = await bench.compare(
    bench('@portable/exif parseStream', async () => {
      const source = tracked(chunks)
      await Exif.parseStream(source.stream)
      streamRead = source.read()
    }),
    bench('@portable/exif parse after collecting the stream', async () => {
      const source = tracked(chunks)
      Exif.parse(new Uint8Array(await new Response(source.stream).arrayBuffer()))
      collectRead = source.read()
    }),
  )
  expect(collectRead).toBe(jpeg.length)
  expect(streamRead).toBeLessThanOrEqual(48 * 1024)
  expect(result.get('@portable/exif parse after collecting the stream')).not.toBeFasterThan(
    result.get('@portable/exif parseStream'),
    { delta: 0.25 },
  )
})
