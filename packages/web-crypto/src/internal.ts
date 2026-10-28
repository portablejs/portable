import { assertUint8Array, toBufferSource as copyShared } from '@portable/bytes/internal';
import { abortable } from '@portable/timers/internal';

const encoder = new TextEncoder();

export function toBufferSource(data: string | Uint8Array): Uint8Array<ArrayBuffer> {
  if (typeof data === 'string') {
    return encoder.encode(data);
  }
  return copyShared(assertUint8Array(data));
}

export async function run<value>(
  signal: AbortSignal | undefined,
  task: () => Promise<value>,
): Promise<value> {
  signal?.throwIfAborted();
  return abortable(task(), signal);
}
