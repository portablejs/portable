import * as QuotedPrintable from '@portable/quoted-printable';
import { byteForm, cuts, fc, fuzz, split, toByteForm } from '@portable/fuzz';
import { expect, test } from 'vite-plus/test';
import { decodeStream, encodeStream } from './utils.js';

const options = fc.record(
  {
    binary: fc.boolean(),
    lineLength: fc.oneof(fc.constant(false as const), fc.integer({ min: 4, max: 100 })),
  },
  { requiredKeys: [] },
);

const specialBytes = fc.constantFrom(...[13, 10, 32, 9, 0x2d, 0x3d, 0xc3, 0xb5].map((n) => [n]));
const bytes = fc
  .array(fc.oneof(fc.uint8Array({ maxLength: 4 }), specialBytes), { maxLength: 60 })
  .map((parts) => Uint8Array.from(parts.flatMap((part) => [...part])));

const quotedPrintableLike = fc
  .array(
    fc.oneof(
      fc.constantFrom(
        '=',
        '=\r\n',
        '=\n',
        '=3D',
        '=c3',
        '=G1',
        ' \r\n',
        '\t',
        '\r',
        '\n',
        'a',
        '-',
      ),
      fc.string({ unit: 'binary-ascii', maxLength: 2 }),
    ),
    { maxLength: 40 },
  )
  .map((parts) => new TextEncoder().encode(parts.join('')));

test('decode returns the bytes encode was given, with any options', () => {
  fuzz(
    fc.property(bytes, options, (input, options) => {
      expect(QuotedPrintable.decode(QuotedPrintable.encode(input, options))).toEqual(input);
    }),
  );
});

test('decode never throws and never returns more bytes than it was given', () => {
  fuzz(
    fc.property(fc.oneof(quotedPrintableLike, fc.uint8Array({ maxLength: 100 })), (input) => {
      expect(QuotedPrintable.decode(input).length).toBeLessThanOrEqual(input.length);
    }),
  );
});

test('EncoderStream writes what encode writes, however the input is chunked', async () => {
  await fuzz(
    fc.asyncProperty(bytes, cuts, options, async (input, at, options) => {
      expect(await encodeStream(split(input, at), options)).toBe(
        QuotedPrintable.encode(input, options),
      );
    }),
  );
});

test('DecoderStream returns what decode returns, however the input is chunked', async () => {
  await fuzz(
    fc.asyncProperty(quotedPrintableLike, cuts, async (input, at) => {
      expect(await decodeStream(split(input, at))).toEqual(QuotedPrintable.decode(input));
    }),
  );
});

test('every byte form encodes and decodes like a Uint8Array', () => {
  fuzz(
    fc.property(fc.uint8Array({ maxLength: 64 }), byteForm, (bytes, form) => {
      const encoded = QuotedPrintable.encode(bytes);
      expect(QuotedPrintable.encode(toByteForm(bytes, form))).toBe(encoded);
      expect(QuotedPrintable.decode(toByteForm(new TextEncoder().encode(encoded), form))).toEqual(
        bytes,
      );
    }),
  );
});
