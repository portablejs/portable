import { createInterface } from 'node:readline';
import { Readable } from 'node:stream';
import { LineStream } from 'byline';
import split2 from 'split2';
import { expect, test } from 'vite-plus/test';
import * as Lines from '@portable/lines';
import rfc from './fixtures/rfc.txt?raw';
import { chunked, collect, encode, fromChunks } from './utils.js';

const chunks = chunked(encode(rfc.repeat(4)), 16384);

test('splits 1.7 MB of text into lines within 25% of split2 and byline', async ({ bench }) => {
  const result = await bench.compare(
    bench('@portable/lines', async () => {
      await collect(fromChunks(chunks).pipeThrough(new Lines.DecoderStream()));
    }),
    bench('split2', async () => {
      for await (const _ of Readable.from(chunks).pipe(split2())) {
      }
    }),
    bench('byline', async () => {
      for await (const _ of Readable.from(chunks).pipe(new LineStream({ keepEmptyLines: true }))) {
      }
    }),
    bench('node:readline', async () => {
      for await (const _ of createInterface({
        input: Readable.from(chunks),
        crlfDelay: Infinity,
      })) {
      }
    }),
  );
  expect(result.get('split2')).not.toBeFasterThan(result.get('@portable/lines'), { delta: 0.25 });
  expect(result.get('byline')).not.toBeFasterThan(result.get('@portable/lines'), { delta: 0.25 });
});

async function bestOf(run: () => Promise<unknown>): Promise<number> {
  let best = Infinity;
  for (let i = 0; i < 5; i++) {
    const start = performance.now();
    await run();
    best = Math.min(best, performance.now() - start);
  }
  return best;
}

// Linear work takes about 8 times as long on the input that is 8 times larger, and quadratic work
// about 64 times. Vitest retries a failing test because a busy machine slows some runs down.
for (const separator of [undefined, '||']) {
  test(
    `splits a line longer than one chunk in linear time with separator ${String(separator)}`,
    { timeout: 120_000, retry: 3 },
    async () => {
      const make = (size: number) => chunked(encode('x'.repeat(size) + '||\n'), 16384);
      const run = (input: Uint8Array[]) => () =>
        collect(fromChunks(input).pipeThrough(new Lines.DecoderStream({ separator })));
      const small = make(500_000);
      const large = make(4_000_000);
      await run(small)();
      const ratio = (await bestOf(run(large))) / Math.max(await bestOf(run(small)), 0.01);
      expect(ratio).toBeLessThan(24);
    },
  );
}
