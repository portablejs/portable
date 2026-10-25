import { abortable } from '@portable/timers/internal';
import * as Bytes from '@portable/bytes';

/** Reads a body to the end. Aborting `signal` cancels the body and rejects with the reason. */
export async function readBody(
  body: Body,
  signal: AbortSignal | undefined,
): Promise<Uint8Array<ArrayBuffer>> {
  // Firefox has no `Request.prototype.body`, so a request body there can only be read whole.
  if (!signal || !body.body) {
    return new Uint8Array(await abortable(body.arrayBuffer(), signal));
  }
  signal.throwIfAborted();
  const reader = body.body.getReader();
  const onAbort = () => reader.cancel(signal.reason).catch(() => {});
  signal.addEventListener('abort', onAbort, { once: true });
  try {
    const chunks: Uint8Array[] = [];
    for (;;) {
      const { done, value } = await reader.read();
      signal.throwIfAborted();
      if (done) {
        break;
      }
      chunks.push(value);
    }
    return Bytes.concat(chunks);
  } finally {
    signal.removeEventListener('abort', onAbort);
  }
}
