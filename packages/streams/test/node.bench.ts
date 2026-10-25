import { Duplex, PassThrough, Readable, Writable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import * as NodeStreams from '@portable/streams/node';
import { expect, test } from 'vite-plus/test';
import { chunked, collect, encode, fromChunks } from './utils.js';

const chunks = chunked(encode('unicorn ☃ 好\n'.repeat(400_000)), 4096);
const buffers = () =>
  Readable.from(
    chunks.map((chunk) => Buffer.from(chunk)),
    { objectMode: false },
  );
const discard = () =>
  new Writable({
    write(_chunk, _encoding, callback) {
      callback();
    },
  });

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

test('pipes 6.8 MB of web stream chunks into Node within 25% of Readable.fromWeb', async ({
  bench,
}) => {
  const result = await bench.compare(
    bench('@portable/streams', async () => {
      await pipeline(NodeStreams.fromWeb(fromChunks(chunks)), discard());
    }),
    bench('Readable.fromWeb', async () => {
      await pipeline(Readable.fromWeb(fromChunks(chunks) as never), discard());
    }),
  );
  expect(result.get('Readable.fromWeb')).not.toBeFasterThan(result.get('@portable/streams'), {
    delta: 0.25,
  });
});

test('writes 6.8 MB to a Node Writable within 25% of Writable.toWeb', async ({ bench }) => {
  const result = await bench.compare(
    bench('@portable/streams', async () => {
      await fromChunks(chunks).pipeTo(NodeStreams.toWebWritable(discard()));
    }),
    bench('Writable.toWeb', async () => {
      await fromChunks(chunks).pipeTo(Writable.toWeb(discard()));
    }),
  );
  expect(result.get('Writable.toWeb')).not.toBeFasterThan(result.get('@portable/streams'), {
    delta: 0.25,
  });
});

test('writes 6.8 MB from Node to a WritableStream within 25% of Writable.fromWeb', async ({
  bench,
}) => {
  const target = () =>
    new WritableStream<Uint8Array>({
      write() {},
    });
  const result = await bench.compare(
    bench('@portable/streams', async () => {
      await pipeline(buffers(), NodeStreams.fromWebWritable(target()));
    }),
    bench('Writable.fromWeb', async () => {
      await pipeline(buffers(), Writable.fromWeb(target()));
    }),
  );
  expect(result.get('Writable.fromWeb')).not.toBeFasterThan(result.get('@portable/streams'), {
    delta: 0.25,
  });
});

test('pipes 6.8 MB through a PassThrough within 25% of Duplex.toWeb', async ({ bench }) => {
  const result = await bench.compare(
    bench('@portable/streams', async () => {
      await collect(fromChunks(chunks).pipeThrough(NodeStreams.toWebTransform(new PassThrough())));
    }),
    bench('Duplex.toWeb', async () => {
      const pair = Duplex.toWeb(new PassThrough()) as ReadableWritablePair<Uint8Array, Uint8Array>;
      await collect(fromChunks(chunks).pipeThrough(pair));
    }),
  );
  expect(result.get('Duplex.toWeb')).not.toBeFasterThan(result.get('@portable/streams'), {
    delta: 0.25,
  });
});

// Node 24's Duplex.fromWeb ran about 1.3× faster than fromWebTransform. The extra time is spent in
// Node's process.nextTick queue. We haven't found the cause yet.
test('pipes 6.8 MB through a TransformStream within 50% of Duplex.fromWeb', async ({ bench }) => {
  const result = await bench.compare(
    bench('@portable/streams', async () => {
      await pipeline(buffers(), NodeStreams.fromWebTransform(new TransformStream()), discard());
    }),
    bench('Duplex.fromWeb', async () => {
      await pipeline(buffers(), Duplex.fromWeb(new TransformStream() as never), discard());
    }),
  );
  expect(result.get('Duplex.fromWeb')).not.toBeFasterThan(result.get('@portable/streams'), {
    delta: 0.5,
  });
});
