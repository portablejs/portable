import { assertUint8Array } from '@portable/bytes/internal';
import * as Streams from '@portable/streams';
import { assertEndian, type Endian } from './createReader.js';
import { MaxBytesError, TruncatedError } from './errors.js';
import { assertPrefix, readPrefix, type Prefix } from './prefix.js';
import { position } from './varint.js';

export declare namespace FrameDecoderStream {
  type Options = {
    /**
     * Aborting errors the stream with `signal.reason` and cancels the source piped into it.
     */
    signal?: AbortSignal | undefined;
    /** How each frame stores its length. @default 'varint' */
    prefix?: Prefix | undefined;
    /** Byte order of a `uint16` or `uint32` prefix. @default 'big' */
    endian?: Endian | undefined;
    /** The largest frame, not counting its prefix. @default Infinity */
    maxBytes?: number | undefined;
  };
}

/**
 * A `TransformStream` that splits bytes into length-prefixed frames, emitting each frame's bytes
 * without the prefix. A frame can arrive split across any number of chunks, and one chunk can hold
 * many frames.
 *
 * @example
 * ```ts
 * import * as Binary from '@portable/binary';
 * import * as Streams from '@portable/streams';
 *
 * const packets = socket.readable.pipeThrough(
 *   new Binary.FrameDecoderStream({ prefix: 'varint', maxBytes: 2_097_151 }),
 * );
 * for await (const packet of Streams.toAsyncIterable(packets)) {
 *   const reader = Binary.createReader(packet);
 *   console.log('packet id', reader.varint());
 * }
 * ```
 */
export class FrameDecoderStream extends TransformStream<Uint8Array, Uint8Array<ArrayBuffer>> {
  constructor(options: FrameDecoderStream.Options = {}) {
    const prefix = assertPrefix(options.prefix ?? 'varint');
    const little = assertEndian(options.endian ?? 'big') === 'little';
    const { maxBytes = Infinity } = options;
    if (!(maxBytes >= 0)) {
      throw new RangeError('`maxBytes` must be a number >= 0.');
    }
    // Bytes of an incomplete frame, held until the rest arrives.
    let held = new Uint8Array(0);
    let heldLength = 0;
    // How many bytes of input came before `held`, for the offset in errors.
    let consumed = 0;

    /** Emits each whole frame in `bytes[0..end)` and returns where the incomplete rest starts. */
    const split = (
      bytes: Uint8Array,
      end: number,
      controller: TransformStreamDefaultController<Uint8Array<ArrayBuffer>>,
    ): number => {
      let at = 0;
      for (;;) {
        const length = readPrefix(bytes, at, end, prefix, little);
        if (length === undefined) {
          return at;
        }
        if (length > maxBytes) {
          throw new MaxBytesError({ maxBytes });
        }
        const body = position.next;
        if (length > end - body) {
          return at;
        }
        controller.enqueue(bytes.slice(body, body + length));
        at = body + length;
      }
    };

    const hold = (bytes: Uint8Array) => {
      const needed = heldLength + bytes.length;
      if (needed > held.length) {
        const grown = new Uint8Array(Math.max(needed, held.length * 2, 64));
        grown.set(held.subarray(0, heldLength));
        held = grown;
      }
      held.set(bytes, heldLength);
      heldLength = needed;
    };

    super(
      Streams.abortable(
        {
          transform(chunk, controller) {
            assertUint8Array(chunk);
            if (heldLength === 0) {
              const rest = split(chunk, chunk.length, controller);
              consumed += rest;
              hold(chunk.subarray(rest));
              return;
            }
            hold(chunk);
            const rest = split(held, heldLength, controller);
            consumed += rest;
            held.copyWithin(0, rest, heldLength);
            heldLength -= rest;
          },
          flush() {
            if (heldLength > 0) {
              throw new TruncatedError(
                `Stream ended partway through the frame at offset ${consumed}.`,
                { offset: consumed },
              );
            }
          },
        },
        options,
      ),
    );
  }
}
