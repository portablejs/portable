import { describe, expect, test } from 'vite-plus/test';
import * as Bytes from '@portable/bytes';
import { atOffset, randomBytes, utf8 } from './utils.js';

for (const compare of [Bytes.equal, Bytes.timingSafeEqual]) {
  describe(`${compare.name}`, () => {
    test('identical arrays are equal', () => {
      expect(compare(new Uint8Array([1, 2, 3]), new Uint8Array([1, 2, 3]))).toBe(true);
      expect(compare(utf8('foo'), utf8('foo'))).toBe(true);
    });

    test('an array equals itself', () => {
      const bytes = new Uint8Array([1, 2, 3]);
      expect(compare(bytes, bytes)).toBe(true);
    });

    test('arrays with different content are unequal', () => {
      expect(compare(new Uint8Array([1, 2, 3]), new Uint8Array([1, 2, 4]))).toBe(false);
      expect(compare(utf8('foo'), utf8('bar'))).toBe(false);
    });

    test('arrays of different lengths are unequal', () => {
      expect(compare(new Uint8Array([1, 2, 3]), new Uint8Array([1, 2, 3, 4]))).toBe(false);
      expect(compare(new Uint8Array([1, 2, 3]), new Uint8Array([1, 2]))).toBe(false);
    });

    test('empty arrays are equal', () => {
      expect(compare(new Uint8Array(0), new Uint8Array(0))).toBe(true);
    });

    test('compares only the bytes each subarray covers', () => {
      expect(
        compare(new Uint8Array([9, 1, 2]).subarray(1), new Uint8Array([1, 2, 9]).subarray(0, 2)),
      ).toBe(true);
    });

    test('compares the bytes of other typed arrays, not their values', () => {
      const bytesOf = (array: Float32Array | Float64Array) =>
        new Uint8Array(array.buffer, array.byteOffset, array.byteLength);
      expect(compare(bytesOf(new Float32Array([NaN])), bytesOf(new Float32Array([NaN])))).toBe(
        true,
      );
      expect(compare(bytesOf(new Float64Array([0])), bytesOf(new Float64Array([-0])))).toBe(false);
      const signalingNaNs = new BigInt64Array([0x7ff0000000000001n, -0x000fffffffffffffn]);
      expect(
        compare(
          bytesOf(new Float64Array(signalingNaNs.buffer)),
          bytesOf(new Float64Array([NaN, NaN])),
        ),
      ).toBe(false);
    });

    test('finds a difference at any position, length, and alignment', () => {
      for (const length of [1, 3, 4, 63, 64, 65, 100, 1027]) {
        const bytes = randomBytes(length, length);
        for (const offsetA of [0, 1, 2, 3, 4]) {
          for (const offsetB of [0, 1, 4]) {
            const a = atOffset(bytes, offsetA);
            expect(compare(a, atOffset(bytes, offsetB))).toBe(true);
            for (const at of new Set([0, length >> 1, length - 1])) {
              const changed = bytes.slice();
              changed[at]! ^= 1 << (at % 8);
              expect(compare(a, atOffset(changed, offsetB))).toBe(false);
            }
          }
        }
      }
    });
  });
}

describe('known upstream issues', () => {
  test("uint8array-extras: an ArrayBuffer is rejected, because a subarray's buffer holds more bytes than the view", () => {
    const view = new Uint8Array([9, 1, 2]).subarray(1);
    // @ts-expect-error
    expect(() => Bytes.equal(view, view.buffer)).toThrow(TypeError);
  });

  test('node:crypto: timingSafeEqual returns false for different lengths instead of throwing', () => {
    expect(Bytes.timingSafeEqual(new Uint8Array([1, 2, 3]), new Uint8Array([1, 2]))).toBe(false);
  });
});
