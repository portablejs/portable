import libheif from 'libheif-js/wasm-bundle';
import { describe, expect, test } from 'vite-plus/test';
import * as Exif from '@portable/exif';
import { fixture } from './utils.js';

/** Decodes the primary image of a HEIC file to RGBA pixels with libheif. */
async function decode(bytes: Uint8Array) {
  const [image] = new libheif.HeifDecoder().decode(bytes);
  if (!image) {
    throw new Error('libheif found no image');
  }
  const width = image.get_width();
  const height = image.get_height();
  const data = new Uint8ClampedArray(width * height * 4);
  await new Promise<void>((resolve, reject) => {
    image.display({ data, width, height }, (result) => {
      if (result) {
        resolve();
      } else {
        reject(new Error('libheif could not decode the image'));
      }
    });
  });
  return { width, height, data };
}

describe('libheif', () => {
  test('decodes the same pixels from a stripped iPhone HEIC', async () => {
    const bytes = await fixture('heic-iphone7-thumbnail.heic');
    expect(Exif.parse(bytes).gps).not.toEqual({});
    const stripped = Exif.strip(bytes);
    expect(Exif.parse(stripped)).toMatchObject({ ifd0: {}, exif: {}, gps: {} });
    const original = await decode(bytes);
    expect(original).toMatchObject({ width: 320, height: 240 });
    expect(await decode(stripped)).toEqual(original);
  });
});
