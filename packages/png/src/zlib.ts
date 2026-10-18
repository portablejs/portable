import * as Bytes from '@portable/bytes'

export async function inflate(data: Uint8Array, expectedLength: number): Promise<Uint8Array> {
  const reader = transform(data, new DecompressionStream('deflate')).getReader()
  const out = new Uint8Array(expectedLength)
  let length = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) return out.subarray(0, length)
    const take = Math.min(value.length, expectedLength - length)
    out.set(take === value.length ? value : value.subarray(0, take), length)
    length += take
    if (length === expectedLength) {
      await reader.cancel().catch(() => {})
      return out
    }
  }
}

export async function deflate(data: Uint8Array): Promise<Uint8Array> {
  const reader = transform(data, new CompressionStream('deflate')).getReader()
  const chunks: Uint8Array[] = []
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
  }
  return chunks.length === 1 ? chunks[0]! : Bytes.concat(chunks)
}

function transform(
  data: Uint8Array,
  stream: TransformStream<BufferSource, Uint8Array>,
): ReadableStream<Uint8Array> {
  const writer = stream.writable.getWriter()
  writer.write(ownsArrayBuffer(data) ? data : data.slice()).catch(() => {})
  writer.close().catch(() => {})
  return stream.readable
}

function ownsArrayBuffer(data: Uint8Array): data is Uint8Array<ArrayBuffer> {
  return data.buffer instanceof ArrayBuffer
}
