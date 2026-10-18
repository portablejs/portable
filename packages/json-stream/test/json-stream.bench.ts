import { Readable } from 'node:stream'
import { toArray, toText } from '@portable/streams'
import { JsonStreamStringify } from 'json-stream-stringify'
import JSONStream from 'JSONStream'
import { expect, test } from 'vite-plus/test'
import { encodeStream, DecoderStream } from '@portable/json-stream'
import allNpm from './fixtures/all_npm.json?raw'
import { chunked, encodeUtf8, streamOf } from './utils.js'

const document = JSON.parse(allNpm) as { rows: unknown[] }
const rows = Array.from({ length: 8 }, () => document.rows).flat()
const big = JSON.stringify({ total_rows: rows.length, offset: 0, rows })
const bigChunks = chunked(encodeUtf8(big), 65536)

function drain(readable: NodeJS.ReadableStream): Promise<number> {
  let count = 0
  return new Promise((resolve, reject) => {
    readable.on('data', () => count++)
    readable.on('end', () => resolve(count))
    readable.on('error', reject)
  })
}

test('parses the rows of a 3 MB document within 25% of JSONStream', async ({ bench }) => {
  const result = await bench.compare(
    bench('@portable/json-stream', async () => {
      await toArray(streamOf(bigChunks).pipeThrough(new DecoderStream({ paths: ['$.rows[*]'] })))
    }),
    bench('JSONStream', async () => {
      await drain(Readable.from(bigChunks).pipe(JSONStream.parse('rows.*')))
    }),
    bench('JSON.parse after reading everything', async () => {
      JSON.parse(await toText(streamOf(bigChunks)))
    }),
  )
  expect(result.get('JSONStream')).not.toBeFasterThan(result.get('@portable/json-stream'), {
    delta: 0.25,
  })
})

test('encodes a 3 MB object within 25% of json-stream-stringify', async ({ bench }) => {
  const value = { total_rows: rows.length, offset: 0, rows }
  const result = await bench.compare(
    bench('@portable/json-stream', async () => {
      await toText(encodeStream(value))
    }),
    bench('json-stream-stringify', async () => {
      await drain(new JsonStreamStringify(value))
    }),
    bench('JSON.stringify', () => {
      JSON.stringify(value)
    }),
  )
  expect(result.get('json-stream-stringify')).not.toBeFasterThan(
    result.get('@portable/json-stream'),
    { delta: 0.25 },
  )
})

test('encodes rows from an async iterable within 25% of json-stream-stringify', async ({
  bench,
}) => {
  async function* source() {
    yield* rows.slice(0, 4000)
  }
  const result = await bench.compare(
    bench('@portable/json-stream', async () => {
      await toText(encodeStream({ rows: source() }))
    }),
    bench('json-stream-stringify', async () => {
      await drain(new JsonStreamStringify({ rows: Readable.from(source()) }))
    }),
  )
  expect(result.get('json-stream-stringify')).not.toBeFasterThan(
    result.get('@portable/json-stream'),
    { delta: 0.25 },
  )
})
