import type * as Bytes from '@portable/bytes'
import { toBufferSource as copyShared, toUint8Array } from '@portable/bytes/internal'

const encoder = new TextEncoder()

export function toBufferSource(data: string | Bytes.Input): Uint8Array<ArrayBuffer> {
  if (typeof data === 'string') return encoder.encode(data)
  return copyShared(toUint8Array(data))
}

export async function run<value>(
  signal: AbortSignal | undefined,
  task: () => Promise<value>,
): Promise<value> {
  signal?.throwIfAborted()
  const result = await task()
  signal?.throwIfAborted()
  return result
}
