import { abortable } from './abortable.js'
export declare namespace EncoderStream {
  type Options = {
    /** Errors the stream with `signal.reason` when aborted, which cancels the source it is piped from. */
    signal?: AbortSignal | undefined
  }
}

/**
 * A `TransformStream` that encodes each value as one line of NDJSON: `JSON.stringify(value)`
 * followed by `\n`. A value `JSON.stringify` can't encode (`undefined`, a function, a symbol, a
 * `BigInt` or a circular structure) fails the stream with a `TypeError`, so no line is lost
 * or malformed.
 *
 * @example
 * ```ts
 * import * as Jsonl from '@portable/jsonl'
 * import * as Streams from '@portable/streams'
 *
 * const body = Streams.fromIterable(rows)
 *   .pipeThrough(new Jsonl.EncoderStream())
 *   .pipeThrough(new TextEncoderStream())
 * return new Response(body, { headers: { 'content-type': 'application/x-ndjson' } })
 * ```
 */
export class EncoderStream extends TransformStream<unknown, string> {
  constructor(options: EncoderStream.Options = {}) {
    super(
      abortable(
        {
          transform(value, controller) {
            const json: string | undefined = JSON.stringify(value)
            if (json === undefined) throw new TypeError(`Can't encode ${typeof value} as JSON.`)
            controller.enqueue(json + '\n')
          },
        },
        options.signal,
      ),
    )
  }
}
