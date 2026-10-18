import { checkAlphabet, checkLineLength, encode, toBase64, wrap } from './encode.js'

export declare namespace Base64EncoderStream {
  type Options = encode.Options
}

/**
 * A `TransformStream` that encodes bytes, or strings as UTF-8, to base64 text. The output is the
 * same as `encode` of all the input at once, however the input is chunked: lines break at the
 * same places, and no output ends with a line ending.
 *
 * @example
 * ```ts
 * import { Base64EncoderStream } from '@portable/base64'
 *
 * const response = await fetch('https://example.com/logo.png')
 * const body = response.body!.pipeThrough(new Base64EncoderStream({ lineLength: 76 }))
 * ```
 */
export class Base64EncoderStream extends TransformStream<Uint8Array | string, string> {
  constructor(options: Base64EncoderStream.Options = {}) {
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

    const toBytes = (chunk: Uint8Array | string): Uint8Array => {
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
      if (highSurrogate === '') return chunk
      const pending = utf8.encode(highSurrogate)
      highSurrogate = ''
      return concat(pending, chunk)
    }

    const emit = (text: string, controller: TransformStreamDefaultController<string>) => {
      if (text === '') return
      if (lineLength === false) return controller.enqueue(text)
      controller.enqueue(wrap(text, lineLength, lineEnding, column))
      column = ((column + text.length - 1) % lineLength) + 1
    }

    super({
      transform(chunk, controller) {
        const bytes = concat(carry, toBytes(chunk))
        const whole = bytes.length - (bytes.length % 3)
        carry = bytes.slice(whole)
        emit(toBase64(bytes.subarray(0, whole), alphabet, false), controller)
      },
      flush(controller) {
        const rest = concat(carry, utf8.encode(highSurrogate))
        emit(toBase64(rest, alphabet, omitPadding), controller)
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
