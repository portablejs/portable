import { expect, test } from 'vite-plus/test';
import * as Compress from '@portable/compress';
import { fixture } from './utils.js';

// Node's zlib keeps to the window size in the zlib header, so a back-reference past it is
// invalid. Chromium decodes the same input (see window.browser.test.ts).
test('rejects a zlib header that understates the window size', async () => {
  const data = await fixture('bad_wbits.deflate');
  await expect(Compress.decode(data, { format: 'deflate' })).rejects.toThrow(
    Compress.InvalidInputError,
  );
});
