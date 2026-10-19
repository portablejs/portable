import ExifParser from 'exif-parser'
import exifr from 'exifr'
import exifReader from 'exif-reader'
import { expect, test } from 'vite-plus/test'
import * as Exif from '@portable/exif'
import { chunked, fixture, tracked } from './utils.js'

const jpeg = await fixture('starfish.jpg')
const buffer = Buffer.from(jpeg)

// exif-reader takes the APP1 segment, which a caller finds in the JPEG first, as sharp does.
function app1(bytes: Buffer): Buffer {
  for (let i = 2; i + 4 <= bytes.length;) {
    const length = bytes.readUInt16BE(i + 2)
    if (bytes[i + 1] === 0xe1) return bytes.subarray(i + 4, i + 2 + length)
    i += 2 + length
  }
  throw new Error('No APP1 segment')
}

test('parses a phone JPEG within 25% of exif-parser', async ({ bench }) => {
  const result = await bench.compare(
    bench('@portable/exif', () => {
      Exif.parse(jpeg)
    }),
    bench('exif-parser', () => {
      ExifParser.create(buffer).parse()
    }),
    bench('exif-reader', () => {
      exifReader(app1(buffer))
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
