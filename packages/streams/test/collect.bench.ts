import getStream, { getStreamAsArrayBuffer } from 'get-stream'
import { expect, test } from 'vite-plus/test'
import { toBytes, toText } from '@portable/streams'
import { chunked, encode, fromChunks } from './utils.js'

const chunks = chunked(encode('unicorn ☃ 好\n'.repeat(400_000)), 65536)

test('collects 6.8 MB into bytes within 25% of get-stream', async ({ bench }) => {
  const result = await bench.compare(
    bench('@portable/streams', async () => {
      await toBytes(fromChunks(chunks))
    }),
    bench('get-stream', async () => {
      await getStreamAsArrayBuffer(fromChunks(chunks))
    }),
    bench('Response.arrayBuffer()', async () => {
      await new Response(fromChunks(chunks)).arrayBuffer()
    }),
  )
  expect(result.get('get-stream')).not.toBeFasterThan(result.get('@portable/streams'), {
    delta: 0.25,
  })
})

test('collects 6.8 MB into text within 25% of get-stream', async ({ bench }) => {
  const result = await bench.compare(
    bench('@portable/streams', async () => {
      await toText(fromChunks(chunks))
    }),
    bench('get-stream', async () => {
      await getStream(fromChunks(chunks))
    }),
    bench('Response.text()', async () => {
      await new Response(fromChunks(chunks)).text()
    }),
  )
  expect(result.get('get-stream')).not.toBeFasterThan(result.get('@portable/streams'), {
    delta: 0.25,
  })
})
