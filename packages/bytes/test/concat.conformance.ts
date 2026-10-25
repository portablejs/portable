import { describe, expect, test } from 'vite-plus/test';
import * as Bytes from '@portable/bytes';

describe('concat', () => {
  test('joins several arrays in order', () => {
    const result = Bytes.concat([
      new Uint8Array([1, 2, 3]),
      new Uint8Array([4, 5, 6]),
      new Uint8Array([7, 8, 9]),
    ]);
    expect(result).toEqual(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9]));
  });

  test('returns an empty array for no chunks or empty chunks', () => {
    expect(Bytes.concat([])).toEqual(new Uint8Array(0));
    expect(Bytes.concat([new Uint8Array(0), new Uint8Array(0)])).toEqual(new Uint8Array(0));
  });

  test('copies only the bytes each subarray covers', () => {
    const buffer = new Uint8Array([9, 1, 2, 9, 3, 9]);
    expect(Bytes.concat([buffer.subarray(1, 3), buffer.subarray(4, 5)])).toEqual(
      new Uint8Array([1, 2, 3]),
    );
  });

  test('returns a copy that does not share memory with a single chunk', () => {
    const chunk = new Uint8Array([1, 2, 3]);
    const result = Bytes.concat([chunk]);
    chunk[0] = 9;
    expect(result).toEqual(new Uint8Array([1, 2, 3]));
  });

  test('returns bytes that a Blob accepts', () => {
    expect(new Blob([Bytes.concat([new Uint8Array([1]), new Uint8Array([2])])]).size).toBe(2);
  });
});
