import { Readable } from 'node:stream';
import split2 from 'split2';
import { describe, expect, test } from 'vite-plus/test';
import rfc from './fixtures/rfc.txt?raw';
import { encode, split } from './utils.js';

async function viaSplit2(chunks: readonly Uint8Array[], ...args: unknown[]): Promise<string[]> {
  const lines: string[] = [];
  for await (const line of Readable.from(chunks).pipe(split2(...(args as [])))) {
    lines.push(line);
  }
  return lines;
}

function randomChunks(bytes: Uint8Array, seed: number): Uint8Array[] {
  let state = seed;
  const random = () => {
    state = (state * 1103515245 + 12345) % 2 ** 31;
    return state / 2 ** 31;
  };
  const chunks: Uint8Array[] = [];
  for (let i = 0; i < bytes.length;) {
    const size = 1 + Math.floor(random() * 64);
    chunks.push(bytes.subarray(i, i + size));
    i += size;
  }
  return chunks;
}

const inputs = {
  rfc,
  crlf: rfc.replaceAll('\n', '\r\n'),
  multibyte: '烫烫烫\r\n锟斤拷\n\n🚀 emoji\nlast line without newline',
  blank: '\n\n\n',
  trailing: 'a\nb\n',
};

describe('matches split2 output byte for byte', () => {
  for (const [name, text] of Object.entries(inputs)) {
    for (const seed of [1, 2, 3]) {
      test(`${name}, random chunking ${seed}`, async () => {
        const chunks = randomChunks(encode(text), seed);
        expect(await split(chunks)).toEqual(await viaSplit2(chunks));
      });
    }
  }

  test('custom separator', async () => {
    const chunks = randomChunks(encode('a~b~~c~'), 7);
    expect(await split(chunks, { separator: '~' })).toEqual(await viaSplit2(chunks, '~'));
  });
});
