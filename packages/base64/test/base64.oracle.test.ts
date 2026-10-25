import { Buffer } from 'node:buffer';
import { Readable, type Transform } from 'node:stream';
import base64js from 'base64-js';
import { Base64 as jsBase64 } from 'js-base64';
import * as libbase64 from 'libbase64';
import { describe, expect, test } from 'vite-plus/test';
import { decode, encode } from '@portable/base64';
import {
  chunked,
  decodeStream,
  encodedLike,
  encodeStream,
  randomBytes,
  randomChunkSizes,
} from './utils.js';

async function viaNodeStream(transform: Transform, chunks: readonly Uint8Array[]): Promise<Buffer> {
  const output: Buffer[] = [];
  for await (const chunk of Readable.from(chunks).pipe(transform)) {
    output.push(chunk as Buffer);
  }
  return Buffer.concat(output);
}

const lengths = [0, 1, 2, 3, 4, 56, 57, 58, 599, 600, 601, 1140, 5000, 100_000];

describe('matches Buffer', () => {
  test('encode', () => {
    for (const [seed, length] of lengths.entries()) {
      const data = randomBytes(length, seed);
      expect(encode(data)).toBe(Buffer.from(data).toString('base64'));
      expect(encode(data, { alphabet: 'base64url', omitPadding: true })).toBe(
        Buffer.from(data).toString('base64url'),
      );
    }
  });

  test('decode of valid input with line breaks', () => {
    for (const [seed, length] of lengths.entries()) {
      const data = randomBytes(length, seed);
      const input = encode(data, { lineLength: 76 });
      expect(decode(input)).toEqual(new Uint8Array(Buffer.from(input, 'base64')));
      const url = Buffer.from(data).toString('base64url');
      expect(decode(url, { alphabet: 'base64url' })).toEqual(
        new Uint8Array(Buffer.from(url, 'base64url')),
      );
    }
  });
});

describe('matches libbase64', () => {
  // libbase64 before 1.4.0 encodes a plain Uint8Array as its comma-separated byte values, so it
  // gets a Buffer.
  test('encode with MIME line wrapping', () => {
    for (const [seed, length] of lengths.entries()) {
      const data = randomBytes(length, seed);
      for (const lineLength of [1, 9, 76]) {
        expect(encode(data, { lineLength })).toBe(
          libbase64.wrap(libbase64.encode(Buffer.from(data)), lineLength),
        );
      }
    }
  });

  test('EncoderStream with random chunking', async () => {
    for (const [seed, length] of lengths.entries()) {
      const data = randomBytes(length, seed);
      for (const lineLength of [9, 76] as const) {
        const chunks = chunked(data, randomChunkSizes(seed));
        const expected = await viaNodeStream(new libbase64.Encoder({ lineLength }), chunks);
        expect(await encodeStream(chunks, { lineLength })).toBe(expected.toString());
      }
    }
  });

  // libbase64 1.3.3 reads 8-bit and non-Latin-1 characters as base64 digits, which 1.4.0 and
  // 1.4.1 fixed, so the inputs here are ASCII. Its Decoder also skips `-` and `_`, which its
  // decode() reads as base64url digits. 'mime' mode reads them as digits in both.
  const asciiInput = (seed: number) =>
    Array.from(encodedLike(seed))
      .filter((char) => char.charCodeAt(0) < 0x80)
      .join('');

  test("decode in 'mime' mode, for any ASCII input", () => {
    for (let seed = 0; seed < 300; seed++) {
      const input = asciiInput(seed);
      expect(decode(input, { mode: 'mime' })).toEqual(new Uint8Array(libbase64.decode(input)));
    }
  });

  test("DecoderStream in 'mime' mode, for any ASCII input and chunking", async () => {
    for (let seed = 0; seed < 300; seed++) {
      const input = asciiInput(seed).replace(/[-_]/g, '');
      const chunks = chunked(Buffer.from(input, 'latin1'), randomChunkSizes(seed));
      const expected = await viaNodeStream(new libbase64.Decoder(), chunks);
      expect(await decodeStream(chunks, { mode: 'mime' })).toEqual(new Uint8Array(expected));
    }
  });
});

describe('matches base64-js and js-base64', () => {
  test('encode', () => {
    for (const [seed, length] of lengths.entries()) {
      const data = randomBytes(length, seed);
      expect(encode(data)).toBe(base64js.fromByteArray(data));
      expect(encode(data)).toBe(jsBase64.fromUint8Array(data));
      expect(encode(data, { alphabet: 'base64url', omitPadding: true })).toBe(
        jsBase64.fromUint8Array(data, true),
      );
    }
  });

  test('decode', () => {
    for (const [seed, length] of lengths.entries()) {
      const input = encode(randomBytes(length, seed));
      expect(decode(input)).toEqual(base64js.toByteArray(input));
      expect(decode(input)).toEqual(jsBase64.toUint8Array(input));
    }
  });

  test('encode of a string as UTF-8', () => {
    for (const input of ['', 'a', '小飼弾', '𠮷野家', 'ÕÄÖÜ'.repeat(300)]) {
      expect(encode(input)).toBe(jsBase64.encode(input));
    }
  });
});
