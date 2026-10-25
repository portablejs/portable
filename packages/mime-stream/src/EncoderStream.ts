import { isUint8Array } from '@portable/bytes/internal';
import * as Streams from '@portable/streams';

export declare namespace EncoderStream {
  /**
   * A chunk from `DecoderStream`, or any object with `bytes`, or bytes or text to insert. Text is
   * written as UTF-8.
   */
  type Input = Uint8Array | string | { readonly bytes: Uint8Array | string };

  type Options = {
    /**
     * Errors the stream with `signal.reason` when aborted, which cancels the source it is piped
     * from.
     */
    signal?: AbortSignal | undefined;
  };
}

/**
 * A `TransformStream` that writes chunks from `MimeStream.DecoderStream` back out as bytes. Chunks
 * that pass through unchanged give back the original message byte for byte.
 *
 * @example
 * ```ts
 * import * as MimeStream from '@portable/mime-stream';
 *
 * const output = response.body!
 *   .pipeThrough(new MimeStream.DecoderStream())
 *   .pipeThrough(new MimeStream.EncoderStream());
 * ```
 */
export class EncoderStream extends TransformStream<EncoderStream.Input, Uint8Array> {
  constructor(options: EncoderStream.Options = {}) {
    const encoder = new TextEncoder();
    super(
      Streams.abortable(
        {
          transform(chunk, controller) {
            const value = isUint8Array(chunk) || typeof chunk === 'string' ? chunk : chunk.bytes;
            const bytes = typeof value === 'string' ? encoder.encode(value) : value;
            if (!isUint8Array(bytes)) {
              throw new TypeError('Expected a Uint8Array, a string or an object with bytes.');
            }
            if (bytes.length > 0) {
              controller.enqueue(bytes);
            }
          },
        },
        options,
      ),
    );
  }
}
