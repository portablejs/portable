import * as Streams from '@portable/streams'
export declare namespace EncoderStream {
  type Options = {
    /**
     * Errors the stream with `signal.reason` when aborted, which cancels the source it is piped
     * from.
     */
    signal?: AbortSignal | undefined
  }
}

/**
 * A `TransformStream` that encodes each value as one line of NDJSON: `JSON.stringify(value)`
 * followed by `\n`, as UTF-8 bytes. If `JSON.stringify` can't encode a value, such as `undefined`,
 * a function, a symbol, a `BigInt` or a circular structure, the stream fails with a `TypeError`
 * instead of dropping the line or writing a malformed one.
 *
 * @example
 * ```ts
 * import * as Jsonl from '@portable/jsonl'
 * import * as Streams from '@portable/streams'
 *
 * const body = Streams.fromIterable(rows)
 *   .pipeThrough(new Jsonl.EncoderStream())
 * return new Response(body, { headers: { 'content-type': 'application/x-ndjson' } })
 * ```
 */
export class EncoderStream extends TransformStream<unknown, Uint8Array<ArrayBuffer>> {
  constructor(options: EncoderStream.Options = {}) {
    const utf8 = new TextEncoder()
    super(
      Streams.abortable(
        {
          transform(value, controller) {
            const json = JSON.stringify(value) satisfies string | undefined
            if (json === undefined) {
              throw new TypeError(`Can't encode ${typeof value} as JSON.`)
            }
            controller.enqueue(utf8.encode(json + '\n'))
          },
        },
        options,
      ),
    )
  }
}
