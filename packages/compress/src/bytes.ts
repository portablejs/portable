import { toBufferSource } from '@portable/bytes/internal';

export function concat(chunks: readonly Uint8Array[], length: number): Uint8Array<ArrayBuffer> {
  if (chunks.length === 1 && chunks[0]!.byteLength === length) {
    return toBufferSource(chunks[0]!);
  }
  const out = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}
