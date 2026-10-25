import { BinaryReader, BinaryWriter } from '@bufbuild/protobuf/wire';
import { expect, test } from 'vite-plus/test';
import * as Binary from '@portable/binary';
import { fc, fuzz } from '@portable/fuzz';

const attempt = <value>(run: () => value): value | undefined => {
  try {
    return run();
  } catch {
    return undefined;
  }
};

test('reads uint64 and sint64 varints from random bytes as protobuf does when both accept them', () => {
  fuzz(
    fc.property(fc.uint8Array({ maxLength: 12 }), (bytes) => {
      for (const [encoding, read] of [
        ['unsigned', (r: BinaryReader) => r.uint64()],
        ['zigzag', (r: BinaryReader) => r.sint64()],
      ] as const) {
        const ours = attempt(() => Binary.createReader(bytes).bigVarint({ encoding }));
        const theirs = attempt(() => BigInt(read(new BinaryReader(bytes))));
        // protobuf keeps the low 64 bits of a 10-byte varint with extra high bits, which this
        // package rejects as malformed.
        expect(ours === undefined || theirs === undefined ? theirs : ours).toBe(theirs);
      }
    }),
  );
});

test('writes uint64 and sint64 varints as protobuf does', () => {
  fuzz(
    fc.property(fc.bigInt({ min: -(2n ** 63n), max: 2n ** 63n - 1n }), (value) => {
      const unsigned = BigInt.asUintN(64, value);
      const a = Binary.createWriter();
      a.bigVarint(unsigned);
      a.bigVarint(value, { encoding: 'zigzag' });
      expect(a.toBytes()).toEqual(new BinaryWriter().uint64(unsigned).sint64(value).finish());
    }),
  );
});
