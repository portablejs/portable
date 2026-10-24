import * as Bytes from '@portable/bytes'
import { toBufferSource } from '@portable/bytes/internal'

export async function inflate(
  data: Uint8Array,
  expectedLength: number,
  signal: AbortSignal | undefined,
): Promise<Uint8Array> {
  const reader = transform(data, new DecompressionStream('deflate')).getReader()
  const stop = cancelOnAbort(reader, signal)
  try {
    const out = new Uint8Array(expectedLength)
    let length = 0
    for (;;) {
      const { done, value } = await reader.read()
      signal?.throwIfAborted()
      if (done) {
        return out.subarray(0, length)
      }
      const take = Math.min(value.length, expectedLength - length)
      out.set(take === value.length ? value : value.subarray(0, take), length)
      length += take
      if (length === expectedLength) {
        await reader.cancel().catch(() => {})
        return out
      }
    }
  } finally {
    stop()
  }
}

export async function deflate(
  data: Uint8Array,
  signal: AbortSignal | undefined,
): Promise<Uint8Array> {
  const reader = transform(data, new CompressionStream('deflate')).getReader()
  const stop = cancelOnAbort(reader, signal)
  const chunks: Uint8Array[] = []
  try {
    for (;;) {
      const { done, value } = await reader.read()
      signal?.throwIfAborted()
      if (done) {
        break
      }
      chunks.push(value)
    }
  } finally {
    stop()
  }
  return chunks.length === 1 ? chunks[0]! : Bytes.concat(chunks)
}

function cancelOnAbort(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  signal: AbortSignal | undefined,
): () => void {
  if (!signal) {
    return () => {}
  }
  signal.throwIfAborted()
  const onAbort = () => reader.cancel(signal.reason).catch(() => {})
  signal.addEventListener('abort', onAbort, { once: true })
  return () => signal.removeEventListener('abort', onAbort)
}

function transform(
  data: Uint8Array,
  stream: TransformStream<BufferSource, Uint8Array>,
): ReadableStream<Uint8Array> {
  const writer = stream.writable.getWriter()
  writer.write(toBufferSource(data)).catch(() => {})
  writer.close().catch(() => {})
  return stream.readable
}
