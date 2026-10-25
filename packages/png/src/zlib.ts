import * as Bytes from '@portable/bytes';
import { toBufferSource } from '@portable/bytes/internal';

const pieceLength = 64 * 1024;

export async function inflate(
  data: Uint8Array,
  expectedLength: number,
  signal: AbortSignal | undefined,
): Promise<Uint8Array> {
  const pieces: Uint8Array[] = [];
  for (let i = 0; i < data.length; i += pieceLength) {
    pieces.push(data.subarray(i, i + pieceLength));
  }
  let rejected = -1;
  try {
    return await inflatePieces(pieces, expectedLength, signal, (index) => {
      rejected = rejected === -1 ? index : Math.min(rejected, index);
    });
  } catch (error) {
    if (rejected === -1 || signal?.aborted) {
      throw error;
    }
    // Bun and Deno fail a write that contains bytes after the end of the zlib stream and drop that
    // write's output, while Node and browsers keep it. `inflate` then decodes the data again and
    // writes the failed piece one byte at a time, so only the writes after the end of the stream
    // fail and every byte before it is decoded.
    const start = rejected * pieceLength;
    const piece = pieces[rejected]!;
    const retry = [
      data.subarray(0, start),
      ...Array.from(piece, (_, i) => piece.subarray(i, i + 1)),
    ];
    return inflatePieces(retry, expectedLength, signal, () => {});
  }
}

async function inflatePieces(
  pieces: readonly Uint8Array[],
  expectedLength: number,
  signal: AbortSignal | undefined,
  onReject: (index: number) => void,
): Promise<Uint8Array> {
  const stream = new DecompressionStream('deflate');
  const writer = stream.writable.getWriter();
  const writes = pieces.map((piece, index) =>
    writer.write(toBufferSource(piece)).catch(() => onReject(index)),
  );
  writer.close().catch(() => {});
  const reader = stream.readable.getReader();
  const stop = cancelOnAbort(reader, signal);
  try {
    const out = new Uint8Array(expectedLength);
    let length = 0;
    for (;;) {
      const { done, value } = await reader.read();
      signal?.throwIfAborted();
      if (done) {
        return out.subarray(0, length);
      }
      const take = Math.min(value.length, expectedLength - length);
      out.set(take === value.length ? value : value.subarray(0, take), length);
      length += take;
      if (length === expectedLength) {
        await reader.cancel().catch(() => {});
        return out;
      }
    }
  } catch (error) {
    await Promise.all(writes);
    throw error;
  } finally {
    stop();
  }
}

export async function deflate(
  data: Uint8Array,
  signal: AbortSignal | undefined,
): Promise<Uint8Array> {
  const reader = transform(data, new CompressionStream('deflate')).getReader();
  const stop = cancelOnAbort(reader, signal);
  const chunks: Uint8Array[] = [];
  try {
    for (;;) {
      const { done, value } = await reader.read();
      signal?.throwIfAborted();
      if (done) {
        break;
      }
      chunks.push(value);
    }
  } finally {
    stop();
  }
  return chunks.length === 1 ? chunks[0]! : Bytes.concat(chunks);
}

function cancelOnAbort(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  signal: AbortSignal | undefined,
): () => void {
  if (!signal) {
    return () => {};
  }
  signal.throwIfAborted();
  const onAbort = () => reader.cancel(signal.reason).catch(() => {});
  signal.addEventListener('abort', onAbort, { once: true });
  return () => signal.removeEventListener('abort', onAbort);
}

function transform(
  data: Uint8Array,
  stream: TransformStream<BufferSource, Uint8Array>,
): ReadableStream<Uint8Array> {
  const writer = stream.writable.getWriter();
  writer.write(toBufferSource(data)).catch(() => {});
  writer.close().catch(() => {});
  return stream.readable;
}
