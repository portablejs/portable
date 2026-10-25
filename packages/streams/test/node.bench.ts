import { Readable } from 'node:stream';
import * as NodeStreams from '@portable/streams/node';
import { expect, test } from 'vite-plus/test';
import { chunked, collect, encode } from './utils.js';

const chunks = chunked(encode('unicorn ☃ 好\n'.repeat(400_000)), 4096);
const buffers = () =>
  Readable.from(
    chunks.map((chunk) => Buffer.from(chunk)),
    { objectMode: false },
  );
test('reads 6.8 MB of Node Readable chunks within 25% of Readable.toWeb', async ({ bench }) => {
  const result = await bench.compare(
    bench('@portable/streams', async () => {
      await collect(NodeStreams.toWeb(buffers()));
    }),
    bench('Readable.toWeb', async () => {
      await collect(Readable.toWeb(buffers()) as ReadableStream<Uint8Array>);
    }),
  );
  expect(result.get('Readable.toWeb')).not.toBeFasterThan(result.get('@portable/streams'), {
    delta: 0.25,
  });
});
