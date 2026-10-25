import * as Lines from '@portable/lines';

// Not every browser has ReadableStream.from or async iteration of streams yet, so the
// tests build and drain streams by hand.
export function fromChunks<chunk>(chunks: readonly chunk[]): ReadableStream<chunk> {
  let i = 0;
  return new ReadableStream({
    pull(controller) {
      if (i < chunks.length) {
        controller.enqueue(chunks[i++]!);
      } else {
        controller.close();
      }
    },
  });
}

export async function collect<chunk>(
  stream: ReadableStream<chunk>,
  onChunk?: (count: number) => Promise<void>,
): Promise<chunk[]> {
  const reader = stream.getReader();
  const chunks: chunk[] = [];
  for (;;) {
    const { done, value } = await reader.read();
    if (done) {
      return chunks;
    }
    chunks.push(value);
    await onChunk?.(chunks.length);
  }
}

export function split(
  chunks: readonly (Uint8Array | string)[],
  options?: Lines.DecoderStream.Options,
): Promise<string[]> {
  return collect(fromChunks(chunks).pipeThrough(new Lines.DecoderStream(options)));
}

export const encode = (text: string): Uint8Array => new TextEncoder().encode(text);

export function chunked(bytes: Uint8Array, size: number): Uint8Array[] {
  const chunks: Uint8Array[] = [];
  for (let i = 0; i < bytes.length; i += size) {
    chunks.push(bytes.subarray(i, i + size));
  }
  return chunks;
}

/** UTS #18 line boundaries, as byline splits on them. */
export const unicodeLineBreak: RegExp = /\r\n|[\n\v\f\r\x85\u2028\u2029]/;
