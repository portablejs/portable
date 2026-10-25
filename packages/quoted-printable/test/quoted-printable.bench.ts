import { Buffer } from 'node:buffer';
import { Readable } from 'node:stream';
import { buffer } from 'node:stream/consumers';
import libqp2 from 'libqp';
import quotedPrintable from 'quoted-printable';
import { describe, expect, test } from 'vite-plus/test';
import { decode, encode, DecoderStream, EncoderStream } from '@portable/quoted-printable';
import * as libqp3 from './fixtures/libqp-3.0.1.js';
import { collect, fromChunks, random, split } from './utils.js';

const next = random(42);
const words = [
  'the',
  'quick',
  'brown',
  'fox',
  'jumps',
  'över',
  'naïve',
  'café',
  '€5',
  'déjà',
  'vu,',
  'end.',
];
let prose = '';
while (prose.length < 512 * 1024) {
  prose += words[Math.floor(next() * words.length)]! + (next() < 0.02 ? '\r\n' : ' ');
}

const text = new TextEncoder().encode(prose);
const textBuffer = Buffer.from(text);
const textBinaryString = textBuffer.toString('latin1');
const binary = Uint8Array.from({ length: 256 * 1024 }, () => Math.floor(next() * 256));
const binaryBuffer = Buffer.from(binary);

const encodedText = encode(text);
const encodedTextBytes = new TextEncoder().encode(encodedText);
const encodedBinary = encode(binary);

const textChunks = split(text, 16 * 1024);
const encodedChunks = split(encodedTextBytes, 16 * 1024);

const pipeNode = async (stream: NodeJS.ReadWriteStream, chunks: readonly Uint8Array[]) =>
  buffer(
    Readable.from(
      chunks.map((chunk) => Buffer.from(chunk.buffer, chunk.byteOffset, chunk.length)),
    ).pipe(stream),
  );

describe('encode', () => {
  test('512 KB of text with line breaks', async ({ bench }) => {
    const result = await bench.compare(
      bench('@portable/quoted-printable', () => {
        encode(text);
      }),
      bench('libqp 2.1.3', () => {
        libqp2.wrap(libqp2.encode(textBuffer), 76);
      }),
      bench('libqp 3.0.1', () => {
        libqp3.wrap(libqp3.encode(textBuffer), 76);
      }),
      bench('quoted-printable', () => {
        quotedPrintable.encode(textBinaryString);
      }),
    );
    for (const upstream of ['libqp 2.1.3', 'libqp 3.0.1', 'quoted-printable'] as const) {
      expect(result.get(upstream)).not.toBeFasterThan(result.get('@portable/quoted-printable'), {
        delta: 0.25,
      });
    }
  });

  test('256 KB of random bytes with line breaks', async ({ bench }) => {
    const result = await bench.compare(
      bench('@portable/quoted-printable', () => {
        encode(binary);
      }),
      bench('libqp 2.1.3', () => {
        libqp2.wrap(libqp2.encode(binaryBuffer), 76);
      }),
      bench('libqp 3.0.1', () => {
        libqp3.wrap(libqp3.encode(binaryBuffer), 76);
      }),
    );
    for (const upstream of ['libqp 2.1.3', 'libqp 3.0.1'] as const) {
      expect(result.get(upstream)).not.toBeFasterThan(result.get('@portable/quoted-printable'), {
        delta: 0.25,
      });
    }
  });

  test('stream of 512 KB of text in 16 KB chunks', async ({ bench }) => {
    const result = await bench.compare(
      bench('@portable/quoted-printable', async () => {
        await collect(fromChunks(textChunks).pipeThrough(new EncoderStream()));
      }),
      bench('libqp 2.1.3', async () => {
        await pipeNode(new libqp2.Encoder(), textChunks);
      }),
      bench('libqp 3.0.1', async () => {
        await pipeNode(new libqp3.Encoder(), textChunks);
      }),
    );
    for (const upstream of ['libqp 2.1.3', 'libqp 3.0.1'] as const) {
      expect(result.get(upstream)).not.toBeFasterThan(result.get('@portable/quoted-printable'), {
        delta: 0.25,
      });
    }
  });
});

describe('decode', () => {
  test('quoted-printable text', async ({ bench }) => {
    const result = await bench.compare(
      bench('@portable/quoted-printable', () => {
        decode(encodedText);
      }),
      bench('libqp 2.1.3', () => {
        libqp2.decode(encodedText);
      }),
      bench('libqp 3.0.1', () => {
        libqp3.decode(encodedText);
      }),
      bench('quoted-printable', () => {
        quotedPrintable.decode(encodedText);
      }),
    );
    for (const upstream of ['libqp 2.1.3', 'libqp 3.0.1', 'quoted-printable'] as const) {
      expect(result.get(upstream)).not.toBeFasterThan(result.get('@portable/quoted-printable'), {
        delta: 0.25,
      });
    }
  });

  test('quoted-printable random bytes', async ({ bench }) => {
    const result = await bench.compare(
      bench('@portable/quoted-printable', () => {
        decode(encodedBinary);
      }),
      bench('libqp 2.1.3', () => {
        libqp2.decode(encodedBinary);
      }),
      bench('libqp 3.0.1', () => {
        libqp3.decode(encodedBinary);
      }),
      bench('quoted-printable', () => {
        quotedPrintable.decode(encodedBinary);
      }),
    );
    for (const upstream of ['libqp 2.1.3', 'libqp 3.0.1', 'quoted-printable'] as const) {
      expect(result.get(upstream)).not.toBeFasterThan(result.get('@portable/quoted-printable'), {
        delta: 0.25,
      });
    }
  });

  test('stream of quoted-printable text in 16 KB chunks', async ({ bench }) => {
    const result = await bench.compare(
      bench('@portable/quoted-printable', async () => {
        await collect(fromChunks(encodedChunks).pipeThrough(new DecoderStream()));
      }),
      bench('libqp 2.1.3', async () => {
        await pipeNode(new libqp2.Decoder(), encodedChunks);
      }),
      bench('libqp 3.0.1', async () => {
        await pipeNode(new libqp3.Decoder(), encodedChunks);
      }),
    );
    for (const upstream of ['libqp 2.1.3', 'libqp 3.0.1'] as const) {
      expect(result.get(upstream)).not.toBeFasterThan(result.get('@portable/quoted-printable'), {
        delta: 0.25,
      });
    }
  });
});
