import { Readable } from 'node:stream'
import { toArray, toText } from '@portable/streams'
import ndjson from 'ndjson'
import { expect, test } from 'vite-plus/test'
import { DecoderStream, EncoderStream } from '@portable/ndjson'
import { chunked, encodeUtf8, rows, streamOf } from './utils.js'

const values = rows(20_000)
const lines = values.map((row) => JSON.stringify(row)).join('\n') + '\n'
const lineChunks = chunked(encodeUtf8(lines), 65536)

function drain(readable: NodeJS.ReadableStream): Promise<number> {
  let count = 0
  return new Promise((resolve, reject) => {
    readable.on('data', () => count++)
    readable.on('end', () => resolve(count))
    readable.on('error', reject)
  })
}

test('decodes 20,000 rows within 25% of ndjson', async ({ bench }) => {
  const result = await bench.compare(
    bench('@portable/ndjson', async () => {
      await toArray(streamOf(lineChunks).pipeThrough(new DecoderStream()))
    }),
    bench('ndjson', async () => {
      await drain(Readable.from(lineChunks).pipe(ndjson.parse()))
    }),
    bench('split and JSON.parse after reading everything', async () => {
      const text = await toText(streamOf(lineChunks))
      for (const line of text.split('\n')) if (line) JSON.parse(line)
    }),
  )
  expect(result.get('ndjson')).not.toBeFasterThan(result.get('@portable/ndjson'), {
    delta: 0.25,
  })
})

test('encodes 20,000 rows within 25% of ndjson', async ({ bench }) => {
  const result = await bench.compare(
    bench('@portable/ndjson', async () => {
      await toArray(streamOf(values).pipeThrough(new EncoderStream()))
    }),
    bench('ndjson', async () => {
      const stringify = ndjson.stringify()
      const done = drain(stringify)
      for (const value of values) stringify.write(value)
      stringify.end()
      await done
    }),
    bench('JSON.stringify each value', () => {
      for (const value of values) JSON.stringify(value)
    }),
  )
  expect(result.get('ndjson')).not.toBeFasterThan(result.get('@portable/ndjson'), {
    delta: 0.25,
  })
})
