import { Buffer } from 'node:buffer';
import { Readable } from 'node:stream';
import { BufferListStream } from 'bl';
import concatStream from 'concat-stream';
import getStream, { getStreamAsArray, getStreamAsArrayBuffer } from 'get-stream';
import getRawBody from 'raw-body';
import streamToArray from 'stream-to-array';
import { expect, test } from 'vite-plus/test';
import { toArray, toBlob, toBytes, toText } from '@portable/streams';
import { chunked, encode, fromChunks } from './utils.js';

const chunks = chunked(encode('unicorn ☃ 好\n'.repeat(400_000)), 65536);
const buffers = chunks.map((chunk) => Buffer.from(chunk.buffer, chunk.byteOffset, chunk.length));
const values = Array.from({ length: 100_000 }, (_, i) => ({ id: i }));

test('collects 6.8 MB into bytes within 25% of get-stream', async ({ bench }) => {
  const result = await bench.compare(
    bench('@portable/streams', async () => {
      await toBytes(fromChunks(chunks));
    }),
    bench('get-stream', async () => {
      await getStreamAsArrayBuffer(fromChunks(chunks));
    }),
    bench('concat-stream', async () => {
      await new Promise((resolve) => Readable.from(buffers).pipe(concatStream(resolve)));
    }),
    bench('bl', async () => {
      await new Promise((resolve, reject) =>
        Readable.from(buffers).pipe(
          new BufferListStream((error, data) => (error ? reject(error) : resolve(data))),
        ),
      );
    }),
  );
  expect(result.get('get-stream')).not.toBeFasterThan(result.get('@portable/streams'), {
    delta: 0.25,
  });
});

test('collects 6.8 MB into a Blob within 25% of Response.blob()', async ({ bench }) => {
  const result = await bench.compare(
    bench('@portable/streams', async () => {
      await toBlob(fromChunks(chunks));
    }),
    bench('Response.blob()', async () => {
      await new Response(fromChunks(chunks)).blob();
    }),
  );
  expect(result.get('Response.blob()')).not.toBeFasterThan(result.get('@portable/streams'), {
    delta: 0.25,
  });
});

// raw-body joins Node Buffers with Buffer.concat, which is C++.
test('collects 6.8 MB into bytes with a 10 MB limit within 50% of raw-body', async ({ bench }) => {
  const result = await bench.compare(
    bench('@portable/streams', async () => {
      await toBytes(fromChunks(chunks), { maxBytes: 10_000_000 });
    }),
    bench('raw-body', async () => {
      await getRawBody(Readable.from(buffers), { limit: 10_000_000 });
    }),
  );
  expect(result.get('raw-body')).not.toBeFasterThan(result.get('@portable/streams'), {
    delta: 0.5,
  });
});

test('collects 6.8 MB into text within 25% of get-stream', async ({ bench }) => {
  const result = await bench.compare(
    bench('@portable/streams', async () => {
      await toText(fromChunks(chunks));
    }),
    bench('get-stream', async () => {
      await getStream(fromChunks(chunks));
    }),
  );
  expect(result.get('get-stream')).not.toBeFasterThan(result.get('@portable/streams'), {
    delta: 0.25,
  });
});

test('collects 100,000 objects into an array within 25% of get-stream', async ({ bench }) => {
  const result = await bench.compare(
    bench('@portable/streams', async () => {
      await toArray(fromChunks(values));
    }),
    bench('get-stream', async () => {
      await getStreamAsArray(fromChunks(values));
    }),
    bench('stream-to-array', async () => {
      await streamToArray(Readable.from(values));
    }),
  );
  expect(result.get('get-stream')).not.toBeFasterThan(result.get('@portable/streams'), {
    delta: 0.25,
  });
});
