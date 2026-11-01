import { imageMeta } from 'image-meta';
import { imageSize as upstream } from 'image-size';
import { describe, expect, test } from 'vite-plus/test';
import * as ImageSize from '@portable/image-size';
import { fixture, fixtures, randomChunks, tracked } from './utils.js';

// Fixtures where image-size has a known bug (see "Known upstream issues" in PARITY.md). The
// expected value is the correct one, so the oracle doesn't lock the bug in.
const upstreamBugs: Record<string, ImageSize.Size> = {
  'valid/heif/sample-multi.heic': { width: 123, height: 456, type: 'heic' },
};

function viaUpstream(bytes: Uint8Array): unknown {
  // image-size also returns TIFF's `compression` tag, which isn't part of its documented result.
  const { compression: _, ...size } = upstream(bytes) as { compression?: number | undefined };
  return size;
}

const valid = fixtures.filter((path) => path.startsWith('valid/'));
const invalid = fixtures.filter((path) => path.startsWith('invalid/'));

describe('gives the same size as image-size', () => {
  for (const path of valid) {
    test(`${path}`, async () => {
      const bytes = await fixture(path);
      const expected = upstreamBugs[path] ?? viaUpstream(bytes);
      expect(ImageSize.parse(bytes)).toEqual(expected);
      for (const seed of [1, 2, 3]) {
        const { stream, cancelled, read } = tracked(randomChunks(bytes, seed));
        expect(await ImageSize.parseStream(stream)).toEqual(expected);
        expect(read() === bytes.length || cancelled()).toBe(true);
      }
    });
  }
});

// image-meta returns a different type for three formats, so this maps our type to image-meta's.
// See "Why use this over image-size and image-meta" in the README.
const imageMetaTypes: Record<string, string> = {
  ktx2: 'ktx',
  'jxl-stream': 'jxl',
  bigtiff: 'tiff',
};

describe('gives the same width and height as image-meta', () => {
  for (const path of valid) {
    test(`${path}`, async () => {
      const bytes = await fixture(path);
      const { type, width, height } = ImageSize.parse(bytes);
      const meta = imageMeta(bytes);
      expect({ type: meta.type, width: meta.width, height: meta.height }).toEqual({
        type: imageMetaTypes[type] ?? type,
        width,
        height,
      });
    });
  }
});

describe('rejects what image-size and image-meta reject', () => {
  for (const path of invalid) {
    test(`${path}`, async () => {
      const bytes = await fixture(path);
      expect(() => upstream(bytes)).toThrow(TypeError);
      expect(() => imageMeta(bytes)).toThrow(TypeError);
      expect(() => ImageSize.parse(bytes)).toThrow(ImageSize.InvalidInputError);
    });
  }
});
