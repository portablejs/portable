import { expect, test } from 'vite-plus/test';
import * as Compress from '@portable/compress';
import { difference, fixture } from './utils.js';

// Chromium's zlib reads a window larger than the zlib header declares, as pako does. Node's
// rejects the same input (see window.test.ts).
test('decodes a zlib header that understates the window size', async () => {
  const data = await fixture('bad_wbits.deflate');
  expect(
    difference(await Compress.decode(data, { format: 'deflate' }), await fixture('bad_wbits.txt')),
  ).toBe(undefined);
});
