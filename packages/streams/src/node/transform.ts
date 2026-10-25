/// <reference types="node" />
import { Duplex } from 'node:stream';
import { readInto, settle, toWeb } from './readable.js';
import { toWebWritable, writeTo } from './writable.js';

export declare namespace toWebTransform {
  type Options = {
    /** Errors both sides with `signal.reason` and destroys the `Duplex` when aborted. */
    signal?: AbortSignal | undefined;
  };
}

/**
 * Converts a Node `Transform` or `Duplex` that outputs bytes, such as a `zlib` or `crypto` stream,
 * to a `{ readable, writable }` pair for `pipeThrough`. The readable side works as `toWeb` does and
 * the writable side as `toWebWritable` does. An error on either side destroys the `Duplex`, which
 * errors the other side.
 *
 * For a `Duplex` that outputs objects, build the pair yourself:
 * `{ readable: NodeStreams.toWebObjects(duplex), writable: NodeStreams.toWebWritable(duplex) }`.
 *
 * @example
 * ```ts
 * import { createBrotliDecompress } from 'node:zlib';
 * import * as NodeStreams from '@portable/streams/node';
 *
 * const response = await fetch('https://example.com/data.json.br');
 * const text = response.body!
 *   .pipeThrough(NodeStreams.toWebTransform(createBrotliDecompress()))
 *   .pipeThrough(new TextDecoderStream());
 * ```
 */
export function toWebTransform(
  duplex: Duplex,
  options: toWebTransform.Options = {},
): ReadableWritablePair<Uint8Array<ArrayBuffer>, unknown> {
  return { readable: toWeb(duplex, options), writable: toWebWritable(duplex, options) };
}

export declare namespace fromWebTransform {
  type Options = {
    /**
     * Makes the readable side object-mode, so it passes each output chunk through unchanged.
     * Without it, the readable side takes `Uint8Array` and string output and destroys the `Duplex`
     * with a `TypeError` for any other chunk.
     * @default false
     */
    readableObjectMode?: boolean | undefined;
    /**
     * Makes the writable side object-mode, so it passes each input chunk through unchanged.
     * Without it, string input is encoded as UTF-8 and every chunk is written as a plain
     * `Uint8Array`.
     * @default false
     */
    writableObjectMode?: boolean | undefined;
    /**
     * When aborted, destroys the `Duplex` with `signal.reason`, cancels the pair's readable side and
     * aborts its writable side.
     */
    signal?: AbortSignal | undefined;
  };
}

/**
 * Converts a `{ readable, writable }` pair, such as a `TransformStream`, to a Node `Duplex`, so a
 * web transform can go in `stream.pipeline()` or a `.pipe()` chain. Writes go to the pair's
 * writable side, `end()` closes it, and the `Duplex` reads from the pair's readable side.
 *
 * Both sides follow backpressure as `fromWeb` and `fromWebWritable` do. An error on either side of
 * the pair destroys the `Duplex`, and destroying the `Duplex` cancels the readable side and aborts
 * the writable side. If the transform outputs values other than bytes, such as the strings from
 * `TextDecoderStream`, set `readableObjectMode`. Without it, Node joins the strings into one byte
 * stream.
 *
 * @example
 * ```ts
 * import { createReadStream } from 'node:fs';
 * import { pipeline } from 'node:stream/promises';
 * import * as NodeStreams from '@portable/streams/node';
 *
 * await pipeline(
 *   createReadStream('notes.txt'),
 *   NodeStreams.fromWebTransform(new TextDecoderStream(), { readableObjectMode: true }),
 *   async (lines: AsyncIterable<string>) => {
 *     for await (const text of lines) {
 *       console.log(text.length);
 *     }
 *   },
 * );
 * ```
 */
export function fromWebTransform(
  pair: ReadableWritablePair<unknown, never>,
  options: fromWebTransform.Options = {},
): Duplex {
  const { readableObjectMode = false, writableObjectMode = false, signal } = options;
  const reader = pair.readable.getReader();
  const writer = pair.writable.getWriter() as WritableStreamDefaultWriter<unknown>;
  const onAbort = () => duplex.destroy(signal!.reason as Error);
  const duplex = new Duplex({
    readableObjectMode,
    writableObjectMode,
    read() {
      readInto(reader, duplex, readableObjectMode);
    },
    write(chunk: unknown, _encoding, callback) {
      writeTo(writer, duplex, [chunk], writableObjectMode, callback);
    },
    writev(chunks, callback) {
      writeTo(
        writer,
        duplex,
        chunks.map(({ chunk }) => chunk as unknown),
        writableObjectMode,
        callback,
      );
    },
    final(callback) {
      writer.close().then(() => callback(), callback);
    },
    destroy(error, callback) {
      signal?.removeEventListener('abort', onAbort);
      const reason = error ?? undefined;
      settle(Promise.allSettled([reader.cancel(reason), writer.abort(reason)]), () =>
        callback(error),
      );
    },
  });
  if (signal?.aborted) {
    onAbort();
  } else {
    signal?.addEventListener('abort', onAbort, { once: true });
  }
  return duplex;
}
