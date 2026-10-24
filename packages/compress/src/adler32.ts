import { TruncatedError } from './errors.js';

let lax: Promise<boolean> | undefined;

/**
 * Resolves to true if the runtime's `DecompressionStream('deflate')` closes without an error when
 * the zlib input is cut short, as Deno 2.9's does. The decoders then compare the Adler-32 trailer
 * with the output themselves.
 */
export function needsTrailerCheck(): Promise<boolean> {
  lax ??= new Response(
    new Blob([new Uint8Array([0x78, 0x9c, 0x4b, 0x04, 0x00])])
      .stream()
      .pipeThrough(new DecompressionStream('deflate')),
  )
    .arrayBuffer()
    .then(
      () => true,
      () => false,
    );
  return lax;
}

export function adler32(data: Uint8Array, previous: number = 1): number {
  let a = previous & 0xffff;
  let b = previous >>> 16;
  for (let i = 0; i < data.length;) {
    const end = Math.min(i + 5552, data.length);
    for (; i < end; i++) {
      a += data[i]!;
      b += a;
    }
    a %= 65521;
    b %= 65521;
  }
  return ((b << 16) | a) >>> 0;
}

/**
 * Throws `TruncatedError` unless `tail`, the last 4 bytes of a zlib stream, holds `checksum`. Every
 * runtime rejects bytes after the end of a zlib stream, so after a decode succeeds its input ends
 * with the trailer.
 */
export function assertTrailer(tail: Uint8Array, checksum: number): void {
  const stored =
    tail.length < 4
      ? -1
      : ((tail[tail.length - 4]! << 24) |
          (tail[tail.length - 3]! << 16) |
          (tail[tail.length - 2]! << 8) |
          tail[tail.length - 1]!) >>>
        0;
  if (stored !== checksum) {
    throw new TruncatedError();
  }
}
