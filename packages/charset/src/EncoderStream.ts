import { isUint8Array } from '@portable/bytes/internal';
import type { Charset } from './Charset.js';
import type { encode } from './encode.js';
import { createState, run } from './internal/run.js';
import * as Streams from '@portable/streams';

export declare namespace EncoderStream {
  type Options = encode.Options & {
    /**
     * Aborting errors the stream with `signal.reason` and cancels the source piped into it.
     */
    signal?: AbortSignal | undefined;
  };
}

/**
 * A `TransformStream` that encodes text into bytes in the given charset, like
 * `TextEncoderStream` for legacy charsets. Byte chunks are read as UTF-8. A character split
 * across chunks is encoded once, and ISO-2022-JP's escape back to ASCII is written when the
 * stream closes.
 *
 * @example
 * ```ts
 * import * as Charset from '@portable/charset';
 * import { shiftJis } from '@portable/charset/shift_jis';
 *
 * const response = await fetch('https://example.com/report.csv');
 * const shiftJisBytes = response.body!.pipeThrough(new Charset.EncoderStream(shiftJis));
 * ```
 */
export class EncoderStream extends TransformStream<string | Uint8Array, Uint8Array<ArrayBuffer>> {
  constructor(charset: Charset, options: EncoderStream.Options = {}) {
    const state = createState(charset, options);
    let decoder: TextDecoder | undefined;
    const text = (chunk: string | Uint8Array) => {
      if (isUint8Array(chunk)) {
        decoder ??= new TextDecoder();
        return decoder.decode(chunk, { stream: true });
      }
      if (typeof chunk !== 'string') {
        throw new TypeError('EncoderStream accepts only strings and Uint8Arrays.');
      }
      return decoder ? decoder.decode() + chunk : chunk;
    };
    super(
      Streams.abortable(
        {
          transform(chunk, controller) {
            const bytes = run(state, text(chunk), false);
            if (bytes.length > 0) {
              controller.enqueue(bytes);
            }
          },
          flush(controller) {
            const bytes = run(state, decoder ? decoder.decode() : '', true);
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
