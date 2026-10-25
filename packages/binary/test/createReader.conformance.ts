import { describe, expect, test } from 'vite-plus/test';
import * as Binary from '@portable/binary';

const bytes = (...values: number[]) => new Uint8Array(values);

function thrown(run: () => unknown): unknown {
  try {
    run();
  } catch (error) {
    return error;
  }
  return undefined;
}

describe('createReader', () => {
  test('reads integers in big-endian order by default', () => {
    const reader = Binary.createReader(
      bytes(0x01, 0xff, 0x12, 0x34, 0xff, 0xfe, 0xde, 0xad, 0xbe, 0xef, 0x80, 0, 0, 0),
    );
    expect(reader.uint8()).toBe(1);
    expect(reader.int8()).toBe(-1);
    expect(reader.uint16()).toBe(0x1234);
    expect(reader.int16()).toBe(-2);
    expect(reader.uint32()).toBe(0xdeadbeef);
    expect(reader.int32()).toBe(-0x80000000);
    expect(reader.remaining).toBe(0);
  });

  test('reads integers in little-endian order', () => {
    const reader = Binary.createReader(bytes(0x34, 0x12, 0xef, 0xbe, 0xad, 0xde, 0xfe, 0xff), {
      endian: 'little',
    });
    expect(reader.uint16()).toBe(0x1234);
    expect(reader.uint32()).toBe(0xdeadbeef);
    expect(reader.int16()).toBe(-2);
  });

  test('switches byte order when endian is set', () => {
    const reader = Binary.createReader(bytes(0x00, 0x01, 0x01, 0x00));
    expect(reader.uint16()).toBe(1);
    reader.endian = 'little';
    expect(reader.endian).toBe('little');
    expect(reader.uint16()).toBe(1);
  });

  test('reads 64-bit integers as bigints', () => {
    const max = bytes(0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff);
    expect(Binary.createReader(max).bigUint64()).toBe(2n ** 64n - 1n);
    expect(Binary.createReader(max).bigInt64()).toBe(-1n);
    const one = bytes(1, 0, 0, 0, 0, 0, 0, 0);
    expect(Binary.createReader(one, { endian: 'little' }).bigUint64()).toBe(1n);
    expect(Binary.createReader(one).bigUint64()).toBe(1n << 56n);
  });

  test('reads floats', () => {
    const reader = Binary.createReader(
      bytes(0x3f, 0xc0, 0, 0, 0x40, 0x09, 0x21, 0xfb, 0x54, 0x44, 0x2d, 0x18),
    );
    expect(reader.float32()).toBe(1.5);
    expect(reader.float64()).toBe(Math.PI);
  });

  test('reads floats from a view that starts partway into its buffer', () => {
    const buffer = bytes(0xaa, 0x3f, 0xc0, 0, 0);
    expect(Binary.createReader(buffer.subarray(1)).float32()).toBe(1.5);
  });

  test('reads integers of 1 to 6 bytes', () => {
    expect(Binary.createReader(bytes(0x01, 0x02, 0x03)).uint(3)).toBe(0x010203);
    expect(Binary.createReader(bytes(0xff, 0xff, 0xff)).int(3)).toBe(-1);
    expect(Binary.createReader(bytes(0x03, 0x02, 0x01), { endian: 'little' }).uint(3)).toBe(
      0x010203,
    );
    expect(Binary.createReader(new Uint8Array(6).fill(0xff)).uint(6)).toBe(2 ** 48 - 1);
    expect(Binary.createReader(bytes(0x80, 0, 0, 0, 0, 0)).int(6)).toBe(-(2 ** 47));
  });

  test('throws a RangeError for a byte length outside 1 to 6', () => {
    const reader = Binary.createReader(new Uint8Array(8));
    expect(() => reader.uint(0)).toThrow(RangeError);
    expect(() => reader.uint(7)).toThrow(RangeError);
    expect(() => reader.int(1.5)).toThrow(RangeError);
  });

  test('returns bytes as a view of the input', () => {
    const input = bytes(1, 2, 3, 4);
    const reader = Binary.createReader(input);
    reader.skip(1);
    const view = reader.bytes(2);
    expect(view).toEqual(bytes(2, 3));
    input[1] = 9;
    expect(view[0]).toBe(9);
    expect(reader.offset).toBe(3);
  });

  test('decodes UTF-8 strings', () => {
    const text = new TextEncoder().encode('hi héllo 😀');
    expect(Binary.createReader(text).string(text.length)).toBe('hi héllo 😀');
  });

  test('keeps a leading byte order mark', () => {
    const text = bytes(0xef, 0xbb, 0xbf, 0x61);
    expect(Binary.createReader(text).string(4)).toBe('\ufeffa');
  });

  test('replaces malformed UTF-8 unless fatal is set', () => {
    expect(Binary.createReader(bytes(0x61, 0xff)).string(2)).toBe('a�');
    const reader = Binary.createReader(bytes(0x61, 0xff));
    expect(() => reader.string(2, { fatal: true })).toThrow(Binary.InvalidInputError);
    expect(reader.offset).toBe(0);
  });

  test('passes the decoder error as cause', () => {
    const error = thrown(() => Binary.createReader(bytes(0xff)).string(1, { fatal: true }));
    expect(error).toBeInstanceOf(Binary.InvalidInputError);
    expect((error as Error).cause).toBeInstanceOf(TypeError);
  });

  test('reads null-terminated strings', () => {
    const reader = Binary.createReader(bytes(0x61, 0x62, 0, 0, 0x63));
    expect(reader.cstring()).toBe('ab');
    expect(reader.cstring()).toBe('');
    expect(reader.offset).toBe(4);
    expect(() => reader.cstring()).toThrow(Binary.TruncatedError);
    expect(reader.offset).toBe(4);
  });

  test('throws TruncatedError with the offset of the value and leaves offset unchanged', () => {
    const reader = Binary.createReader(bytes(1, 2, 3));
    reader.uint8();
    for (const read of [
      () => reader.uint32(),
      () => reader.bigUint64(),
      () => reader.float64(),
      () => reader.bytes(3),
      () => reader.string(3),
      () => reader.skip(3),
    ]) {
      const error = thrown(read);
      expect(error).toBeInstanceOf(Binary.TruncatedError);
      expect((error as Binary.TruncatedError).offset).toBe(1);
      expect(reader.offset).toBe(1);
    }
  });

  test('leaves offset unchanged when the second half of a bigUint64 is missing', () => {
    const reader = Binary.createReader(new Uint8Array(6));
    expect(() => reader.bigUint64()).toThrow(Binary.TruncatedError);
    expect(reader.offset).toBe(0);
  });

  test('can move offset back to read a value again', () => {
    const reader = Binary.createReader(bytes(7, 8));
    expect(reader.uint8()).toBe(7);
    reader.offset = 0;
    expect(reader.uint8()).toBe(7);
    reader.offset = 2;
    expect(reader.remaining).toBe(0);
    expect(reader.length).toBe(2);
  });

  test('throws a RangeError for an offset outside the bytes', () => {
    const reader = Binary.createReader(bytes(1, 2));
    expect(() => (reader.offset = 3)).toThrow(RangeError);
    expect(() => (reader.offset = -1)).toThrow(RangeError);
    expect(() => (reader.offset = 0.5)).toThrow(RangeError);
  });

  test('throws a RangeError for an unknown endian', () => {
    expect(() => Binary.createReader(bytes(), { endian: 'middle' as never })).toThrow(RangeError);
  });

  test('throws a TypeError for input that is not a Uint8Array', () => {
    expect(() => Binary.createReader([1, 2] as never)).toThrow(TypeError);
  });

  test('throws a TypeError for a byte length that is not a number', () => {
    expect(() => Binary.createReader(bytes(1)).bytes('1' as never)).toThrow(TypeError);
  });
});

describe('varint', () => {
  test('reads unsigned varints', () => {
    expect(Binary.createReader(bytes(0)).varint()).toBe(0);
    expect(Binary.createReader(bytes(0x7f)).varint()).toBe(127);
    expect(Binary.createReader(bytes(0x80, 0x01)).varint()).toBe(128);
    expect(Binary.createReader(bytes(0xac, 0x02)).varint()).toBe(300);
    expect(Binary.createReader(bytes(0xff, 0xff, 0xff, 0xff, 0x0f)).varint()).toBe(0xffffffff);
    expect(
      Binary.createReader(bytes(0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0x0f)).varint(),
    ).toBe(Number.MAX_SAFE_INTEGER);
  });

  test('reads a Minecraft VarInt as a signed 32-bit integer with `| 0`', () => {
    const reader = Binary.createReader(bytes(0xff, 0xff, 0xff, 0xff, 0x0f));
    expect(reader.varint() | 0).toBe(-1);
  });

  test('reads zigzag varints', () => {
    const read = (...values: number[]) =>
      Binary.createReader(bytes(...values)).varint({ encoding: 'zigzag' });
    expect(read(0)).toBe(0);
    expect(read(1)).toBe(-1);
    expect(read(2)).toBe(1);
    expect(read(3)).toBe(-2);
    expect(read(0xfe, 0x01)).toBe(127);
    expect(read(0xff, 0x01)).toBe(-128);
  });

  test('reads signed LEB128', () => {
    const read = (...values: number[]) =>
      Binary.createReader(bytes(...values)).varint({ encoding: 'signed' });
    expect(read(0x02)).toBe(2);
    expect(read(0x7e)).toBe(-2);
    expect(read(0xff, 0x00)).toBe(127);
    expect(read(0x81, 0x7f)).toBe(-127);
    expect(read(0x80, 0x01)).toBe(128);
    expect(read(0x80, 0x7f)).toBe(-128);
    expect(read(0xc0, 0xbb, 0x78)).toBe(-123456);
  });

  test('reads 8-byte signed varints exactly', () => {
    const writer = Binary.createWriter();
    writer.varint(-(2 ** 48) - 1, { encoding: 'signed' });
    expect(Binary.createReader(writer.toBytes()).varint({ encoding: 'signed' })).toBe(
      -(2 ** 48) - 1,
    );
    const bytes8 = bytes(0x81, 0x80, 0x80, 0x80, 0x80, 0x80, 0x81, 0x70);
    expect(Binary.createReader(bytes8).varint({ encoding: 'signed' })).toBe(
      Number(Binary.createReader(bytes8).bigVarint({ encoding: 'signed' })),
    );
  });

  test('reads a 10-byte signed varint that holds a small value', () => {
    const minusOne = bytes(0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0x7f);
    const reader = Binary.createReader(minusOne);
    expect(reader.varint({ encoding: 'signed' })).toBe(-1);
    expect(reader.offset).toBe(10);
  });

  test('reads 64-bit varints as bigints', () => {
    const max = bytes(0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0x01);
    expect(Binary.createReader(max).bigVarint()).toBe(2n ** 64n - 1n);
    expect(Binary.createReader(max).bigVarint({ encoding: 'zigzag' })).toBe(-(2n ** 63n));
    const minusOne = bytes(0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0x7f);
    expect(Binary.createReader(minusOne).bigVarint({ encoding: 'signed' })).toBe(-1n);
  });

  test('throws InvalidInputError for a varint longer than 10 bytes', () => {
    const reader = Binary.createReader(new Uint8Array(11).fill(0x80));
    expect(() => reader.varint()).toThrow(Binary.InvalidInputError);
    expect(() => reader.bigVarint()).toThrow(Binary.InvalidInputError);
    expect(reader.offset).toBe(0);
  });

  test('throws InvalidInputError for a varint outside the safe integer range', () => {
    const big = bytes(0x80, 0x80, 0x80, 0x80, 0x80, 0x80, 0x80, 0x10);
    expect(() => Binary.createReader(big).varint()).toThrow(Binary.InvalidInputError);
    expect(Binary.createReader(big).bigVarint()).toBe(2n ** 53n);
    const writer = Binary.createWriter();
    writer.bigVarint(2n ** 53n + 1n);
    expect(() => Binary.createReader(writer.toBytes()).varint()).toThrow(Binary.InvalidInputError);
  });

  test('throws InvalidInputError for a 10-byte varint over 64 bits', () => {
    const over = bytes(0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0x02);
    expect(() => Binary.createReader(over).bigVarint()).toThrow(Binary.InvalidInputError);
  });

  test('throws TruncatedError for a varint cut off at the end', () => {
    const reader = Binary.createReader(bytes(0x01, 0x80, 0x80));
    reader.uint8();
    const error = thrown(() => reader.varint());
    expect(error).toBeInstanceOf(Binary.TruncatedError);
    expect((error as Binary.TruncatedError).offset).toBe(1);
    expect(reader.offset).toBe(1);
  });

  test('throws a RangeError for an unknown encoding', () => {
    expect(() => Binary.createReader(bytes(0)).varint({ encoding: 'twos' as never })).toThrow(
      RangeError,
    );
  });
});
