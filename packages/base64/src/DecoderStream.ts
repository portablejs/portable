import { createDecoder, decode } from './decode.js'
import * as Streams from '@portable/streams'

export declare namespace DecoderStream {
  type Options = decode.Options & {
    /**
     * Errors the stream with `signal.reason` when the signal aborts, which makes `pipeThrough`
     * cancel the source.
     */
    signal?: AbortSignal | undefined
  }
}

/**
 * A `TransformStream` that decodes base64 text or bytes. The output is the same as `decode` of all
 * the input at once, however the input is chunked, so line breaks, padding and groups of four
 * characters can be split anywhere. Invalid input in `'loose'` or `'strict'` mode
 * errors the stream with an `InvalidInputError` or `TruncatedError`.
 *
 * @example
 * ```ts
 * import * as Base64 from '@portable/base64'
 *
 * const bytes = mimePartBody.pipeThrough(new Base64.DecoderStream({ mode: 'mime' }))
 * ```
 */
export class DecoderStream extends TransformStream<string | Uint8Array, Uint8Array<ArrayBuffer>> {
  constructor(options: DecoderStream.Options = {}) {
    const { alphabet = 'base64', mode = 'loose' } = options
    const write = createDecoder(alphabet, mode)
    const utf8 = new TextDecoder()
    const enqueue = (
      bytes: Uint8Array,
      controller: TransformStreamDefaultController<Uint8Array>,
    ) => {
      if (bytes.length > 0) controller.enqueue(bytes)
    }
    super(
      Streams.abortable(
        {
          transform(chunk, controller) {
            const text = typeof chunk === 'string' ? chunk : utf8.decode(chunk, { stream: true })
            enqueue(write(text, false), controller)
          },
          flush(controller) {
            enqueue(write(utf8.decode(), true), controller)
          },
        },
        options,
      ),
    )
  }
}
