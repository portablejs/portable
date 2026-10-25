/// <reference types="node" />
import { finished, Writable } from 'node:stream';
import { toPlain } from './chunks.js';
import { settle } from './readable.js';

export declare namespace toWebWritable {
  type Options = {
    /** Errors the stream with `signal.reason` and destroys the `Writable` when aborted. */
    signal?: AbortSignal | undefined;
  };
}

/**
 * Converts a Node `Writable` to a `WritableStream`, so `pipeTo` can write to a file, a socket or an
 * `http.ServerResponse`. A write resolves once the `Writable` accepts the chunk, and waits for its
 * `'drain'` event when its buffer is full. Closing the stream calls `end()` and resolves on
 * `'finish'`.
 *
 * An error or a `destroy()` on the `Writable` errors the stream, and aborting the stream destroys
 * the `Writable` with the abort reason. The stream passes each chunk to `write()` unchanged, so a
 * byte-mode `Writable` takes `Uint8Array` and string chunks and an object-mode one takes any value
 * except `null`. If `write()` throws for a chunk, the stream errors and the `Writable` is destroyed.
 *
 * @example
 * ```ts
 * import { createServer } from 'node:http';
 * import * as NodeStreams from '@portable/streams/node';
 *
 * createServer(async (request, response) => {
 *   const upstream = await fetch('https://example.com/feed.xml');
 *   response.writeHead(upstream.status, { 'content-type': 'application/xml' });
 *   await upstream.body!.pipeTo(NodeStreams.toWebWritable(response));
 * });
 * ```
 */
export function toWebWritable(
  writable: Writable,
  options: toWebWritable.Options = {},
): WritableStream<unknown> {
  const { signal } = options;
  let failure: { error: unknown } | undefined;
  let waiting: { resolve: () => void; reject: (error: unknown) => void } | undefined;
  let stop = () => {};
  let fail = (_error: unknown) => {};
  return new WritableStream<unknown>({
    start(controller) {
      const onDrain = () => {
        waiting?.resolve();
        waiting = undefined;
      };
      const onAbort = () => {
        fail(signal!.reason);
        writable.destroy(signal!.reason as Error);
      };
      stop = () => {
        writable.off('drain', onDrain);
        signal?.removeEventListener('abort', onAbort);
      };
      fail = (error) => {
        if (failure) {
          return;
        }
        failure = { error };
        stop();
        controller.error(error);
        waiting?.reject(error);
        waiting = undefined;
      };
      finished(writable, { readable: false }, (error) => {
        if (error) {
          return fail(error);
        }
        stop();
      });
      if (signal?.aborted) {
        return onAbort();
      }
      signal?.addEventListener('abort', onAbort, { once: true });
      // The stream calls abort() only after the write in progress settles, and that write may be
      // waiting for a 'drain' that never comes. controller.signal fires as soon as abort() is called.
      controller.signal.addEventListener('abort', () => {
        const reason: unknown = controller.signal.reason;
        stop();
        waiting?.reject(reason);
        waiting = undefined;
        writable.destroy(reason as Error);
      });
      writable.on('drain', onDrain);
    },
    write(chunk) {
      if (failure) {
        throw failure.error;
      }
      let accepted: boolean;
      try {
        accepted = writable.write(chunk, (error) => {
          if (error) {
            fail(error);
          }
        });
      } catch (error) {
        fail(error);
        writable.destroy(error as Error);
        throw error;
      }
      if (accepted) {
        return;
      }
      return new Promise<void>((resolve, reject) => {
        waiting = { resolve, reject };
      });
    },
    close() {
      return new Promise<void>((resolve, reject) => {
        writable.end((error?: Error | null) => (error ? reject(error) : resolve()));
      });
    },
  });
}

export declare namespace fromWebWritable {
  type Options = {
    /**
     * Creates an object-mode `Writable` that passes each chunk through unchanged. Without it, the
     * `Writable` encodes string chunks as UTF-8 and writes every chunk as a plain `Uint8Array`.
     * @default false
     */
    objectMode?: boolean | undefined;
    /** The `Writable`'s `highWaterMark`. Node's default is 64 KiB, or 16 chunks in object mode. */
    highWaterMark?: number | undefined;
    /** Destroys the `Writable` with `signal.reason` and aborts the stream when aborted. */
    signal?: AbortSignal | undefined;
  };
}

/**
 * Converts a `WritableStream` to a Node `Writable`, for Node APIs and libraries that write to Node
 * streams. Each write waits for the stream's writer to be ready, so the `Writable` follows the
 * stream's backpressure. `end()` closes the stream, and `'finish'` fires once the close resolves.
 *
 * An error in the stream destroys the `Writable` with that error, and destroying the `Writable`
 * aborts the stream with the destroy error.
 *
 * @example
 * ```ts
 * import { createReadStream } from 'node:fs';
 * import { pipeline } from 'node:stream/promises';
 * import * as NodeStreams from '@portable/streams/node';
 *
 * const { readable, writable } = new CompressionStream('gzip');
 * const upload = fetch('https://example.com/upload', {
 *   method: 'POST',
 *   body: readable,
 *   duplex: 'half',
 * });
 * await pipeline(createReadStream('log.txt'), NodeStreams.fromWebWritable(writable));
 * await upload;
 * ```
 */
export function fromWebWritable(
  stream: WritableStream<never>,
  options: fromWebWritable.Options = {},
): Writable {
  const { objectMode = false, highWaterMark, signal } = options;
  const writer = stream.getWriter() as WritableStreamDefaultWriter<unknown>;
  const onAbort = () => writable.destroy(signal!.reason as Error);
  const writable = new Writable({
    objectMode,
    ...(highWaterMark === undefined ? {} : { highWaterMark }),
    write(chunk: unknown, _encoding, callback) {
      writeTo(writer, writable, [chunk], objectMode, callback);
    },
    writev(chunks, callback) {
      writeTo(
        writer,
        writable,
        chunks.map(({ chunk }) => chunk as unknown),
        objectMode,
        callback,
      );
    },
    final(callback) {
      writer.close().then(() => callback(), callback);
    },
    destroy(error, callback) {
      signal?.removeEventListener('abort', onAbort);
      settle(writer.abort(error ?? undefined), () => callback(error));
    },
  });
  if (signal?.aborted) {
    onAbort();
  } else {
    signal?.addEventListener('abort', onAbort, { once: true });
  }
  return writable;
}

/**
 * Writes the chunks from a Node `_write` or `_writev` to `writer`. Node calls `_write` again only
 * after `callback` runs. This function calls `callback` at once while the writer's queue has room,
 * and otherwise once `writer.ready` resolves, so Node sees the stream's backpressure without
 * waiting for each write to finish. `_writev` gets every chunk Node has buffered.
 */
export function writeTo(
  writer: WritableStreamDefaultWriter<unknown>,
  writable: Writable,
  chunks: readonly unknown[],
  objectMode: boolean,
  callback: (error?: Error | null) => void,
): void {
  const onError = (error: unknown) => writable.destroy(error as Error);
  const write = () => {
    for (const chunk of chunks) {
      writer.write(objectMode ? chunk : toPlain(chunk as Uint8Array)).catch(onError);
    }
  };
  if (writer.desiredSize !== null && writer.desiredSize > 0) {
    write();
    return callback();
  }
  writer.ready.then(() => {
    write();
    callback();
  }, callback);
}
