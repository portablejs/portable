import { isUint8Array } from '@portable/bytes/internal';
const CR = 0x0d;
const LF = 0x0a;

/**
 * A message as `sign` and `verify` take it. Text is encoded as UTF-8.
 */
export type Message = ReadableStream<Uint8Array> | Uint8Array | string;

/** Pulls the body chunks that follow the header section. `undefined` ends the body. */
export type Body = {
  read: () => Promise<Uint8Array | undefined>;
  cancel: () => Promise<void>;
};

/**
 * Splits a message at the first empty line (RFC 5322 section 2.1). Every bare LF becomes CRLF
 * first, in the header section and the body, because messages stored on disk often use LF and
 * DKIM hashes CRLF line ends. `header` holds the header fields with the CRLF that ends the last
 * one, and without the empty line. A message that starts with an empty line has no header
 * fields, and one without an empty line has no body. When `signal` aborts, the stream is cancelled
 * and the pending read, in the header section or the body, rejects with `signal.reason`.
 */
export async function splitMessage(
  input: Message,
  signal: AbortSignal | undefined,
): Promise<{ header: Uint8Array; body: Body }> {
  signal?.throwIfAborted();
  const source = readChunks(input, signal);
  const next = normalizeLineEnds(source.read);
  let header = new Uint8Array(4096);
  let length = 0;
  for (;;) {
    const chunk = await next();
    if (!chunk) {
      return { header: header.subarray(0, length), body: { read: next, cancel: source.cancel } };
    }
    if (length === 0) {
      const end = findEmptyLine(chunk, 0, chunk.length);
      if (end >= 0) {
        return split(chunk.subarray(0, end), chunk.subarray(end + 2), next, source.cancel);
      }
    }
    if (length + chunk.length > header.length) {
      const grown = new Uint8Array(Math.max(header.length * 2, length + chunk.length));
      grown.set(header.subarray(0, length));
      header = grown;
    }
    header.set(chunk, length);
    const end = findEmptyLine(header, Math.max(0, length - 3), length + chunk.length);
    length += chunk.length;
    if (end < 0) {
      continue;
    }
    return split(header.subarray(0, end), header.slice(end + 2, length), next, source.cancel);
  }
}

function split(
  header: Uint8Array,
  rest: Uint8Array,
  next: () => Promise<Uint8Array | undefined>,
  cancel: () => Promise<void>,
): { header: Uint8Array; body: Body } {
  let pending: Uint8Array | undefined = rest.length > 0 ? rest : undefined;
  return {
    header,
    body: {
      read() {
        if (!pending) {
          return next();
        }
        const chunk = pending;
        pending = undefined;
        return Promise.resolve(chunk);
      },
      cancel,
    },
  };
}

function findEmptyLine(bytes: Uint8Array, from: number, to: number): number {
  if (from === 0 && to >= 2 && bytes[0] === CR && bytes[1] === LF) {
    return 0;
  }
  for (let i = bytes.indexOf(LF, from); i >= 0 && i + 2 < to; i = bytes.indexOf(LF, i + 1)) {
    if (bytes[i - 1] === CR && bytes[i + 1] === CR && bytes[i + 2] === LF) {
      return i + 1;
    }
  }
  return -1;
}

function readChunks(input: Message, signal: AbortSignal | undefined): Body {
  if (typeof input === 'string') {
    input = new TextEncoder().encode(input);
  }
  if (isUint8Array(input)) {
    let chunk: Uint8Array | undefined = input;
    return {
      read() {
        const result = chunk;
        chunk = undefined;
        return Promise.resolve(result);
      },
      cancel() {
        chunk = undefined;
        return Promise.resolve();
      },
    };
  }
  if (!(input instanceof ReadableStream)) {
    throw new TypeError('Expected the message as a ReadableStream, a Uint8Array or a string.');
  }
  const reader = input.getReader();
  const abort = () => void reader.cancel(signal?.reason).catch(() => {});
  const release = () => signal?.removeEventListener('abort', abort);
  signal?.addEventListener('abort', abort, { once: true });
  return {
    async read() {
      try {
        const { done, value } = await reader.read();
        signal?.throwIfAborted();
        if (done) {
          release();
          return undefined;
        }
        if (!isUint8Array(value)) {
          throw new TypeError('Expected Uint8Array chunks.');
        }
        return value;
      } catch (error) {
        release();
        throw error;
      }
    },
    cancel() {
      release();
      return reader.cancel();
    },
  };
}

function normalizeLineEnds(
  next: () => Promise<Uint8Array | undefined>,
): () => Promise<Uint8Array | undefined> {
  let previous = 0;
  return async () => {
    let chunk = await next();
    while (chunk?.length === 0) {
      chunk = await next();
    }
    if (!chunk) {
      return undefined;
    }
    let bare = 0;
    for (let i = chunk.indexOf(LF); i >= 0; i = chunk.indexOf(LF, i + 1)) {
      if ((i === 0 ? previous : chunk[i - 1]) !== CR) {
        bare++;
      }
    }
    const last = chunk[chunk.length - 1]!;
    if (bare === 0) {
      previous = last;
      return chunk;
    }
    const out = new Uint8Array(chunk.length + bare);
    let o = 0;
    let start = 0;
    for (let i = chunk.indexOf(LF); i >= 0; i = chunk.indexOf(LF, i + 1)) {
      if ((i === 0 ? previous : chunk[i - 1]) === CR) {
        continue;
      }
      out.set(chunk.subarray(start, i), o);
      o += i - start;
      out[o++] = CR;
      start = i;
    }
    out.set(chunk.subarray(start), o);
    previous = last;
    return out;
  };
}
