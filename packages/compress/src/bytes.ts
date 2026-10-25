import * as Bytes from '@portable/bytes';
import { toBufferSource } from '@portable/bytes/internal';

export function assertMaxBytes(maxBytes: number): void {
  if (!(maxBytes >= 0)) {
    throw new RangeError('`maxBytes` must be a number >= 0.');
  }
}

/** Joins chunks like `Bytes.concat`, but returns a single chunk without copying it. */
export function concat(chunks: readonly Uint8Array[]): Uint8Array<ArrayBuffer> {
  return chunks.length === 1 ? toBufferSource(chunks[0]!) : Bytes.concat(chunks);
}
