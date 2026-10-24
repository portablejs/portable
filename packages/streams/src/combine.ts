import { abortable } from './abortable.js';
import { byteLength } from './bytes.js';
import { MaxBytesError } from './errors.js';
import { fromIterable } from './iterable.js';
import { type Source, assertSource, isReadableStream } from './source.js';

export declare namespace concat {
  type Options = {
    /** Errors the output with `signal.reason` and cancels every source when aborted. */
    signal?: AbortSignal | undefined;
  };
}

/**
 * Joins sources end to end: every chunk of the first source, then every chunk of the next.
 * A source is read only once the one before it has ended. An error in any source errors the
 * output and cancels the sources not yet read, and cancelling the output cancels them all.
 *
 * @example
 * ```ts
 * import * as Streams from '@portable/streams';
 *
 * const body = Streams.concat([[header], file.stream(), [footer]]);
 * ```
 */
export function concat<chunk>(
  sources: readonly Source<chunk>[],
  options: concat.Options = {},
): ReadableStream<chunk> {
  if (!Array.isArray(sources as unknown)) {
    throw new TypeError('concat takes an array of sources.');
  }
  const streams = sources.map(toStream);
  let index = 0;
  let reader: ReadableStreamDefaultReader<chunk> | undefined;
  const cancelRest = (reason: unknown) =>
    Promise.all(streams.slice(index + 1).map((stream) => stream.cancel(reason).catch(() => {})));
  const output = new ReadableStream<chunk>(
    {
      async pull(controller) {
        for (; index < streams.length; index++) {
          reader ??= streams[index]!.getReader();
          let result: ReadableStreamReadResult<chunk>;
          try {
            result = await reader.read();
          } catch (error) {
            await cancelRest(error);
            throw error;
          }
          if (!result.done) {
            return controller.enqueue(result.value);
          }
          reader.releaseLock();
          reader = undefined;
        }
        controller.close();
      },
      async cancel(reason) {
        await Promise.all([
          reader ? reader.cancel(reason) : streams[index]?.cancel(reason),
          cancelRest(reason),
        ]);
      },
    },
    { highWaterMark: 0 },
  );
  return withSignal(output, options.signal);
}

export declare namespace merge {
  type Options = {
    /** Errors the output with `signal.reason` and cancels every source when aborted. */
    signal?: AbortSignal | undefined;
  };
}

/**
 * Interleaves sources: reads all of them at once and passes each chunk on as it arrives. The
 * output ends when every source has ended. An error in any source errors the output and
 * cancels the others, and cancelling the output cancels them all.
 *
 * @example
 * ```ts
 * import * as Streams from '@portable/streams';
 *
 * const events = Streams.merge([serverA.body!, serverB.body!], { signal });
 * ```
 */
export function merge<chunk>(
  sources: readonly Source<chunk>[],
  options: merge.Options = {},
): ReadableStream<chunk> {
  if (!Array.isArray(sources as unknown)) {
    throw new TypeError('merge takes an array of sources.');
  }
  const readers = new Set(sources.map((source) => toStream(source).getReader()));
  const idle = new Set(readers);
  let wake: (() => void) | undefined;
  let finished = false;
  const cancelAll = (reason: unknown) =>
    Promise.all([...readers].map((reader) => reader.cancel(reason).catch(() => {})));

  const read = (
    reader: ReadableStreamDefaultReader<chunk>,
    controller: ReadableStreamDefaultController<chunk>,
  ) => {
    idle.delete(reader);
    reader.read().then(
      (result) => {
        if (finished) {
          return;
        }
        if (result.done) {
          readers.delete(reader);
          if (readers.size === 0) {
            finished = true;
            controller.close();
          }
        } else {
          controller.enqueue(result.value);
          idle.add(reader);
        }
        wake?.();
      },
      (error: unknown) => {
        if (finished) {
          return;
        }
        finished = true;
        readers.delete(reader);
        controller.error(error);
        void cancelAll(error);
        wake?.();
      },
    );
  };

  const output = new ReadableStream<chunk>(
    {
      start(controller) {
        if (readers.size === 0) {
          finished = true;
          controller.close();
        }
      },
      pull(controller) {
        for (const reader of idle) {
          read(reader, controller);
        }
        return new Promise((resolve) => {
          wake = resolve;
        });
      },
      async cancel(reason) {
        finished = true;
        await cancelAll(reason);
      },
    },
    { highWaterMark: 0 },
  );
  return withSignal(output, options.signal);
}

function withSignal<chunk>(
  stream: ReadableStream<chunk>,
  signal: AbortSignal | undefined,
): ReadableStream<chunk> {
  return signal
    ? stream.pipeThrough(new TransformStream<chunk, chunk>(abortable({}, { signal })))
    : stream;
}

export declare namespace limitBytes {
  type Options = {
    /** Errors the stream with `signal.reason` and cancels its source when aborted. */
    signal?: AbortSignal | undefined;
  };
}

/**
 * A `TransformStream` that passes chunks through unchanged and fails with `MaxBytesError`
 * once more than `maxBytes` bytes have passed. The chunk that crosses the limit is not
 * passed on, and the source is cancelled. String chunks count as their UTF-8 length.
 *
 * @example
 * ```ts
 * import * as Streams from '@portable/streams';
 *
 * await request.body!.pipeThrough(Streams.limitBytes(1_000_000)).pipeTo(upload);
 * ```
 */
export function limitBytes<chunk extends Uint8Array | string>(
  maxBytes: number,
  options: limitBytes.Options = {},
): TransformStream<chunk, chunk> {
  let length = 0;
  return new TransformStream<chunk, chunk>(
    abortable(
      {
        transform(chunk, controller) {
          length += byteLength(chunk);
          if (length > maxBytes) {
            throw new MaxBytesError({ maxBytes });
          }
          controller.enqueue(chunk);
        },
      },
      options,
    ),
  );
}

export function toStream<chunk>(source: Source<chunk>): ReadableStream<chunk> {
  assertSource(source);
  return isReadableStream(source) ? source : fromIterable(source);
}
