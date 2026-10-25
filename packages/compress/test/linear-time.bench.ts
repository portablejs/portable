import { expect, test } from 'vite-plus/test';
import * as Compress from '@portable/compress';
import { gzipMarkers, storedGzip } from './utils.js';

// Times an adversarial input at two sizes, one eight times the other: linear work takes about 8
// times as long on the larger input, and quadratic work about 64 times. The test compares the best
// of five runs, so one garbage collection pause doesn't fail it. Vitest retries a failing test
// because other processes on a busy machine slow some runs down.

async function bestOf(run: () => Promise<unknown>): Promise<number> {
  let best = Infinity;
  for (let i = 0; i < 5; i++) {
    const start = performance.now();
    await run();
    best = Math.min(best, performance.now() - start);
  }
  return best;
}

test(
  'decode() of a gzip member that repeats the member header, followed by a byte',
  { timeout: 120_000, retry: 3 },
  async () => {
    const make = (size: number) => new Uint8Array([...storedGzip(gzipMarkers(size)), 0]);
    const run = (input: Uint8Array) => () => Compress.decode(input).catch(() => {});
    const small = make(30_000);
    const large = make(240_000);
    await run(small)();
    const ratio = (await bestOf(run(large))) / Math.max(await bestOf(run(small)), 0.01);
    expect(ratio).toBeLessThan(24);
  },
);
