import { abortable } from './abortable.js';

export declare namespace map {
  type Options = {
    /** Errors the stream with `signal.reason` and cancels its source when aborted. */
    signal?: AbortSignal | undefined;
  };
}

/**
 * A `TransformStream` that replaces each chunk with `fn(chunk, index)`. `fn` runs for one
 * chunk at a time. If it returns a promise, the next chunk waits until the promise settles,
 * so chunks stay in order.
 *
 * @example
 * ```ts
 * import * as Streams from '@portable/streams';
 * import * as Lines from '@portable/lines';
 *
 * const records = response.body!.pipeThrough(new Lines.DecoderStream()).pipeThrough(Streams.map((line) => JSON.parse(line)));
 * ```
 */
export function map<input, output>(
  fn: (chunk: input, index: number) => output | PromiseLike<output>,
  options: map.Options = {},
): TransformStream<input, output> {
  let index = 0;
  return new TransformStream<input, output>(
    abortable(
      {
        transform(chunk, controller) {
          const result = fn(chunk, index++);
          if (!isPromiseLike(result)) {
            return controller.enqueue(result);
          }
          return Promise.resolve(result).then((value) => controller.enqueue(value));
        },
      },
      options,
    ),
  );
}

export declare namespace filter {
  type Options = {
    /** Errors the stream with `signal.reason` and cancels its source when aborted. */
    signal?: AbortSignal | undefined;
  };
}

/**
 * A `TransformStream` that passes on only the chunks for which `fn(chunk, index)` returns
 * true. `fn` runs for one chunk at a time. If it returns a promise, the next chunk waits until
 * the promise settles.
 *
 * @example
 * ```ts
 * import * as Streams from '@portable/streams';
 *
 * lines.pipeThrough(Streams.filter((line) => line !== ''));
 * ```
 */
export function filter<chunk, state extends chunk>(
  fn: (chunk: chunk, index: number) => chunk is state,
  options?: filter.Options,
): TransformStream<chunk, state>;
export function filter<chunk>(
  fn: (chunk: chunk, index: number) => boolean | PromiseLike<boolean>,
  options?: filter.Options,
): TransformStream<chunk, chunk>;
export function filter<chunk>(
  fn: (chunk: chunk, index: number) => boolean | PromiseLike<boolean>,
  options: filter.Options = {},
): TransformStream<chunk, chunk> {
  let index = 0;
  return new TransformStream<chunk, chunk>(
    abortable(
      {
        transform(chunk, controller) {
          const keep = fn(chunk, index++);
          if (!isPromiseLike(keep)) {
            if (keep) {
              controller.enqueue(chunk);
            }
            return;
          }
          return Promise.resolve(keep).then((value) => {
            if (value) {
              controller.enqueue(chunk);
            }
          });
        },
      },
      options,
    ),
  );
}

export declare namespace tap {
  type Options = {
    /** Errors the stream with `signal.reason` and cancels its source when aborted. */
    signal?: AbortSignal | undefined;
  };
}

/**
 * A `TransformStream` that calls `fn(chunk, index)` for each chunk and passes the chunk on
 * unchanged. `fn` runs for one chunk at a time. If it returns a promise, the chunk is passed on
 * once it resolves, and the next chunk waits until then.
 *
 * @example
 * ```ts
 * import * as Streams from '@portable/streams';
 *
 * let received = 0;
 * response.body!.pipeThrough(Streams.tap((chunk) => { received += chunk.byteLength; }));
 * ```
 */
export function tap<chunk>(
  fn: (chunk: chunk, index: number) => void | PromiseLike<void>,
  options: tap.Options = {},
): TransformStream<chunk, chunk> {
  let index = 0;
  return new TransformStream<chunk, chunk>(
    abortable(
      {
        transform(chunk, controller) {
          const result = fn(chunk, index++);
          if (!isPromiseLike(result)) {
            return controller.enqueue(chunk);
          }
          return Promise.resolve(result).then(() => controller.enqueue(chunk));
        },
      },
      options,
    ),
  );
}

export declare namespace batch {
  type Options = {
    /** Errors the stream with `signal.reason` and cancels its source when aborted. */
    signal?: AbortSignal | undefined;
  };
}

/**
 * A `TransformStream` that groups chunks into arrays of `size`. The last array holds whatever
 * is left and may be shorter. `batch` emits a partial array only when the source ends, not on
 * a timer.
 *
 * @example
 * ```ts
 * import * as Streams from '@portable/streams';
 *
 * await rows.pipeThrough(Streams.batch(500)).pipeTo(new WritableStream({ write: insertMany }));
 * ```
 */
export function batch<chunk>(
  size: number,
  options: batch.Options = {},
): TransformStream<chunk, chunk[]> {
  if (!Number.isInteger(size) || size < 1) {
    throw new RangeError(`batch size must be a positive integer, got ${size}.`);
  }
  let items: chunk[] = [];
  return new TransformStream<chunk, chunk[]>(
    abortable(
      {
        transform(chunk, controller) {
          items.push(chunk);
          if (items.length < size) {
            return;
          }
          controller.enqueue(items);
          items = [];
        },
        flush(controller) {
          if (items.length > 0) {
            controller.enqueue(items);
          }
        },
      },
      options,
    ),
  );
}

function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    'then' in value &&
    typeof value.then === 'function'
  );
}
