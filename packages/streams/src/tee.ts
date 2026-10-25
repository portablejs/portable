import { byteLength } from './bytes.js';
import { toStream } from './combine.js';
import type { Source } from './source.js';

export declare namespace tee {
  type Options = {
    /**
     * How much the slowest branch may hold unread before the source stops being read, in
     * `unit`s. The fastest branch can be this far ahead of the slowest.
     * @default 16 chunks, or 65536 bytes
     */
    highWaterMark?: number | undefined;
    /**
     * What `highWaterMark` counts: `'chunks'`, or `'bytes'` for `Uint8Array` and string chunks,
     * with strings counted as their UTF-8 length. With `'bytes'`, any other chunk errors every
     * branch with a `TypeError`.
     * @default 'chunks'
     */
    unit?: 'chunks' | 'bytes' | undefined;
    /** Aborting errors every branch with `signal.reason` and cancels the source. */
    signal?: AbortSignal | undefined;
  };
}

type Branch<chunk> = {
  controller: ReadableStreamDefaultController<chunk>;
  queue: chunk[];
  queued: number;
  waiting: boolean;
};

/**
 * Splits a source into `count` streams that each receive every chunk. The source is read only
 * as fast as the slowest branch allows: once a branch holds `highWaterMark` unread chunks or
 * bytes, the source isn't read until that branch reads. Cancelling a branch removes it, and
 * the source is cancelled only when every branch is cancelled, with the last branch's reason.
 * An error in the source errors every branch. Aborting `signal` errors every branch with its
 * reason and cancels the source.
 *
 * Branches receive the same chunk objects, as with `ReadableStream.prototype.tee()`, so copy a
 * chunk (`chunk.slice()`) before you change it in one branch.
 *
 * @example
 * ```ts
 * import * as Streams from '@portable/streams';
 *
 * const [forExif, forStorage, forResize] = Streams.tee(request.body!, 3, {
 *   highWaterMark: 1_000_000,
 *   unit: 'bytes',
 * });
 * ```
 */
export function tee<chunk>(
  source: Source<chunk>,
  count: number,
  options: tee.Options = {},
): ReadableStream<chunk>[] {
  const { signal, unit = 'chunks', highWaterMark = unit === 'bytes' ? 65536 : 16 } = options;
  if (!Number.isInteger(count) || count < 1) {
    throw new RangeError(`count must be a positive integer, got ${count}.`);
  }
  if (!(highWaterMark >= 0)) {
    throw new RangeError(`highWaterMark must be 0 or more, got ${highWaterMark}.`);
  }
  const sizeOf = unit === 'bytes' ? byteLength : () => 1;
  const reader = toStream(source).getReader();
  const active = new Set<Branch<chunk>>();
  let reading = false;

  const finish = () => {
    active.clear();
    signal?.removeEventListener('abort', abort);
  };
  const fail = (error: unknown) => {
    for (const branch of active) {
      branch.controller.error(error);
    }
    finish();
  };
  const failAndCancel = (error: unknown) => {
    fail(error);
    void reader.cancel(error).catch(() => {});
  };
  const abort = () => failAndCancel(signal!.reason);

  const pump = () => {
    if (reading) {
      return;
    }
    let wanted = false;
    for (const branch of active) {
      if (!branch.waiting && branch.queued >= highWaterMark) {
        return;
      }
      wanted ||= branch.waiting;
    }
    if (!wanted) {
      return;
    }
    reading = true;
    reader.read().then((result) => {
      reading = false;
      if (result.done) {
        for (const { controller, queue } of active) {
          for (const chunk of queue) {
            controller.enqueue(chunk);
          }
          controller.close();
        }
        return finish();
      }
      let size: number;
      try {
        size = sizeOf(result.value);
      } catch (error) {
        return failAndCancel(error);
      }
      for (const branch of active) {
        if (branch.waiting) {
          branch.waiting = false;
          branch.controller.enqueue(result.value);
        } else {
          branch.queue.push(result.value);
          branch.queued += size;
        }
      }
      pump();
    }, fail);
  };

  const branches = Array.from({ length: count }, () => {
    let branch!: Branch<chunk>;
    return new ReadableStream<chunk>(
      {
        start(controller) {
          branch = { controller, queue: [], queued: 0, waiting: false };
          active.add(branch);
        },
        pull(controller) {
          if (branch.queue.length === 0) {
            branch.waiting = true;
          } else {
            const chunk = branch.queue.shift()!;
            branch.queued -= sizeOf(chunk);
            controller.enqueue(chunk);
          }
          pump();
        },
        cancel(reason) {
          if (!active.delete(branch)) {
            return;
          }
          if (active.size > 0) {
            return pump();
          }
          finish();
          return reader.cancel(reason);
        },
      },
      { highWaterMark: 0 },
    );
  });
  if (signal?.aborted) {
    abort();
  } else {
    signal?.addEventListener('abort', abort);
  }
  return branches;
}
