import { expect, test } from 'vite-plus/test';
import * as ImageSize from '@portable/image-size';
import { chunked } from './utils.js';

// Four times the input costs a linear implementation about 4x and a quadratic one about 16x, so
// 8x separates them without a fixed time limit. The fastest of five runs counts.
async function expectLinear(run: (size: number) => Promise<unknown>, small: number) {
  const time = async (size: number) => {
    let best = Infinity;
    for (let i = 0; i < 5; i++) {
      const started = performance.now();
      await run(size);
      best = Math.min(best, performance.now() - started);
    }
    return best;
  };
  await run(Math.ceil(small / 10));
  const smallMs = await time(small);
  const largeMs = await time(small * 4);
  expect(largeMs).toBeLessThan(smallMs * 8 + 100);
}

const stream = (bytes: Uint8Array) => {
  const chunks = chunked(bytes, 256);
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      const chunk = chunks.shift();
      if (chunk) {
        controller.enqueue(chunk);
      } else {
        controller.close();
      }
    },
  });
};

test('reads JPEG filler bytes in small chunks in linear time', { timeout: 60_000 }, async () => {
  await expectLinear(async (size) => {
    const bytes = new Uint8Array(size);
    bytes.set([0xff, 0xd8]);
    await ImageSize.parseStream(stream(bytes), { maxBytes: Infinity }).catch(() => {});
  }, 64 * 1024);
});

test(
  'reads an SVG with an unmatched root in small chunks in linear time',
  { timeout: 60_000 },
  async () => {
    await expectLinear(async (size) => {
      const text = `<svg '<svg width="2" height="3">`.padEnd(size, ' ');
      await ImageSize.parseStream(stream(new TextEncoder().encode(text)), { maxBytes: Infinity });
    }, 64 * 1024);
  },
);
