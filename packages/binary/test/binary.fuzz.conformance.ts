import { expect, test } from 'vite-plus/test';
import * as Binary from '@portable/binary';
import {
  byteForm,
  cuts,
  fc,
  fuzz,
  outcome,
  outcomeAsync,
  readAll,
  split,
  streamOf,
  toByteForm,
} from '@portable/fuzz';

const encoding = fc.constantFrom(
  'unsigned',
  'zigzag',
  'signed',
) satisfies fc.Arbitrary<Binary.VarintEncoding>;
const endian = fc.constantFrom('big', 'little') satisfies fc.Arbitrary<Binary.Endian>;
const prefix = fc.constantFrom(
  'uint8',
  'uint16',
  'uint32',
  'varint',
) satisfies fc.Arbitrary<Binary.Prefix>;

const safeVarint = (encoding: Binary.VarintEncoding) => {
  const limit = encoding === 'zigzag' ? 2 ** 52 - 1 : Number.MAX_SAFE_INTEGER;
  return fc.oneof(
    fc.integer({ min: encoding === 'unsigned' ? 0 : -1000, max: 1000 }),
    fc.integer({ min: encoding === 'unsigned' ? 0 : -(2 ** 31), max: 2 ** 32 }),
    fc
      .double({ min: encoding === 'unsigned' ? 0 : -limit, max: limit, noNaN: true })
      .map((value) => Math.trunc(value) || 0),
  );
};

type Value =
  | { type: 'uint8' | 'int8' | 'uint16' | 'int16' | 'uint32' | 'int32'; value: number }
  | { type: 'bigUint64' | 'bigInt64'; value: bigint }
  | { type: 'float32' | 'float64'; value: number }
  | { type: 'uint' | 'int'; byteLength: number; value: number }
  | { type: 'varint'; encoding: Binary.VarintEncoding; value: number }
  | { type: 'bigVarint'; encoding: Binary.VarintEncoding; value: bigint }
  | { type: 'bytes'; value: Uint8Array }
  | { type: 'string' | 'cstring'; value: string };

const byteLength = fc.integer({ min: 1, max: 6 });

const value = fc.oneof(
  fc.integer({ min: 0, max: 0xff }).map((value) => ({ type: 'uint8' as const, value })),
  fc.integer({ min: -0x80, max: 0x7f }).map((value) => ({ type: 'int8' as const, value })),
  fc.integer({ min: 0, max: 0xffff }).map((value) => ({ type: 'uint16' as const, value })),
  fc.integer({ min: -0x8000, max: 0x7fff }).map((value) => ({ type: 'int16' as const, value })),
  fc.integer({ min: 0, max: 0xffffffff }).map((value) => ({ type: 'uint32' as const, value })),
  fc.integer().map((value) => ({ type: 'int32' as const, value })),
  fc
    .bigInt({ min: 0n, max: 2n ** 64n - 1n })
    .map((value) => ({ type: 'bigUint64' as const, value })),
  fc
    .bigInt({ min: -(2n ** 63n), max: 2n ** 63n - 1n })
    .map((value) => ({ type: 'bigInt64' as const, value })),
  fc.float({ noNaN: true }).map((value) => ({ type: 'float32' as const, value })),
  fc.double({ noNaN: true }).map((value) => ({ type: 'float64' as const, value })),
  byteLength.chain((n) =>
    fc
      .integer({ min: 0, max: 2 ** (8 * n) - 1 })
      .map((value) => ({ type: 'uint' as const, byteLength: n, value })),
  ),
  byteLength.chain((n) =>
    fc
      .integer({ min: -(2 ** (8 * n - 1)), max: 2 ** (8 * n - 1) - 1 })
      .map((value) => ({ type: 'int' as const, byteLength: n, value })),
  ),
  encoding.chain((encoding) =>
    safeVarint(encoding).map((value) => ({ type: 'varint' as const, encoding, value })),
  ),
  encoding.chain((encoding) =>
    (encoding === 'unsigned'
      ? fc.bigInt({ min: 0n, max: 2n ** 64n - 1n })
      : fc.bigInt({ min: -(2n ** 63n), max: 2n ** 63n - 1n })
    ).map((value) => ({ type: 'bigVarint' as const, encoding, value })),
  ),
  fc.uint8Array({ maxLength: 40 }).map((value) => ({ type: 'bytes' as const, value })),
  fc
    .string({ unit: 'grapheme', maxLength: 20 })
    .map((value) => ({ type: 'string' as const, value })),
  fc
    .string({ unit: 'grapheme', maxLength: 20 })
    .filter((value) => !value.includes('\0'))
    .map((value) => ({ type: 'cstring' as const, value })),
) satisfies fc.Arbitrary<Value>;

function write(writer: Binary.Writer, v: Value): void {
  switch (v.type) {
    case 'uint':
    case 'int':
      writer[v.type](v.byteLength, v.value);
      return;
    case 'varint':
      writer.varint(v.value, { encoding: v.encoding });
      return;
    case 'bigVarint':
      writer.bigVarint(v.value, { encoding: v.encoding });
      return;
    case 'bigUint64':
    case 'bigInt64':
      writer[v.type](v.value);
      return;
    case 'bytes':
      writer.bytes(v.value);
      return;
    case 'string':
    case 'cstring':
      writer[v.type](v.value);
      return;
    default:
      writer[v.type](v.value);
  }
}

function read(reader: Binary.Reader, v: Value): unknown {
  switch (v.type) {
    case 'uint':
    case 'int':
      return reader[v.type](v.byteLength);
    case 'varint':
      return reader.varint({ encoding: v.encoding });
    case 'bigVarint':
      return reader.bigVarint({ encoding: v.encoding });
    case 'bytes':
      return reader.bytes(v.value.length);
    case 'string':
      return reader.string(Binary.utf8Length(v.value));
    case 'cstring':
      return reader.cstring();
    default:
      return reader[v.type]();
  }
}

const expected = (v: Value) => (v.type === 'float32' ? Math.fround(v.value) : v.value);

test('reads back every sequence of values the writer wrote', () => {
  fuzz(
    fc.property(fc.array(value, { maxLength: 20 }), endian, (values, endian) => {
      const writer = Binary.createWriter({ endian });
      for (const v of values) {
        write(writer, v);
      }
      const reader = Binary.createReader(writer.toBytes(), { endian });
      for (const v of values) {
        expect(read(reader, v)).toEqual(expected(v));
      }
      expect(reader.remaining).toBe(0);
    }),
  );
});

test('reads random bytes, returning a value or throwing only its documented errors', () => {
  fuzz(
    fc.property(
      fc.uint8Array({ maxLength: 40 }),
      byteForm,
      fc.array(value, { maxLength: 10 }),
      endian,
      (bytes, form, values, endian) => {
        const reader = Binary.createReader(toByteForm(bytes, form), { endian });
        for (const v of values) {
          const before = reader.offset;
          const result = outcome([Binary.TruncatedError, Binary.InvalidInputError], () =>
            read(reader, v),
          );
          expect('error' in result ? reader.offset : before).toBe(before);
        }
      },
    ),
  );
});

test('a number varint and a bigint varint read the same bytes the same way', () => {
  fuzz(
    fc.property(fc.uint8Array({ maxLength: 12 }), encoding, (bytes, encoding) => {
      const number = outcome([Binary.TruncatedError, Binary.InvalidInputError], () =>
        Binary.createReader(bytes).varint({ encoding }),
      );
      fc.pre('value' in number);
      expect(Binary.createReader(bytes).bigVarint({ encoding })).toBe(BigInt(number.value));
    }),
  );
});

test('a number varint and a bigint varint write the same bytes', () => {
  fuzz(
    fc.property(
      encoding.chain((encoding) => fc.tuple(fc.constant(encoding), safeVarint(encoding))),
      ([encoding, value]) => {
        const a = Binary.createWriter();
        a.varint(value, { encoding });
        const b = Binary.createWriter();
        b.bigVarint(BigInt(value), { encoding });
        expect(a.toBytes()).toEqual(b.toBytes());
      },
    ),
  );
});

const frames = fc.array(fc.uint8Array({ maxLength: 300 }), { maxLength: 8 });

test('decodes the frames it encodes however the bytes are chunked', async () => {
  await fuzz(
    fc.asyncProperty(frames, prefix, endian, cuts, async (input, prefix, endian, at) => {
      const fitting = prefix === 'uint8' ? input.filter((f) => f.length <= 255) : input;
      const encoded = await readAll(
        streamOf(fitting).pipeThrough(new Binary.FrameEncoderStream({ prefix, endian })),
      );
      const joined = new Uint8Array(encoded.reduce((n, chunk) => n + chunk.length, 0));
      let offset = 0;
      for (const chunk of encoded) {
        joined.set(chunk, offset);
        offset += chunk.length;
      }
      const decoded = await readAll(
        streamOf(split(joined, at)).pipeThrough(new Binary.FrameDecoderStream({ prefix, endian })),
      );
      expect(decoded).toEqual(fitting);
    }),
  );
});

test('decodes random bytes the same way however they are chunked', async () => {
  await fuzz(
    fc.asyncProperty(
      fc.uint8Array({ maxLength: 64 }),
      prefix,
      fc.nat({ max: 80 }),
      cuts,
      async (bytes, prefix, maxBytes, at) => {
        const errors = [Binary.TruncatedError, Binary.InvalidInputError, Binary.MaxBytesError];
        const run = (chunks: Uint8Array[]) =>
          outcomeAsync(errors, () =>
            readAll(
              streamOf(chunks).pipeThrough(new Binary.FrameDecoderStream({ prefix, maxBytes })),
            ),
          );
        expect(await run(split(bytes, at))).toEqual(await run([bytes]));
      },
    ),
  );
});
