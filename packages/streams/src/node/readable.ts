/// <reference types="node" />
import { finished, Readable } from 'node:stream';
import { toBytes, toValue } from './chunks.js';

export declare namespace toWeb {
  type Options = {
    /** Errors the stream with `signal.reason` and destroys the `Readable` when aborted. */
    signal?: AbortSignal | undefined;
  };
}

/**
 * Converts a Node `Readable` of bytes to a `ReadableStream` of plain `Uint8Array` chunks. `Buffer`
 * chunks become `Uint8Array`s, and string chunks from a `Readable` with `setEncoding` are encoded
 * back to the bytes they came from. The stream reads from the `Readable` only when its reader asks
 * for a chunk, so a slow reader pauses the `Readable`.
 *
 * An error or a `destroy()` on the `Readable` errors the stream, and cancelling the stream destroys
 * the `Readable` with the cancel reason. A chunk that is neither bytes nor a string errors the
 * stream with a `TypeError`. For an object-mode `Readable`, use `toWebObjects`.
 *
 * @example
 * ```ts
 * import { createReadStream } from 'node:fs';
 * import * as NodeStreams from '@portable/streams/node';
 *
 * const body = NodeStreams.toWeb(createReadStream('photo.jpg'));
 * const response = new Response(body, { headers: { 'content-type': 'image/jpeg' } });
 * ```
 */
export function toWeb(
  readable: Readable,
  options: toWeb.Options = {},
): ReadableStream<Uint8Array<ArrayBuffer>> {
  return bridge(readable, (chunk) => toBytes(chunk, readable.readableEncoding), options.signal);
}

export declare namespace toWebObjects {
  type Options = toWeb.Options;
}

/**
 * Converts an object-mode Node `Readable` to a `ReadableStream` of the same values. Bytes become
 * plain `Uint8Array`s and every other value passes through unchanged. The chunks are typed
 * `unknown`, because a `Readable` doesn't declare what it holds. Otherwise it works as `toWeb`
 * does: the stream reads one value each time its reader asks, errors propagate both ways, and
 * aborting `signal` destroys the `Readable`.
 *
 * @example
 * ```ts
 * import { Readable } from 'node:stream';
 * import * as Streams from '@portable/streams';
 * import * as NodeStreams from '@portable/streams/node';
 *
 * const rows = Readable.from([{ id: 1 }, { id: 2 }]);
 * await Streams.toArray(NodeStreams.toWebObjects(rows)); // [{ id: 1 }, { id: 2 }]
 * ```
 */
export function toWebObjects(
  readable: Readable,
  options: toWebObjects.Options = {},
): ReadableStream<unknown> {
  return bridge(readable, toValue, options.signal);
}

function bridge<chunk>(
  readable: Readable,
  convert: (chunk: unknown) => chunk,
  signal: AbortSignal | undefined,
): ReadableStream<chunk> {
  let wake = () => {};
  let ended = false;
  let failed = false;
  let stop = () => {};
  return new ReadableStream<chunk>(
    {
      start(controller) {
        const fail = (error: unknown) => {
          if (failed) {
            return;
          }
          failed = true;
          stop();
          controller.error(error);
          wake();
        };
        const onReadable = () => wake();
        const onAbort = () => {
          fail(signal!.reason);
          readable.destroy(signal!.reason as Error);
        };
        stop = () => {
          readable.off('readable', onReadable);
          signal?.removeEventListener('abort', onAbort);
        };
        // finished() keeps its 'error' listener after it calls back, so a later error on the
        // Readable, such as the one destroy(reason) emits after a cancel, can't crash the process.
        finished(readable, { writable: false }, (error) => {
          if (error) {
            return fail(error);
          }
          ended = true;
          stop();
          wake();
        });
        if (signal?.aborted) {
          return onAbort();
        }
        signal?.addEventListener('abort', onAbort, { once: true });
        readable.on('readable', onReadable);
      },
      async pull(controller) {
        for (;;) {
          if (failed) {
            return;
          }
          const chunk: unknown = readable.read();
          if (chunk !== null) {
            let value: chunk;
            try {
              value = convert(chunk);
            } catch (error) {
              failed = true;
              stop();
              readable.destroy(error as Error);
              throw error;
            }
            return controller.enqueue(value);
          }
          if (ended) {
            return controller.close();
          }
          await new Promise<void>((resolve) => {
            wake = resolve;
          });
        }
      },
      cancel(reason) {
        failed = true;
        stop();
        readable.destroy(reason as Error);
      },
    },
    { highWaterMark: 0 },
  );
}
