import * as MimeStream from '@portable/mime-stream';
import { fromIterable, toArray, toBytes } from '@portable/streams';

const files = import.meta.glob<string>('./fixtures/*', { query: '?url&inline', import: 'default' });

export const fixtureNames: readonly string[] = Object.keys(files)
  .map((path) => path.slice('./fixtures/'.length))
  .sort();

export async function fixture(name: string): Promise<Uint8Array> {
  const load = files[`./fixtures/${name}`];
  if (!load) {
    throw new Error(`No fixture ${name}`);
  }
  return new Uint8Array(await (await fetch(await load())).arrayBuffer());
}

export const encode = (text: string): Uint8Array => new TextEncoder().encode(text);

/** Reads bytes as Latin-1, so every byte maps to one character and back. */
export const latin1 = (bytes: Uint8Array): string => {
  let text = '';
  for (let i = 0; i < bytes.length; i += 8192) {
    text += String.fromCharCode(...bytes.subarray(i, i + 8192));
  }
  return text;
};

export const binary = (text: string): Uint8Array =>
  Uint8Array.from(text, (character) => character.charCodeAt(0));

export function chunked(bytes: Uint8Array, size: number): Uint8Array[] {
  const chunks: Uint8Array[] = [];
  for (let i = 0; i < bytes.length; i += size) {
    chunks.push(bytes.subarray(i, i + size));
  }
  return chunks;
}

export function randomChunks(bytes: Uint8Array, seed: number, maxSize = 64): Uint8Array[] {
  let state = seed;
  const random = () => {
    state = (state * 1103515245 + 12345) % 2 ** 31;
    return state / 2 ** 31;
  };
  const chunks: Uint8Array[] = [];
  for (let i = 0; i < bytes.length;) {
    const size = 1 + Math.floor(random() * maxSize);
    chunks.push(bytes.subarray(i, i + size));
    i += size;
  }
  return chunks;
}

const toChunks = (input: string | Uint8Array | readonly Uint8Array[]): Uint8Array[] =>
  typeof input === 'string' ? [binary(input)] : input instanceof Uint8Array ? [input] : [...input];

/** Decodes a message given as Latin-1 text, bytes, or byte chunks. */
export function decode(
  input: string | Uint8Array | readonly Uint8Array[],
  options?: MimeStream.DecoderStream.Options,
): Promise<MimeStream.Chunk[]> {
  return toArray(fromIterable(toChunks(input)).pipeThrough(new MimeStream.DecoderStream(options)));
}

export async function roundTrip(
  input: string | Uint8Array | readonly Uint8Array[],
  options?: MimeStream.DecoderStream.Options,
): Promise<Uint8Array> {
  return toBytes(
    fromIterable(toChunks(input))
      .pipeThrough(new MimeStream.DecoderStream(options))
      .pipeThrough(new MimeStream.EncoderStream()),
  );
}

/** Chunks as `[type, Latin-1 text]` pairs, with consecutive chunks of one type and part joined. */
export function summary(chunks: readonly MimeStream.Chunk[]): [string, string][] {
  const result: [string, string][] = [];
  let last: MimeStream.Chunk | undefined;
  for (const chunk of chunks) {
    const text = latin1(chunk.bytes);
    if (
      last &&
      last.type === chunk.type &&
      last.part === chunk.part &&
      chunk.type !== 'delimiter'
    ) {
      result[result.length - 1]![1] += text;
    } else {
      result.push([chunk.type, text]);
    }
    last = chunk;
  }
  return result;
}

/** Content types of the parts, in the order their headers appear. */
export const contentTypes = (chunks: readonly MimeStream.Chunk[]): string[] =>
  chunks.filter((chunk) => chunk.type === 'headers').map((chunk) => chunk.part.contentType);

/** Body of each leaf part, joined, in order. */
export function bodies(chunks: readonly MimeStream.Chunk[]): string[] {
  const parts: MimeStream.Part[] = [];
  const text = new Map<MimeStream.Part, string>();
  for (const chunk of chunks) {
    if (chunk.type === 'headers') {
      parts.push(chunk.part);
    }
    if (chunk.type === 'body') {
      text.set(chunk.part, (text.get(chunk.part) ?? '') + latin1(chunk.bytes));
    }
  }
  return parts.filter((part) => !part.boundary).map((part) => text.get(part) ?? '');
}
