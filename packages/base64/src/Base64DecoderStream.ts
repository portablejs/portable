import { checkMode, createDecoder, decode } from './decode.js'
import { checkAlphabet } from './encode.js'

export declare namespace Base64DecoderStream {
  type Options = decode.Options
}

/**
 * A `TransformStream` that decodes base64 text or bytes. The output is the same as `decode` of all
 * the input at once, however the input is chunked, so line breaks, padding and groups of four
 * characters can be split anywhere. Invalid input in `'loose'` or `'strict'` mode errors the
 * stream with a `DecodeError`.
 *
 * @example
 * ```ts
 * import { Base64DecoderStream } from '@portable/base64'
 *
 * const bytes = mimePartBody.pipeThrough(new Base64DecoderStream({ mode: 'mime' }))
 * ```
 */
export class Base64DecoderStream extends TransformStream<string | Uint8Array, Uint8Array> {
  constructor(options: Base64DecoderStream.Options = {}) {
    const { alphabet = 'base64', mode = 'loose' } = options
    checkAlphabet(alphabet)
    checkMode(mode)
    const write = createDecoder(alphabet, mode)
    const utf8 = new TextDecoder()
    const enqueue = (
      bytes: Uint8Array,
      controller: TransformStreamDefaultController<Uint8Array>,
    ) => {
      if (bytes.length > 0) controller.enqueue(bytes)
    }
    super({
      transform(chunk, controller) {
        const text = typeof chunk === 'string' ? chunk : utf8.decode(chunk, { stream: true })
        enqueue(write(text, false), controller)
      },
      flush(controller) {
        enqueue(write(utf8.decode(), true), controller)
      },
    })
  }
}
