import * as Png from '@portable/png';
import { fc, fuzz, mutated, outcome, outcomeAsync } from '@portable/fuzz';
import { unzlibSync, zlibSync } from 'fflate';
import { describe, expect, test } from 'vite-plus/test';
import { buildPng, fixtures } from './utils.js';

const errors = [Png.InvalidInputError, Png.TruncatedError, Png.UnsupportedError];
const inflate = (data: Uint8Array) => unzlibSync(data);

const image = fc
  .record({ width: fc.integer({ min: 1, max: 12 }), height: fc.integer({ min: 1, max: 12 }) })
  .chain(({ width, height }) =>
    fc.record({
      width: fc.constant(width),
      height: fc.constant(height),
      data: fc.uint8Array({ minLength: width * height * 4, maxLength: width * height * 4 }),
    }),
  );
const filter = fc.oneof(
  fc.constantFrom<Png.FilterType>(0, 1, 2, 3, 4),
  fc.uniqueArray(fc.constantFrom<Png.FilterType>(0, 1, 2, 3, 4), { minLength: 1 }),
);

describe('round trips', () => {
  test('decode returns the RGBA pixels encode was given', async () => {
    await fuzz(
      fc.asyncProperty(image, filter, async (image, filter) => {
        const decoded = await Png.decode(await Png.encode(image, { filter }));
        expect(decoded).toMatchObject({ width: image.width, height: image.height, alpha: true });
        expect(decoded.data).toEqual(image.data);
      }),
      { scale: 0.5 },
    );
  });

  test('decodeSync returns the pixels encodeSync was given in each color type', () => {
    fuzz(
      fc.property(image, filter, fc.constantFrom(0, 2, 4, 6), (image, filter, colorType) => {
        const opaque = Uint8Array.from(image.data, (byte, i) =>
          colorType === 0 || colorType === 2 ? (i % 4 === 3 ? 255 : byte) : byte,
        );
        const gray = colorType === 0 || colorType === 4;
        const source = gray ? grayscale(opaque) : opaque;
        const bytes = Png.encodeSync(
          { ...image, data: source },
          { colorType, filter, deflate: (data) => zlibSync(data) },
        );
        expect(Png.decodeSync(bytes, { inflate }).data).toEqual(source);
      }),
    );
  });
});

/** Sets each pixel's red, green, and blue to its red, so the gray encoders keep it as it is. */
function grayscale(data: Uint8Array): Uint8Array {
  return data.map((byte, i) => (i % 4 === 3 ? byte : data[i - (i % 4)]!));
}

const suite = [...fixtures.entries()].filter(([path]) => path.startsWith('pngsuite/'));
const fixture = fc.constantFrom(...suite.map(([, bytes]) => bytes));

describe('malformed input', () => {
  test('decode throws only the documented errors for a mutated PngSuite file', async () => {
    await fuzz(
      fc.asyncProperty(
        fixture.chain((bytes) => mutated(bytes)),
        fc.boolean(),
        async (bytes, checkCrc) => {
          await outcomeAsync(errors, () => Png.decode(bytes, { checkCrc }));
        },
      ),
      { scale: 0.5 },
    );
  });

  test('decodeSync throws only the documented errors for a mutated PngSuite file', () => {
    fuzz(
      fc.property(
        fixture.chain((bytes) => mutated(bytes)),
        (bytes) => {
          outcome(errors, () => Png.decodeSync(bytes, { checkCrc: false, inflate }));
        },
      ),
      { scale: 5 },
    );
  });

  test('decodeSync reads any scanlines for any valid header, or throws a documented error', () => {
    const header = fc.oneof(
      ...[
        [0, [1, 2, 4, 8, 16]],
        [2, [8, 16]],
        [3, [1, 2, 4, 8]],
        [4, [8, 16]],
        [6, [8, 16]],
      ].map(([colorType, depths]) =>
        fc.record({
          width: fc.integer({ min: 1, max: 20 }),
          height: fc.integer({ min: 1, max: 20 }),
          colorType: fc.constant(colorType as number),
          depth: fc.constantFrom(...(depths as number[])),
          interlace: fc.constantFrom(0, 1),
        }),
      ),
    );
    fuzz(
      fc.property(header, fc.uint8Array({ maxLength: 2000 }), (header, raw) => {
        const scanlines = raw.map((byte, i) => (i % 7 === 0 ? byte % 6 : byte));
        const png = buildPng(header, zlibSync(scanlines));
        outcome(errors, () => Png.decodeSync(png, { inflate }));
      }),
      { scale: 5 },
    );
  });
});
