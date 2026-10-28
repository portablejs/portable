import * as Errors from '@portable/errors';

/**
 * Thrown when a read needs more bytes than remain, or a `FrameDecoderStream` ends partway through
 * a frame. `offset` is where the value starts in the reader's bytes, or, for a stream, the
 * number of bytes before the frame.
 *
 * @example
 * ```ts
 * import * as Binary from '@portable/binary';
 *
 * const reader = Binary.createReader(new Uint8Array([0x01]));
 * try {
 *   reader.uint16();
 * } catch (error) {
 *   if (error instanceof Binary.TruncatedError) {
 *     console.log(`ran out of bytes at offset ${error.offset}`);
 *   }
 * }
 * ```
 */
export class TruncatedError extends Errors.TruncatedError {
  static override readonly kind: string = 'Binary.TruncatedError';
}

/**
 * Thrown for malformed data: a varint longer than 10 bytes or too large for its type, text that
 * doesn't decode when `fatal` is set, or a frame too long for its prefix. `offset` is where the
 * value starts.
 *
 * @example
 * ```ts
 * import * as Binary from '@portable/binary';
 *
 * const reader = Binary.createReader(new Uint8Array(11).fill(0x80));
 * try {
 *   reader.varint();
 * } catch (error) {
 *   if (error instanceof Binary.InvalidInputError) {
 *     console.log(error.message);
 *   }
 * }
 * ```
 */
export class InvalidInputError extends Errors.InvalidInputError {
  static override readonly kind: string = 'Binary.InvalidInputError';
}

/**
 * Thrown by `FrameDecoderStream` when a frame's length prefix is larger than `maxBytes`.
 * `FrameDecoderStream` errors the stream with it as soon as it reads the prefix, before it buffers
 * any of the frame.
 *
 * @example
 * ```ts
 * import * as Binary from '@portable/binary';
 * import * as Streams from '@portable/streams';
 *
 * const frames = socket.readable.pipeThrough(new Binary.FrameDecoderStream({ maxBytes: 65_536 }));
 * try {
 *   for await (const frame of Streams.toAsyncIterable(frames)) {
 *     console.log(frame.length);
 *   }
 * } catch (error) {
 *   if (error instanceof Binary.MaxBytesError) {
 *     console.log(`a frame was over ${error.maxBytes} bytes`);
 *   }
 * }
 * ```
 */
export class MaxBytesError extends Errors.MaxBytesError {
  static override readonly kind: string = 'Binary.MaxBytesError';
  constructor(options: Errors.MaxBytesError.Options) {
    super({ message: `Frame exceeded maxBytes of ${options.maxBytes}.`, ...options });
  }
}
