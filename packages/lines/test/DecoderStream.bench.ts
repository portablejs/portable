import { createInterface } from 'node:readline'
import { Readable } from 'node:stream'
import { LineStream } from 'byline'
import split2 from 'split2'
import { expect, test } from 'vite-plus/test'
import * as Lines from '@portable/lines'
import rfc from './fixtures/rfc.txt?raw'
import { chunked, collect, encode, fromChunks } from './utils.js'

const chunks = chunked(encode(rfc.repeat(4)), 16384)

test('splits 1.7 MB of text into lines within 25% of split2 and byline', async ({ bench }) => {
  const result = await bench.compare(
    bench('@portable/lines', async () => {
      await collect(fromChunks(chunks).pipeThrough(new Lines.DecoderStream()))
    }),
    bench('split2', async () => {
      for await (const _ of Readable.from(chunks).pipe(split2()));
    }),
    bench('byline', async () => {
      for await (const _ of Readable.from(chunks).pipe(new LineStream({ keepEmptyLines: true })));
    }),
    bench('node:readline', async () => {
      for await (const _ of createInterface({ input: Readable.from(chunks), crlfDelay: Infinity }));
    }),
  )
  expect(result.get('split2')).not.toBeFasterThan(result.get('@portable/lines'), { delta: 0.25 })
  expect(result.get('byline')).not.toBeFasterThan(result.get('@portable/lines'), { delta: 0.25 })
})
