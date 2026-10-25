import zlib from 'node:zlib';
import * as Compress from '@portable/compress';
import { fc, fuzz, mutated, outcomeAsync } from '@portable/fuzz';
import { expect, test } from 'vite-plus/test';

const errors = [Compress.InvalidInputError, Compress.TruncatedError];

const zlibDecode = {
  gzip: zlib.gunzipSync,
  deflate: zlib.inflateSync,
  'deflate-raw': zlib.inflateRawSync,
};
const zlibEncode = {
  gzip: zlib.gzipSync,
  deflate: zlib.deflateSync,
  'deflate-raw': zlib.deflateRawSync,
};

const data = fc.oneof(
  fc.uint8Array({ maxLength: 500 }),
  fc
    .array(fc.constantFrom('tere ', 'õhtust ', 'a', '\n', '0'), { maxLength: 200 })
    .map((pieces) => new TextEncoder().encode(pieces.join(''))),
);

const input = fc
  .tuple(fc.constantFrom('gzip', 'deflate', 'deflate-raw') as fc.Arbitrary<Compress.Format>, data)
  .chain(([format, data]) =>
    fc.record({
      format: fc.constant(format),
      bytes: fc.oneof(
        fc.constant(new Uint8Array(zlibEncode[format](data))),
        mutated(new Uint8Array(zlibEncode[format](data))),
      ),
    }),
  );

// node:zlib ignores bytes after the end of the data, and decode throws on them, so decode accepts
// a subset of what zlib accepts.
test('decode returns what node:zlib returns, and accepts nothing zlib rejects', async () => {
  await fuzz(
    fc.asyncProperty(input, async ({ format, bytes }) => {
      const ours = await outcomeAsync(errors, () => Compress.decode(bytes, { format }));
      if (!('value' in ours)) {
        return;
      }
      expect(ours.value).toEqual(new Uint8Array(zlibDecode[format](bytes)));
    }),
  );
});
