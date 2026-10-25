import { imageSize as upstream } from 'image-size';
import * as ImageSize from '@portable/image-size';
import { fc, fuzz, mutated, outcome } from '@portable/fuzz';
import { beforeAll, expect, test } from 'vite-plus/test';
import { fixture, fixtures } from './utils.js';

const errors = [ImageSize.InvalidInputError, ImageSize.TruncatedError, ImageSize.UnsupportedError];
// image-size reads HEIF sizes from the largest `ispe` box and ignores `clap` and `irot` (see "Known
// upstream issues" in PARITY.md). It also skips a JPEG's first segment without reading its marker,
// and after a corrupted segment length it looks for the next marker in a different place than
// `parse` does. HEIF and JPEG files are left out.
const files: Uint8Array[] = [];
beforeAll(async () => {
  for (const path of fixtures.filter(
    (path) => path.startsWith('valid/') && !/^valid\/(heif|jpg)\//.test(path),
  )) {
    files.push(await fixture(path));
  }
}, 60_000);

test('parse gives the size image-size gives for a mutated image both accept', () => {
  fuzz(
    fc.property(
      fc.nat().chain((index) => mutated(files[index % files.length]!, { within: 512 })),
      (bytes) => {
        // A Netpbm header needs whitespace after its magic number. Without it, parse reads the
        // magic number as two bytes and image-size as three, so those headers are left out.
        if (bytes[0] === 0x50 && !/[\t\n\r ]/.test(String.fromCharCode(bytes[2] ?? 0x20))) {
          return;
        }
        const ours = outcome(errors, () => ImageSize.parse(bytes));
        let theirs: ImageSize.Size;
        try {
          const { width, height, type } = upstream(bytes);
          theirs = { width, height, type } as ImageSize.Size;
        } catch {
          return;
        }
        // image-size returns an undefined or zero width or height for some headers it can't read,
        // so those results are left out.
        if (!theirs.width || !theirs.height) {
          return;
        }
        if (!('value' in ours)) {
          return;
        }
        const { width, height, type } = ours.value;
        expect({ width, height, type }).toEqual(theirs);
      },
    ),
    { scale: 5 },
  );
});
