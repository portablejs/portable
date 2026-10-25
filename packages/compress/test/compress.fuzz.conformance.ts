import * as Compress from '@portable/compress';
import { byteForm, cuts, fc, fuzz, mutated, outcomeAsync, split, toByteForm } from '@portable/fuzz';
import { expect, test } from 'vite-plus/test';
import { decodeChunks, formats } from './utils.js';

const errors = [Compress.InvalidInputError, Compress.TruncatedError, Compress.MaxBytesError];
const format = fc.constantFrom(...formats);

const data = fc.oneof(
  fc.uint8Array({ maxLength: 2000 }),
  fc
    .array(fc.constantFrom('tere ', 'õhtust ', 'a', '\n', '0'), { maxLength: 400 })
    .map((pieces) => new TextEncoder().encode(pieces.join(''))),
);

test('decodes what encode writes, however the bytes are chunked', async () => {
  await fuzz(
    fc.asyncProperty(data, format, cuts, async (bytes, format, at) => {
      const encoded = await Compress.encode(bytes, { format });
      expect(await Compress.decode(encoded, { format })).toEqual(bytes);
      expect(await decodeChunks(split(encoded, at), { format })).toEqual(bytes);
    }),
  );
});

test('maxBytes allows exactly that many bytes', async () => {
  await fuzz(
    fc.asyncProperty(data, format, fc.nat(2100), async (bytes, format, maxBytes) => {
      const encoded = await Compress.encode(bytes, { format });
      const result = await outcomeAsync(errors, () =>
        Compress.decode(encoded, { format, maxBytes }),
      );
      expect(result).toEqual(
        bytes.length > maxBytes ? { error: Compress.MaxBytesError } : { value: bytes },
      );
    }),
  );
});

test('rejects mutated data only with documented errors, and the stream agrees with decode', async () => {
  const original = await Compress.encode(new TextEncoder().encode('tere õhtust, '.repeat(40)), {
    format: 'gzip',
  });
  await fuzz(
    fc.asyncProperty(mutated(original), format, cuts, async (bytes, format, at) => {
      const whole = await outcomeAsync(errors, () => Compress.decode(bytes, { format }));
      const chunked = await outcomeAsync(errors, () => decodeChunks(split(bytes, at), { format }));
      expect(chunked).toEqual(whole);
    }),
  );
});

test('crc32 continues across chunks', () => {
  fuzz(
    fc.property(fc.uint8Array({ maxLength: 500 }), cuts, (bytes, at) => {
      const running = split(bytes, at).reduce((crc, chunk) => Compress.crc32(chunk, crc), 0);
      expect(running).toBe(Compress.crc32(bytes));
    }),
  );
});

test('crc32 gives the same checksum for every byte form', () => {
  fuzz(
    fc.property(fc.uint8Array({ maxLength: 256 }), byteForm, (bytes, form) => {
      expect(Compress.crc32(toByteForm(bytes, form))).toBe(Compress.crc32(bytes));
    }),
  );
});
