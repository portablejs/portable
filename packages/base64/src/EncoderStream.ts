import { checkAlphabet, checkLineLength, encode, toBase64, toBytes } from './encode.js'

export declare namespace EncoderStream {
  type Options = encode.Options
}

/**
 * A `TransformStream` that encodes bytes, or strings as UTF-8, to base64 text. The output is the
 * same as `encode` of all the input at once, however the input is chunked: lines break at the
 * same places, and no output ends with a line ending.
 *
 * @example
 * ```ts
 * import * as Base64 from '@portable/base64'
 *
 * const response = await fetch('https://example.com/logo.png')
 * const body = response.body!.pipeThrough(new Base64.EncoderStream({ lineLength: 76 }))
 * ```
 */
export class EncoderStream extends TransformStream<Uint8Array | string, string> {
  constructor(options: EncoderStream.Options = {}) {
    const {
      alphabet = 'base64',
      lineEnding = '\r\n',
      lineLength = false,
      omitPadding = false,
    } = options
    checkAlphabet(alphabet)
    checkLineLength(lineLength)
    const utf8 = new TextEncoder()
    let carry = new Uint8Array(0)
    let highSurrogate = ''
    let column = 0

    const readChunk = (chunk: Uint8Array | string): Uint8Array => {
      if (typeof chunk === 'string') {
        let text = highSurrogate + chunk
        highSurrogate = ''
        const last = text.charCodeAt(text.length - 1)
        if (last >= 0xd800 && last <= 0xdbff) {
          highSurrogate = text.slice(-1)
          text = text.slice(0, -1)
        }
        return utf8.encode(text)
      }
      if (highSurrogate === '') return toBytes(chunk)
      const pending = utf8.encode(highSurrogate)
      highSurrogate = ''
      return concat(pending, toBytes(chunk))
    }

    const emit = (
      bytes: Uint8Array,
      final: boolean,
      controller: TransformStreamDefaultController<string>,
    ) => {
      if (bytes.length === 0) return
      const pad = final && omitPadding
      controller.enqueue(
        toBase64(bytes, { alphabet, omitPadding: pad, lineLength, lineEnding }, column),
      )
      if (lineLength === false) return
      const rest = bytes.length % 3
      const length = ((bytes.length - rest) / 3) * 4 + (rest === 0 ? 0 : pad ? rest + 1 : 4)
      column = ((column + length - 1) % lineLength) + 1
    }

    super({
      transform(chunk, controller) {
        const bytes = concat(carry, readChunk(chunk))
        const whole = bytes.length - (bytes.length % 3)
        carry = bytes.slice(whole)
        emit(bytes.subarray(0, whole), false, controller)
      },
      flush(controller) {
        emit(concat(carry, utf8.encode(highSurrogate)), true, controller)
      },
    })
  }
}

function concat(a: Uint8Array, b: Uint8Array): Uint8Array {
  if (a.length === 0) return b
  const out = new Uint8Array(a.length + b.length)
  out.set(a)
  out.set(b, a.length)
  return out
}
