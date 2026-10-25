import { describe, expect, test } from 'vite-plus/test';
import * as Binary from '@portable/binary';

const bytes = (...values: number[]) => new Uint8Array(values);

describe('createWriter', () => {
  test('writes integers in big-endian order by default', () => {
    const writer = Binary.createWriter();
    writer.uint8(1);
    writer.int8(-1);
    writer.uint16(0x1234);
    writer.int16(-2);
    writer.uint32(0xdeadbeef);
    writer.int32(-0x80000000);
    expect(writer.toBytes()).toEqual(
      bytes(0x01, 0xff, 0x12, 0x34, 0xff, 0xfe, 0xde, 0xad, 0xbe, 0xef, 0x80, 0, 0, 0),
    );
  });

  test('writes integers in little-endian order', () => {
    const writer = Binary.createWriter({ endian: 'little' });
    writer.uint16(0x1234);
    writer.uint32(0xdeadbeef);
    writer.uint(3, 0x010203);
    writer.bigUint64(1n);
    expect(writer.toBytes()).toEqual(
      bytes(0x34, 0x12, 0xef, 0xbe, 0xad, 0xde, 0x03, 0x02, 0x01, 1, 0, 0, 0, 0, 0, 0, 0),
    );
  });

  test('writes 64-bit integers and floats', () => {
    const writer = Binary.createWriter();
    writer.bigUint64(2n ** 64n - 1n);
    writer.bigInt64(-2n);
    writer.float32(1.5);
    writer.float64(Math.PI);
    const reader = Binary.createReader(writer.toBytes());
    expect(reader.bigUint64()).toBe(2n ** 64n - 1n);
    expect(reader.bigInt64()).toBe(-2n);
    expect(reader.float32()).toBe(1.5);
    expect(reader.float64()).toBe(Math.PI);
  });

  test('writes integers of 1 to 6 bytes', () => {
    const writer = Binary.createWriter();
    writer.uint(6, 2 ** 48 - 1);
    writer.int(3, -1);
    writer.int(2, -0x8000);
    expect(writer.toBytes()).toEqual(
      bytes(0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0x80, 0x00),
    );
  });

  test('throws a RangeError for a value that does not fit and writes nothing', () => {
    const writer = Binary.createWriter();
    expect(() => writer.uint8(256)).toThrow(RangeError);
    expect(() => writer.uint8(-1)).toThrow(RangeError);
    expect(() => writer.int8(128)).toThrow(RangeError);
    expect(() => writer.uint16(1.5)).toThrow(RangeError);
    expect(() => writer.uint32(2 ** 32)).toThrow(RangeError);
    expect(() => writer.int32(2 ** 31)).toThrow(RangeError);
    expect(() => writer.uint(3, 2 ** 24)).toThrow(RangeError);
    expect(() => writer.int(3, 2 ** 23)).toThrow(RangeError);
    expect(() => writer.uint(7, 0)).toThrow(RangeError);
    expect(() => writer.bigUint64(-1n)).toThrow(RangeError);
    expect(() => writer.bigInt64(2n ** 63n)).toThrow(RangeError);
    expect(writer.length).toBe(0);
  });

  test('throws a TypeError for a value of the wrong type', () => {
    const writer = Binary.createWriter();
    expect(() => writer.uint8('1' as never)).toThrow(TypeError);
    expect(() => writer.bigUint64(1 as never)).toThrow(TypeError);
    expect(() => writer.float64(1n as never)).toThrow(TypeError);
    expect(() => writer.string(1 as never)).toThrow(TypeError);
    expect(() => writer.bytes([1] as never)).toThrow(TypeError);
  });

  test('grows past its initial size', () => {
    const writer = Binary.createWriter();
    const chunk = new Uint8Array(1000).fill(7);
    for (let i = 0; i < 10; i++) {
      writer.bytes(chunk);
    }
    writer.float64(1);
    const out = writer.toBytes();
    expect(out.length).toBe(10_008);
    expect(out[9_999]).toBe(7);
    expect(Binary.createReader(out.subarray(10_000)).float64()).toBe(1);
  });

  test('writes UTF-8 strings without a prefix', () => {
    const writer = Binary.createWriter();
    writer.string('héllo 😀');
    expect(writer.toBytes()).toEqual(new TextEncoder().encode('héllo 😀'));
  });

  test('writes a lone surrogate as U+FFFD, as TextEncoder does', () => {
    const writer = Binary.createWriter();
    writer.string('a\ud800b');
    expect(writer.toBytes()).toEqual(new TextEncoder().encode('a\ud800b'));
  });

  test('writes null-terminated strings', () => {
    const writer = Binary.createWriter();
    writer.cstring('ab');
    writer.cstring('é');
    expect(writer.toBytes()).toEqual(bytes(0x61, 0x62, 0, 0xc3, 0xa9, 0));
    expect(() => writer.cstring('a\0b')).toThrow(RangeError);
  });

  test('can go back and fill in a length written earlier', () => {
    const writer = Binary.createWriter();
    writer.uint16(0);
    writer.string('hello');
    const end = writer.offset;
    writer.offset = 0;
    writer.uint16(end - 2);
    writer.offset = writer.length;
    writer.uint8(0xff);
    expect(writer.toBytes()).toEqual(bytes(0, 5, 104, 101, 108, 108, 111, 0xff));
  });

  test('keeps length at the furthest byte written when offset moves back', () => {
    const writer = Binary.createWriter();
    writer.uint32(0);
    writer.offset = 1;
    writer.uint8(9);
    expect(writer.length).toBe(4);
    expect(writer.offset).toBe(2);
    expect(writer.toBytes()).toEqual(bytes(0, 9, 0, 0));
  });

  test('throws a RangeError for an offset past the bytes written', () => {
    const writer = Binary.createWriter();
    writer.uint8(1);
    expect(() => (writer.offset = 2)).toThrow(RangeError);
  });

  test('returns a copy from toBytes', () => {
    const writer = Binary.createWriter();
    writer.uint8(1);
    const first = writer.toBytes();
    writer.offset = 0;
    writer.uint8(2);
    expect(first).toEqual(bytes(1));
    expect(first.buffer).toBeInstanceOf(ArrayBuffer);
  });
});

describe('varint', () => {
  const write = (value: number, options?: Binary.Writer.VarintOptions) => {
    const writer = Binary.createWriter();
    writer.varint(value, options);
    return writer.toBytes();
  };

  test('writes unsigned varints', () => {
    expect(write(0)).toEqual(bytes(0));
    expect(write(127)).toEqual(bytes(0x7f));
    expect(write(128)).toEqual(bytes(0x80, 0x01));
    expect(write(300)).toEqual(bytes(0xac, 0x02));
    expect(write(Number.MAX_SAFE_INTEGER)).toEqual(
      bytes(0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0x0f),
    );
  });

  test('writes a Minecraft VarInt from a signed 32-bit integer with `>>> 0`', () => {
    expect(write(-1 >>> 0)).toEqual(bytes(0xff, 0xff, 0xff, 0xff, 0x0f));
  });

  test('writes zigzag and signed varints', () => {
    expect(write(-1, { encoding: 'zigzag' })).toEqual(bytes(1));
    expect(write(-128, { encoding: 'zigzag' })).toEqual(bytes(0xff, 0x01));
    expect(write(-123456, { encoding: 'signed' })).toEqual(bytes(0xc0, 0xbb, 0x78));
    expect(write(63, { encoding: 'signed' })).toEqual(bytes(0x3f));
    expect(write(64, { encoding: 'signed' })).toEqual(bytes(0xc0, 0x00));
    expect(write(-64, { encoding: 'signed' })).toEqual(bytes(0x40));
    expect(write(-65, { encoding: 'signed' })).toEqual(bytes(0xbf, 0x7f));
  });

  test('throws a RangeError for a value outside the encoding range', () => {
    expect(() => write(-1)).toThrow(RangeError);
    expect(() => write(1.5)).toThrow(RangeError);
    expect(() => write(2 ** 53)).toThrow(RangeError);
    expect(() => write(2 ** 52, { encoding: 'zigzag' })).toThrow(RangeError);
    expect(write(-(2 ** 52), { encoding: 'zigzag' })).toEqual(
      bytes(0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0x0f),
    );
  });

  test('writes 64-bit varints from bigints', () => {
    const writer = Binary.createWriter();
    writer.bigVarint(2n ** 64n - 1n);
    writer.bigVarint(-(2n ** 63n), { encoding: 'zigzag' });
    writer.bigVarint(-1n, { encoding: 'signed' });
    const reader = Binary.createReader(writer.toBytes());
    expect(reader.bigVarint()).toBe(2n ** 64n - 1n);
    expect(reader.bigVarint({ encoding: 'zigzag' })).toBe(-(2n ** 63n));
    expect(reader.bigVarint({ encoding: 'signed' })).toBe(-1n);
    expect(() => writer.bigVarint(2n ** 64n)).toThrow(RangeError);
    expect(() => writer.bigVarint(-1n)).toThrow(RangeError);
  });
});

describe('utf8Length', () => {
  test('counts UTF-8 bytes', () => {
    for (const text of ['', 'abc', 'é', '€', '😀', 'a\ud800', '\udc00b', 'héllo 😀 wörld']) {
      expect(Binary.utf8Length(text)).toBe(new TextEncoder().encode(text).length);
    }
  });

  test('throws a TypeError for a value that is not a string', () => {
    expect(() => Binary.utf8Length(1 as never)).toThrow(TypeError);
  });
});
