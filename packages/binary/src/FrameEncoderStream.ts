import { assertUint8Array } from '@portable/bytes/internal';
import * as Streams from '@portable/streams';
import { assertEndian, type Endian } from './createReader.js';
import { InvalidInputError } from './errors.js';
import { assertPrefix, maxFrameBytes, prefixLength, writePrefix, type Prefix } from './prefix.js';

export declare namespace FrameEncoderStream {
  type Options = {
    /**
     * Errors the stream with `signal.reason` when aborted, which cancels the source it is piped
     * from.
     */
    signal?: AbortSignal | undefined;
    /** How each frame stores its length. @default 'varint' */
    prefix?: Prefix | undefined;
    /** Byte order of a `uint16` or `uint32` prefix. @default 'big' */
    endian?: Endian | undefined;
  };
}

/**
 * A `TransformStream` that writes each chunk as one frame: its length prefix followed by its
 * bytes, in a single output chunk. A chunk too long for the prefix errors the stream with
 * `Binary.InvalidInputError`.
 *
 * @example
 * ```ts
 * import * as Binary from '@portable/binary';
 *
 * const frames = new Binary.FrameEncoderStream({ prefix: 'uint32' });
 * frames.readable.pipeTo(socket.writable);
 * const writer = frames.writable.getWriter();
 * await writer.write(new TextEncoder().encode('hello'));
 * ```
 */
export class FrameEncoderStream extends TransformStream<Uint8Array, Uint8Array<ArrayBuffer>> {
  constructor(options: FrameEncoderStream.Options = {}) {
    const prefix = assertPrefix(options.prefix ?? 'varint');
    const endian = assertEndian(options.endian ?? 'big');
    const max = maxFrameBytes[prefix];
    super(
      Streams.abortable(
        {
          transform(chunk, controller) {
            assertUint8Array(chunk);
            if (chunk.length > max) {
              throw new InvalidInputError(
                `A frame of ${chunk.length} bytes is too long for a ${prefix} prefix, which holds up to ${max}.`,
              );
            }
            const frame = new Uint8Array(prefixLength(chunk.length, prefix) + chunk.length);
            frame.set(chunk, writePrefix(frame, chunk.length, prefix, endian));
            controller.enqueue(frame);
          },
        },
        options,
      ),
    );
  }
}
