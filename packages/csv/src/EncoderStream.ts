import type { encode } from './encode.js';
import * as Streams from '@portable/streams';
import { createEncoder } from './encoder.js';

export declare namespace EncoderStream {
  type Options = encode.Options & {
    /**
     * Aborting errors the stream with `signal.reason` and cancels the source piped into it.
     */
    signal?: AbortSignal | undefined;
  };
}

/**
 * A `TransformStream` that encodes each row as one line of CSV text, as `Csv.encode` does, and
 * emits it as UTF-8 bytes.
 *
 * @example
 * ```ts
 * import * as Csv from '@portable/csv';
 * import * as Streams from '@portable/streams';
 *
 * const body = Streams.fromIterable(users)
 *   .pipeThrough(new Csv.EncoderStream({ header: ['id', 'email'] }));
 * return new Response(body, { headers: { 'content-type': 'text/csv' } });
 * ```
 */
export class EncoderStream extends TransformStream<encode.Row, Uint8Array<ArrayBuffer>> {
  constructor(options: EncoderStream.Options = {}) {
    const encoder = createEncoder(options);
    const utf8 = new TextEncoder();
    super(
      Streams.abortable(
        {
          transform(row, controller) {
            controller.enqueue(utf8.encode(encoder.row(row)));
          },
          flush(controller) {
            const rest = encoder.end();
            if (rest) {
              controller.enqueue(utf8.encode(rest));
            }
          },
        },
        options,
      ),
    );
  }
}
