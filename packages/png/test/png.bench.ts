import { readFileSync } from 'node:fs';
import { constants, deflateSync, inflateSync } from 'node:zlib';
import { PNG } from 'pngjs';
import { expect, test } from 'vite-plus/test';
import * as Png from '@portable/png';

// accum.png is a 1024x1024 RGB photo-like image (541 KB). Node has no native PNG decoder, so
// the benchmark uses node:zlib through our sync API in place of the platform's decompression.
const file = readFileSync(new URL('./fixtures/pngjs/accum.png', import.meta.url));
const bytes = new Uint8Array(file);
const image = Png.decodeSync(bytes, { inflate: inflateSync });
const pngjsImage = PNG.sync.read(file);

// Node's DecompressionStream hands zlib to the thread pool one 16 KiB output chunk at a time,
// about 190 round trips for this image, which costs 10 to 25 ms depending on load. Our own code
// is measured through node:zlib and held to 25%. The DecompressionStream path is held to 50%.
test('decodes a 1024x1024 PNG within 25% of pngjs', async ({ bench }) => {
  const result = await bench.compare(
    bench('@portable/png (DecompressionStream)', async () => {
      await Png.decode(bytes);
    }),
    bench('@portable/png (node:zlib)', () => {
      Png.decodeSync(bytes, { inflate: inflateSync });
    }),
    bench('pngjs', () => {
      PNG.sync.read(file);
    }),
  );
  expect(result.get('pngjs')).not.toBeFasterThan(result.get('@portable/png (node:zlib)'), {
    delta: 0.25,
  });
  expect(result.get('pngjs')).not.toBeFasterThan(
    result.get('@portable/png (DecompressionStream)'),
    { delta: 0.5 },
  );
});

// CompressionStream compresses at zlib level 6 with the default strategy. pngjs defaults to level 9
// with Z_RLE, which is about 6 times faster to compress and makes files about 17% larger, so the
// assertion compares both at CompressionStream's settings. The other rows show the defaults, and
// our encoder given the same Z_RLE deflate.
test('encodes a 1024x1024 PNG within 25% of pngjs at the same zlib settings', async ({ bench }) => {
  const result = await bench.compare(
    bench('@portable/png (CompressionStream)', async () => {
      await Png.encode(image);
    }),
    bench('pngjs (level 6, default strategy)', () => {
      PNG.sync.write(pngjsImage, { deflateLevel: 6, deflateStrategy: 0 });
    }),
    bench('@portable/png (node:zlib level 9, Z_RLE)', () => {
      Png.encodeSync(image, {
        deflate: (data) => deflateSync(data, { level: 9, strategy: constants.Z_RLE }),
      });
    }),
    bench('pngjs (defaults: level 9, Z_RLE)', () => {
      PNG.sync.write(pngjsImage);
    }),
  );
  expect(result.get('pngjs (level 6, default strategy)')).not.toBeFasterThan(
    result.get('@portable/png (CompressionStream)'),
    { delta: 0.25 },
  );
});
