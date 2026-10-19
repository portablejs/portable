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
 * A `TransformStream` that encodes each row as one line of CSV text, as `Csv.encode` does. Pipe it
 * through `TextEncoderStream` for bytes.
 *
 * @example
 * ```ts
 * import * as Csv from '@portable/csv'
 * import * as Streams from '@portable/streams'
 *
 * const body = Streams.fromIterable(users)
 *   .pipeThrough(new Csv.EncoderStream({ header: ['id', 'email'] }))
 *   .pipeThrough(new TextEncoderStream())
 * return new Response(body, { headers: { 'content-type': 'text/csv' } })
 * ```
 */
export class EncoderStream extends TransformStream<encode.Row, string> {
  constructor(options: EncoderStream.Options = {}) {
    const encoder: Encoder = createEncoder(options)
    super(
      abortable(
        {
          transform(row, controller) {
            controller.enqueue(encoder.row(row))
          },
          flush(controller) {
            const rest = encoder.end()
            if (rest) controller.enqueue(rest)
          },
        },
        options.signal,
      ),
    )
  }
}
