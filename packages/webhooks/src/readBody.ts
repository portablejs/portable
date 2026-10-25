import { abortable } from '@portable/timers/internal';
import * as Bytes from '@portable/bytes';
import { MaxBytesError } from './errors.js';

/**
 * Reads a body to the end, throwing `MaxBytesError` past `maxBytes`. Aborting `signal` cancels the
 * body and rejects with the reason.
 */
export async function readBody(
  body: Body,
  maxBytes: number,
  signal: AbortSignal | undefined,
): Promise<Uint8Array<ArrayBuffer>> {
  // Firefox has no `Request.prototype.body`, so a request body there can only be read whole.
  if (!body.body) {
    const bytes = new Uint8Array(await abortable(body.arrayBuffer(), signal));
    if (bytes.length > maxBytes) {
      throw new MaxBytesError({ maxBytes });
    }
    return bytes;
  }
  signal?.throwIfAborted();
  const reader = body.body.getReader();
  const onAbort = () => reader.cancel(signal?.reason).catch(() => {});
  signal?.addEventListener('abort', onAbort, { once: true });
  try {
    const chunks: Uint8Array[] = [];
    let length = 0;
    for (;;) {
      const { done, value } = await reader.read();
      signal?.throwIfAborted();
      if (done) {
        break;
      }
      length += value.length;
      if (length > maxBytes) {
        await reader.cancel().catch(() => {});
        throw new MaxBytesError({ maxBytes });
      }
      chunks.push(value);
    }
    return Bytes.concat(chunks);
  } finally {
    signal?.removeEventListener('abort', onAbort);
  }
}
