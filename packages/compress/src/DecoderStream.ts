import * as Bytes from '@portable/bytes';
import { crc32, isUint8Array } from '@portable/bytes/internal';
import { adler32, assertTrailer, needsTrailerCheck } from './adler32.js';
import { assertMaxBytes, concat } from './bytes.js';
import type { Format } from './codec.js';
import { InvalidInputError, MaxBytesError, TruncatedError, classify } from './errors.js';
import {
  assertHeader,
  checksTrailerAtClose,
  rawEndCheck,
  storedLength,
  trailerCheck,
} from './gzip.js';

const maxQueued = 64 * 1024;

export declare namespace DecoderStream {
  type Options = {
    /** The compressed format: `'gzip'`, `'deflate'` (zlib), or `'deflate-raw'`. @default 'gzip' */
    format?: Format | undefined;
    /** Fail with `MaxBytesError` and cancel the input once the output grows past this many bytes. @default Infinity */
    maxBytes?: number | undefined;
    /**
     * Aborting errors the stream with `signal.reason` and cancels the source piped into it.
     */
    signal?: AbortSignal | undefined;
  };
}

/**
 * A `TransformStream` that decompresses with `DecompressionStream`, adding a `maxBytes` limit and
 * the package's error classes. Input chunks that arrive while the decompressor is busy are joined
 * into one write, so each small network chunk doesn't add the decompressor's per-chunk cost.
 * Reads one gzip member, as `DecompressionStream` does, and fails with `InvalidInputError` if
 * another follows.
 *
 * @example
 * ```ts
 * import * as Compress from '@portable/compress';
 *
 * const response = await fetch('https://example.com/export.ndjson.gz');
 * const body = response.body!.pipeThrough(new Compress.DecoderStream({ maxBytes: 1_000_000_000 }));
 * ```
 */
export class DecoderStream extends TransformStream<Uint8Array, Uint8Array<ArrayBuffer>> {
  override readonly readable: ReadableStream<Uint8Array<ArrayBuffer>>;
  override readonly writable: WritableStream<Uint8Array>;

  constructor(options: DecoderStream.Options = {}) {
    super();
    const { format = 'gzip', maxBytes = Infinity, signal } = options;
    assertMaxBytes(maxBytes);
    const native = new DecompressionStream(format);
    const writer = native.writable.getWriter();
    const reader = native.readable.getReader();
    let failure: { error: unknown } | undefined;
    let closing = false;
    let queue: Uint8Array[] = [];
    let queued = 0;
    let writing: Promise<void> | undefined;
    let length = 0;
    const checkTrailer = format === 'deflate' ? needsTrailerCheck() : undefined;
    let checking = checkTrailer !== undefined;
    void checkTrailer?.then((needed) => (checking = needed));
    let gzipCheck: ReturnType<typeof trailerCheck> | undefined;
    let rawEnd: ReturnType<typeof rawEndCheck> | undefined;
    let started: Promise<void> | undefined;
    const start = async () => {
      started ??= (async () => {
        if (format === 'gzip' && (await checksTrailerAtClose())) {
          gzipCheck = trailerCheck();
        }
        if (format === 'deflate-raw' && (await needsTrailerCheck())) {
          rawEnd = rawEndCheck();
        }
      })();
      await started;
    };
    const tailLength = format === 'gzip' ? 8 : 4;
    let tail = new Uint8Array(0);
    let position = 0;
    let checksum = 1;
    let crc = 0;

    let writable: WritableStreamDefaultController | undefined;
    let readable: ReadableStreamDefaultController<Uint8Array<ArrayBuffer>> | undefined;

    const stop = (reason: unknown): unknown => {
      const error = fail(reason);
      readable?.error(error);
      reader.cancel(error).catch(() => {});
      writer.abort(error).catch(() => {});
      return error;
    };
    const onAbort = () => stop(signal!.reason);

    const fail = (error: unknown): unknown => {
      if (failure) {
        return failure.error;
      }
      failure = { error };
      rawEnd?.abort();
      signal?.removeEventListener('abort', onAbort);
      writable?.error(error);
      return error;
    };
    const classifyError = async (error: unknown, closing: boolean): Promise<unknown> => {
      const classified = classify(error, closing);
      if (classified instanceof TruncatedError && (await gzipCheck?.isInvalid())) {
        return new InvalidInputError('Compressed input is invalid.', { cause: error });
      }
      return classified;
    };
    const throwIfFailed = () => {
      if (failure) {
        throw failure.error;
      }
    };

    const writeQueue = async () => {
      try {
        while (queue.length > 0) {
          const chunk = concat(queue);
          queue = [];
          queued = 0;
          await writer.write(chunk);
        }
      } catch (error) {
        fail(await classifyError(error, closing));
      }
      writing = undefined;
    };

    this.writable = new WritableStream<Uint8Array>({
      start(controller) {
        writable = controller;
      },
      async write(chunk) {
        throwIfFailed();
        if (!isUint8Array(chunk)) {
          throw stop(new TypeError('Expected a Uint8Array chunk.'));
        }
        await start();
        throwIfFailed();
        if (format === 'gzip' && position < 4) {
          try {
            assertHeader(chunk, position);
          } catch (error) {
            throw stop(error);
          }
        }
        position += chunk.byteLength;
        gzipCheck?.write(chunk);
        rawEnd?.write(chunk);
        if (format !== 'deflate-raw') {
          tail =
            chunk.byteLength >= tailLength
              ? chunk.slice(-tailLength)
              : Bytes.concat([tail, chunk]).slice(-tailLength);
        }
        queue.push(chunk);
        queued += chunk.byteLength;
        writing ??= writeQueue();
        if (queued >= maxQueued) {
          await writing;
        }
        throwIfFailed();
      },
      async close() {
        await start();
        await writing;
        throwIfFailed();
        closing = true;
        try {
          await writer.close();
        } catch (error) {
          throw fail(await classifyError(error, true));
        }
      },
      async abort(reason) {
        fail(reason);
        await writer.abort(reason).catch(() => {});
      },
    });

    this.readable = new ReadableStream<Uint8Array<ArrayBuffer>>(
      {
        start(controller) {
          readable = controller;
        },
        async pull(controller) {
          let result: ReadableStreamReadResult<Uint8Array<ArrayBuffer>>;
          try {
            result = await reader.read();
          } catch (error) {
            throw fail(await classifyError(error, closing));
          }
          if (result.done) {
            try {
              if (await checkTrailer) {
                assertTrailer(tail, checksum);
              }
              await rawEnd?.assertEnd(crc, length);
              // Bun's decoder decodes every gzip member instead of failing on the second, so the
              // output is longer than the length in the last member's trailer.
              if (format === 'gzip' && storedLength(tail) !== length % 2 ** 32) {
                throw new InvalidInputError('Compressed input is invalid.');
              }
            } catch (error) {
              throw fail(error);
            }
            signal?.removeEventListener('abort', onAbort);
            return controller.close();
          }
          if (checking) {
            checksum = adler32(result.value, checksum);
          }
          if (rawEnd) {
            crc = crc32(result.value, crc);
          }
          length += result.value.byteLength;
          if (length > maxBytes) {
            const error = fail(new MaxBytesError({ maxBytes }));
            await reader.cancel(error).catch(() => {});
            throw error;
          }
          controller.enqueue(result.value);
        },
        async cancel(reason) {
          fail(reason);
          await reader.cancel(reason).catch(() => {});
        },
      },
      { highWaterMark: 0 },
    );

    if (signal?.aborted) {
      onAbort();
    } else {
      signal?.addEventListener('abort', onAbort, { once: true });
    }
  }
}
