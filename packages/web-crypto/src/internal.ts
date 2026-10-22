const encoder = new TextEncoder()

export function toBufferSource(data: string | Uint8Array): Uint8Array<ArrayBuffer> {
  if (typeof data === 'string') return encoder.encode(data)
  return isArrayBufferBacked(data) ? data : data.slice()
}

function isArrayBufferBacked(bytes: Uint8Array): bytes is Uint8Array<ArrayBuffer> {
  return bytes.buffer instanceof ArrayBuffer
}

export async function run<T>(signal: AbortSignal | undefined, task: () => Promise<T>): Promise<T> {
  signal?.throwIfAborted()
  const result = await task()
  signal?.throwIfAborted()
  return result
}
