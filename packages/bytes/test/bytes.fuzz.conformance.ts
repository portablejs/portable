import * as Bytes from '@portable/bytes';
import { byteForm, fc, fuzz, outcome, toByteForm } from '@portable/fuzz';
import { expect, test } from 'vite-plus/test';

test('fromHex reads what toHex writes, in either case', () => {
  fuzz(
    fc.property(fc.uint8Array({ maxLength: 64 }), (bytes) => {
      const hex = Bytes.toHex(bytes);
      expect(hex).toMatch(/^(?:[\da-f]{2})*$/);
      expect(Bytes.fromHex(hex)).toEqual(bytes);
      expect(Bytes.fromHex(hex.toUpperCase())).toEqual(bytes);
      expect(Bytes.fromHex(new TextEncoder().encode(hex))).toEqual(bytes);
    }),
  );
});

test("fromHex throws only InvalidInputError, and only for text that isn't hex", () => {
  fuzz(
    fc.property(
      fc.string({ unit: fc.constantFrom('0', '9', 'a', 'F', 'g', ' ', 'x', '\n'), maxLength: 12 }),
      (text) => {
        const result = outcome([Bytes.InvalidInputError], () => Bytes.fromHex(text));
        expect('value' in result).toBe(/^(?:[\da-f]{2})*$/i.test(text));
      },
    ),
  );
});

test('concat joins the chunks in order', () => {
  fuzz(
    fc.property(fc.array(fc.uint8Array({ maxLength: 16 }), { maxLength: 6 }), (chunks) => {
      expect(Array.from(Bytes.concat(chunks))).toEqual(
        chunks.flatMap((chunk) => Array.from(chunk)),
      );
    }),
  );
});

test('equal and timingSafeEqual agree with comparing every byte', () => {
  const pair = fc.oneof(
    fc.uint8Array({ maxLength: 40 }).map((bytes) => [bytes, bytes.slice()] as const),
    fc.tuple(fc.uint8Array({ maxLength: 40 }), fc.uint8Array({ maxLength: 40 })),
    fc
      .tuple(
        fc.uint8Array({ minLength: 1, maxLength: 40 }),
        fc.nat(),
        fc.integer({ min: 1, max: 255 }),
      )
      .map(([bytes, at, flip]) => {
        const other = bytes.slice();
        const index = at % other.length;
        other[index] = other[index]! ^ flip;
        return [bytes, other] as const;
      }),
  );
  fuzz(
    fc.property(pair, ([a, b]) => {
      const expected = a.length === b.length && a.every((byte, i) => byte === b[i]);
      expect(Bytes.equal(a, b)).toBe(expected);
      expect(Bytes.timingSafeEqual(a, b)).toBe(expected);
    }),
  );
});

test('every byte form gives the same result as a Uint8Array', () => {
  fuzz(
    fc.property(fc.uint8Array({ maxLength: 64 }), byteForm, (bytes, form) => {
      const input = toByteForm(bytes, form);
      expect(Bytes.toHex(input)).toBe(Bytes.toHex(bytes));
      expect(Bytes.concat([input, bytes])).toEqual(Bytes.concat([bytes, bytes]));
      expect(Bytes.equal(input, bytes)).toBe(true);
      expect(Bytes.timingSafeEqual(input, bytes)).toBe(true);
    }),
  );
});
