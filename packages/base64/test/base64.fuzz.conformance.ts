import * as Base64 from '@portable/base64';
import { byteForm, cuts, fc, fuzz, outcome, outcomeAsync, split, toByteForm } from '@portable/fuzz';
import { describe, expect, test } from 'vite-plus/test';
import { decodeStream, encodeStream, referenceDecode } from './utils.js';

const alphabet = fc.constantFrom<Base64.Alphabet>('base64', 'base64url');
const mode = fc.constantFrom<Base64.Mode>('loose', 'strict', 'mime');

const encodeOptions = fc.record(
  {
    alphabet,
    lineLength: fc.oneof(fc.constant(false as const), fc.integer({ min: 1, max: 80 })),
    newline: fc.constantFrom('\r\n', '\n', ' '),
    omitPadding: fc.boolean(),
  },
  { requiredKeys: [] },
);

const base64ish = fc.string({
  unit: fc.oneof(
    {
      weight: 12,
      arbitrary: fc.constantFrom(
        ...'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'.split(''),
      ),
    },
    { weight: 2, arbitrary: fc.constantFrom('+', '/', '-', '_', '=', '==') },
    { weight: 2, arbitrary: fc.constantFrom(' ', '\t', '\r\n', '\n', '\f') },
    { weight: 1, arbitrary: fc.string({ unit: 'binary', minLength: 1, maxLength: 1 }) },
  ),
  maxLength: 200,
});

const errors = [Base64.InvalidInputError, Base64.TruncatedError];

describe('decode', () => {
  test('returns the bytes encode was given, with any encode options', () => {
    fuzz(
      fc.property(fc.uint8Array({ maxLength: 300 }), encodeOptions, (bytes, options) => {
        const text = Base64.encode(bytes, options);
        expect(Base64.decode(text, { alphabet: options.alphabet })).toEqual(bytes);
      }),
    );
  });

  test('in strict mode returns the bytes encode was given with padding', () => {
    fuzz(
      fc.property(fc.uint8Array({ maxLength: 300 }), encodeOptions, (bytes, options) => {
        const text = Base64.encode(bytes, { ...options, omitPadding: false });
        expect(Base64.decode(text, { alphabet: options.alphabet, mode: 'strict' })).toEqual(bytes);
      }),
    );
  });

  test('returns or throws only InvalidInputError or TruncatedError for any text', () => {
    fuzz(
      fc.property(
        base64ish,
        alphabet,
        fc.constantFrom('loose', 'strict'),
        (text, alphabet, mode) => {
          outcome(errors, () => Base64.decode(text, { alphabet, mode }));
        },
      ),
    );
  });

  test('in mime mode never throws', () => {
    fuzz(
      fc.property(base64ish, alphabet, (text, alphabet) => {
        Base64.decode(text, { alphabet, mode: 'mime' });
      }),
    );
  });

  test('reads the same bytes from text and from its UTF-8', () => {
    fuzz(
      fc.property(base64ish, mode, (text, mode) => {
        const fromText = outcome(errors, () => Base64.decode(text, { mode }));
        const fromBytes = outcome(errors, () =>
          Base64.decode(new TextEncoder().encode(text), { mode }),
        );
        expect(fromBytes).toEqual(fromText);
      }),
    );
  });

  test('in strict mode accepts only what encode writes, apart from whitespace', () => {
    fuzz(
      fc.property(base64ish, alphabet, (text, alphabet) => {
        const result = outcome(errors, () => Base64.decode(text, { alphabet, mode: 'strict' }));
        const canonical = text.replace(/[ \t\r\n\f]/g, '');
        expect('value' in result ? Base64.encode(result.value, { alphabet }) : canonical).toBe(
          canonical,
        );
      }),
    );
  });

  test("in mime mode matches libbase64's reference decoder", () => {
    fuzz(
      fc.property(base64ish, (text) => {
        expect(Base64.decode(text, { mode: 'mime' })).toEqual(referenceDecode(text));
      }),
    );
  });
});

describe('EncoderStream', () => {
  test('writes the same text as encode however the bytes are chunked', async () => {
    await fuzz(
      fc.asyncProperty(
        fc.uint8Array({ maxLength: 300 }),
        cuts,
        encodeOptions,
        async (bytes, at, options) => {
          expect(await encodeStream(split(bytes, at), options)).toBe(Base64.encode(bytes, options));
        },
      ),
    );
  });
});

describe('DecoderStream', () => {
  test('returns the same bytes or error class as decode however the text is chunked', async () => {
    await fuzz(
      fc.asyncProperty(base64ish, cuts, mode, fc.boolean(), async (text, at, mode, asBytes) => {
        const input = asBytes ? new TextEncoder().encode(text) : text;
        expect(await outcomeAsync(errors, () => decodeStream(split(input, at), { mode }))).toEqual(
          outcome(errors, () => Base64.decode(text, { mode })),
        );
      }),
    );
  });
});

test('every byte form encodes and decodes like a Uint8Array', () => {
  fuzz(
    fc.property(fc.uint8Array({ maxLength: 64 }), byteForm, (bytes, form) => {
      const encoded = Base64.encode(bytes);
      expect(Base64.encode(toByteForm(bytes, form))).toBe(encoded);
      expect(Base64.decode(toByteForm(new TextEncoder().encode(encoded), form))).toEqual(bytes);
    }),
  );
});
