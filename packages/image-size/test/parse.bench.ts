import { readFileSync } from 'node:fs'
import { imageSize } from 'image-size'
import { expect, test } from 'vite-plus/test'
import * as ImageSize from '@portable/image-size'
import { chunked, tracked } from './utils.js'

const read = (path: string) =>
  new Uint8Array(readFileSync(new URL(`./fixtures/valid/${path}`, import.meta.url)))

for (const path of [
  'jpg/large.jpg',
  'png/sample.png',
  'heif/sample.heic',
  'webp/lossy.webp',
  'svg/viewbox.svg',
  'tiff/big-endian.tiff',
]) {
  const bytes = read(path)
  test(`parses ${path} within 25% of image-size`, async ({ bench }) => {
    const result = await bench.compare(
      bench('@portable/image-size', () => {
        ImageSize.parse(bytes)
      }),
      bench('image-size', () => {
        imageSize(bytes)
      }),
    )
    expect(result.get('image-size')).not.toBeFasterThan(result.get('@portable/image-size'), {
      delta: 0.25,
    })
  })
}

test('parseStream on large.jpg in 64 KiB chunks', async ({ bench }) => {
  const chunks = chunked(read('jpg/large.jpg'), 64 * 1024)
  const result = await bench.compare(
    bench('@portable/image-size parseStream', async () => {
      await ImageSize.parseStream(tracked(chunks).stream)
    }),
    bench('image-size after collecting the stream', async () => {
      imageSize(new Uint8Array(await new Response(tracked(chunks).stream).arrayBuffer()))
    }),
  )
  expect(result.get('image-size after collecting the stream')).not.toBeFasterThan(
    result.get('@portable/image-size parseStream'),
    { delta: 0.25 },
  )
})
