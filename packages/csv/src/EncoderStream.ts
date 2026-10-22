import type { encode } from './encode.js'
import { abortable } from './abortable.js'
import { createEncoder, type Encoder } from './encoder.js'

export declare namespace EncoderStream {
  type Options = encode.Options & {
    /**
     * Errors the stream with `signal.reason` when the signal aborts, which makes `pipeThrough`
     * cancel the source.
     */
    signal?: AbortSignal | undefined
  }
}

/**
 * A `TransformStream` that encodes each row as one line of CSV text, as `Csv.encode` does, and
 * emits it as UTF-8 bytes.
 *
 * @example
 * ```ts
 * import * as Csv from '@portable/csv'
 * import * as Streams from '@portable/streams'
 *
 * const body = Streams.fromIterable(users)
 *   .pipeThrough(new Csv.EncoderStream({ header: ['id', 'email'] }))
 * return new Response(body, { headers: { 'content-type': 'text/csv' } })
 * ```
 */
export class EncoderStream extends TransformStream<encode.Row, Uint8Array<ArrayBuffer>> {
  constructor(options: EncoderStream.Options = {}) {
    const encoder: Encoder = createEncoder(options)
    const utf8 = new TextEncoder()
    super(
      abortable(
        {
          transform(row, controller) {
            controller.enqueue(utf8.encode(encoder.row(row)))
          },
          flush(controller) {
            const rest = encoder.end()
            if (rest) controller.enqueue(utf8.encode(rest))
          },
        },
        options.signal,
      ),
    )
  }
}
