import { fc, fuzz } from '@portable/fuzz';
import * as Random from '@portable/random';
import { expect, test } from 'vite-plus/test';

const bounds = fc
  .tuple(
    fc.integer({ min: -(2 ** 53) + 1, max: 2 ** 53 - 1 }),
    fc.integer({ min: 0, max: 2 ** 40 }),
  )
  .map(([min, span]) => [min, Math.min(min + span, 2 ** 53 - 1)] as const);

test('int stays within its bounds, for the global and a seeded generator', () => {
  fuzz(
    fc.property(bounds, fc.integer(), ([min, max], seed) => {
      for (const int of [Random.int, Random.seeded(seed).int]) {
        const value = int(min, max);
        expect(Number.isSafeInteger(value)).toBe(true);
        expect(value).toBeGreaterThanOrEqual(min);
        expect(value).toBeLessThanOrEqual(max);
      }
    }),
  );
});

test('string uses only the alphabet and has the length asked for', () => {
  fuzz(
    fc.property(
      fc.nat(64),
      fc.uniqueArray(fc.string({ unit: 'grapheme-ascii', minLength: 1, maxLength: 1 }), {
        minLength: 2,
        maxLength: 70,
      }),
      fc.integer(),
      (length, letters, seed) => {
        const alphabet = letters.join('');
        for (const string of [Random.string, Random.seeded(seed).string]) {
          const value = string(length, { alphabet });
          expect(value).toHaveLength(length);
          expect(value.split('').every((character) => letters.includes(character))).toBe(true);
        }
      },
    ),
  );
});

test('shuffle keeps every element, pick returns one of them, and bytes has the length', () => {
  fuzz(
    fc.property(
      fc.array(fc.integer(), { minLength: 1, maxLength: 20 }),
      fc.integer(),
      (array, seed) => {
        const seeded = Random.seeded(seed);
        for (const shuffle of [Random.shuffle, seeded.shuffle]) {
          expect(shuffle(array).sort((a, b) => a - b)).toEqual([...array].sort((a, b) => a - b));
        }
        for (const pick of [Random.pick, seeded.pick]) {
          expect(array).toContain(pick(array));
        }
        for (const bytes of [Random.bytes, seeded.bytes]) {
          expect(bytes(array.length)).toHaveLength(array.length);
        }
        const float = seeded.float();
        expect(float >= 0 && float < 1).toBe(true);
      },
    ),
  );
});

test('a seed gives the same values every time', () => {
  fuzz(
    fc.property(fc.integer(), (seed) => {
      const a = Random.seeded(seed);
      const b = Random.seeded(seed);
      expect([a.int(0, 1000), a.float(), a.string(8), [...a.bytes(5)]]).toEqual([
        b.int(0, 1000),
        b.float(),
        b.string(8),
        [...b.bytes(5)],
      ]);
    }),
  );
});
