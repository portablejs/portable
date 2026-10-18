import { expect, test } from 'vite-plus/test'
import { tee } from '@portable/streams'
import { chunked, collect, encode, fromChunks } from './utils.js'

const chunks = chunked(encode('unicorn ☃ 好\n'.repeat(400_000)), 4096)

test('splits 6.8 MB in 4 KB chunks into 3 branches within 25% of chained native tee()', async ({
  bench,
}) => {
  const result = await bench.compare(
    bench('@portable/streams', async () => {
      await Promise.all(tee(fromChunks(chunks), 3).map(collect))
    }),
    bench('chained tee()', async () => {
      const [a, rest] = fromChunks(chunks).tee()
      const [b, c] = rest.tee()
      await Promise.all([a, b, c].map(collect))
    }),
  )
  expect(result.get('chained tee()')).not.toBeFasterThan(result.get('@portable/streams'), {
    delta: 0.25,
  })
})
