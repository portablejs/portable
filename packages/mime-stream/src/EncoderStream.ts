import type * as Bytes from '@portable/bytes'
import { isInput, toUint8Array } from '@portable/bytes/internal'
import * as Streams from '@portable/streams'

export declare namespace EncoderStream {
  /**
   * A chunk from `DecoderStream`, or any object with `bytes`, or bytes or text to insert. Text is
   * written as UTF-8.
   */
  type Input = Bytes.Input | string | { readonly bytes: Bytes.Input | string }

  type Options = {
    /**
     * Errors the stream with `signal.reason` when aborted, which cancels the source it is piped
     * from.
     */
    signal?: AbortSignal | undefined
  }
}

/**
 * A `TransformStream` that writes chunks from `MimeStream.DecoderStream` back out as bytes. Chunks
 * that pass through unchanged give back the original message byte for byte.
 *
 * @example
 * ```ts
 * import * as MimeStream from '@portable/mime-stream'
 *
 * const output = response.body!
 *   .pipeThrough(new MimeStream.DecoderStream())
 *   .pipeThrough(new MimeStream.EncoderStream())
 * ```
 */
export class EncoderStream extends TransformStream<EncoderStream.Input, Uint8Array> {
  constructor(options: EncoderStream.Options = {}) {
    const encoder = new TextEncoder()
    super(
      Streams.abortable(
        {
          transform(chunk, controller) {
            const value = typeof chunk === 'string' || isInput(chunk) ? chunk : chunk.bytes
            if (typeof value !== 'string' && !isInput(value))
              throw new TypeError('Expected bytes, a string or an object with bytes.')
            const bytes = typeof value === 'string' ? encoder.encode(value) : toUint8Array(value)
            if (bytes.length > 0) controller.enqueue(bytes)
          },
        },
        options,
      ),
    )
  }
}
