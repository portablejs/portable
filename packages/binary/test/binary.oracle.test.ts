import { BinaryReader, BinaryWriter } from '@bufbuild/protobuf/wire';
import * as lp from 'it-length-prefixed';
import { SmartBuffer } from 'smart-buffer';
import varint from 'varint';
import { describe, expect, test } from 'vite-plus/test';
import * as Binary from '@portable/binary';
import { readAll, streamOf } from '@portable/fuzz';

const written = (write: (writer: Binary.Writer) => void, options?: Binary.createWriter.Options) => {
  const writer = Binary.createWriter(options);
  write(writer);
  return writer.toBytes();
};

describe('Buffer', () => {
  const values = [0, 1, -1, 127, -128, 255, 0x1234, -0x8000, 0xffff, 0x7fffffff, -0x80000000];

  test('writes the same bytes as the Buffer write methods', () => {
    for (const endian of ['big', 'little'] as const) {
      const suffix = endian === 'big' ? 'BE' : 'LE';
      for (const value of values) {
        const buffer = Buffer.alloc(4);
        buffer[`writeInt32${suffix}`](value);
        expect(written((w) => w.int32(value), { endian })).toEqual(new Uint8Array(buffer));
      }
      for (const value of values.filter((value) => value >= -0x8000 && value <= 0x7fff)) {
        const buffer = Buffer.alloc(2);
        buffer[`writeInt16${suffix}`](value);
        expect(written((w) => w.int16(value), { endian })).toEqual(new Uint8Array(buffer));
      }
      for (const n of [1, 2, 3, 4, 5, 6]) {
        const max = 2 ** (8 * n) - 1;
        for (const value of [0, 1, max, Math.floor(max / 3)]) {
          const buffer = Buffer.alloc(n);
          buffer[`writeUInt${suffix}`](value, 0, n);
          expect(written((w) => w.uint(n, value), { endian })).toEqual(new Uint8Array(buffer));
          const signed = value - Math.floor((max + 1) / 2);
          buffer[`writeInt${suffix}`](signed, 0, n);
          expect(written((w) => w.int(n, signed), { endian })).toEqual(new Uint8Array(buffer));
        }
      }
    }
  });

  test('reads the same values as the Buffer read methods', () => {
    const buffer = Buffer.from([0x80, 0xff, 0x01, 0x7f, 0xde, 0xad, 0xbe, 0xef, 0x3f, 0xc0, 0x00]);
    for (const endian of ['big', 'little'] as const) {
      const suffix = endian === 'big' ? 'BE' : 'LE';
      for (let offset = 0; offset + 8 <= buffer.length; offset++) {
        const reader = Binary.createReader(buffer.subarray(offset), { endian });
        expect(reader.uint16()).toBe(buffer[`readUInt16${suffix}`](offset));
        reader.offset = 0;
        expect(reader.int32()).toBe(buffer[`readInt32${suffix}`](offset));
        reader.offset = 0;
        expect(reader.uint32()).toBe(buffer[`readUInt32${suffix}`](offset));
        reader.offset = 0;
        expect(reader.float32()).toBe(buffer[`readFloat${suffix}`](offset));
        reader.offset = 0;
        expect(reader.bigInt64()).toBe(buffer[`readBigInt64${suffix}`](offset));
        reader.offset = 0;
        expect(reader.int(3)).toBe(buffer[`readInt${suffix}`](offset, 3));
      }
    }
  });
});

describe('smart-buffer', () => {
  test('reads and writes null-terminated strings the same way', () => {
    const smart = new SmartBuffer();
    smart.writeStringNT('héllo');
    smart.writeStringNT('');
    const ours = written((w) => {
      w.cstring('héllo');
      w.cstring('');
    });
    expect(ours).toEqual(new Uint8Array(smart.toBuffer()));
    const reader = Binary.createReader(ours);
    const theirs = SmartBuffer.fromBuffer(Buffer.from(ours));
    expect(reader.cstring()).toBe(theirs.readStringNT());
    expect(reader.cstring()).toBe(theirs.readStringNT());
  });

  test('writes a length-prefixed record the same way', () => {
    const smart = new SmartBuffer();
    smart.writeUInt16BE(Buffer.byteLength('ok'));
    smart.writeString('ok');
    smart.writeDoubleLE(1.25);
    smart.writeBigUInt64BE(2n ** 63n);
    const ours = written((w) => {
      w.uint16(Binary.utf8Length('ok'));
      w.string('ok');
      w.endian = 'little';
      w.float64(1.25);
      w.endian = 'big';
      w.bigUint64(2n ** 63n);
    });
    expect(ours).toEqual(new Uint8Array(smart.toBuffer()));
  });
});

describe('varint', () => {
  const values = [0, 1, 127, 128, 300, 16_383, 16_384, 2 ** 31, 2 ** 32 - 1, 2 ** 49 + 7];

  test('encodes and decodes unsigned varints the same way', () => {
    for (const value of values) {
      const theirs = new Uint8Array(varint.encode(value));
      expect(written((w) => w.varint(value))).toEqual(theirs);
      expect(Binary.createReader(theirs).varint()).toBe(varint.decode(theirs));
    }
  });
});

describe('@bufbuild/protobuf', () => {
  test('writes uint64 and sint64 varints the same way', () => {
    for (const value of [0n, 1n, 300n, 2n ** 63n, 2n ** 64n - 1n]) {
      expect(written((w) => w.bigVarint(value))).toEqual(new BinaryWriter().uint64(value).finish());
    }
    for (const value of [0n, -1n, 1n, -(2n ** 63n), 2n ** 63n - 1n]) {
      expect(written((w) => w.bigVarint(value, { encoding: 'zigzag' }))).toEqual(
        new BinaryWriter().sint64(value).finish(),
      );
    }
  });

  test('writes sint32 and uint32 as number varints the same way', () => {
    for (const value of [0, -1, 1, -(2 ** 31), 2 ** 31 - 1]) {
      expect(written((w) => w.varint(value, { encoding: 'zigzag' }))).toEqual(
        new BinaryWriter().sint32(value).finish(),
      );
    }
    for (const value of [0, 1, 2 ** 32 - 1]) {
      expect(written((w) => w.varint(value))).toEqual(new BinaryWriter().uint32(value).finish());
    }
  });

  test('writes a negative int32 the way protobuf does with BigInt.asUintN', () => {
    const theirs = new BinaryWriter().int32(-1).finish();
    expect(theirs).toHaveLength(10);
    expect(written((w) => w.bigVarint(BigInt.asUintN(64, -1n)))).toEqual(theirs);
    expect(Number(BigInt.asIntN(32, Binary.createReader(theirs).bigVarint()))).toBe(
      new BinaryReader(theirs).int32(),
    );
  });
});

describe('it-length-prefixed', () => {
  const frames = [new Uint8Array([1, 2, 3]), new Uint8Array(), new Uint8Array(500).fill(9)];

  test('encodes the same frames', async () => {
    const theirs = [...lp.encode(frames)];
    const ours = await readAll(streamOf(frames).pipeThrough(new Binary.FrameEncoderStream()));
    expect(Buffer.concat(ours)).toEqual(Buffer.concat(theirs));
  });

  test('decodes the same frames', async () => {
    const encoded = Buffer.concat([...lp.encode(frames)]);
    const theirs = [...lp.decode([encoded])].map((list) => list.subarray());
    const ours = await readAll(
      streamOf([new Uint8Array(encoded)]).pipeThrough(new Binary.FrameDecoderStream()),
    );
    expect(ours.map((frame) => new Uint8Array(frame))).toEqual(
      theirs.map((frame) => new Uint8Array(frame)),
    );
  });
});
