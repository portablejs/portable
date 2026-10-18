/** Splits text into lines. A string matches literally; anything with `[Symbol.split]` (such as a `RegExp`) is used as is. */
export type Separator = string | { [Symbol.split](text: string, limit?: number): string[] }

export declare namespace DecoderStream {
  type Options = {
    /** Text encoding of byte chunks, as a `TextDecoder` label. @default 'utf-8' */
    encoding?: string | undefined
    /** Longest partial line to buffer while waiting for a separator. @default Infinity */
    maxLength?: number | undefined
    /** What to do with a line longer than `maxLength`: fail the stream, or drop the line and continue. @default 'error' */
    overflow?: 'error' | 'skip' | undefined
    /** Where to split lines. @default /\r?\n/ */
    separator?: Separator | undefined
    /** Drop empty lines instead of emitting them. @default false */
    skipEmpty?: boolean | undefined
  }
}

/**
 * A `TransformStream` that decodes bytes into lines of text, or splits text into lines.
 *
 * @example
 * ```ts
 * import * as Lines from '@portable/lines'
 *
 * const response = await fetch('https://example.com/log.txt')
 * for await (const line of response.body!.pipeThrough(new Lines.DecoderStream())) console.log(line)
 * ```
 */
export class DecoderStream extends TransformStream<Uint8Array | string, string> {
  constructor(options: DecoderStream.Options = {}) {
    const {
      encoding = 'utf-8',
      maxLength = Infinity,
      overflow = 'error',
      separator = /\r?\n/,
      skipEmpty = false,
    } = options
    const decoder = new TextDecoder(encoding)
    const splitLines = (text: string) =>
      typeof separator === 'string' ? text.split(separator) : text.split(separator)
    let partial = ''
    let overflowed = false

    const emit = (line: string, controller: TransformStreamDefaultController<string>) => {
      if (skipEmpty && line === '') return
      if (line.length > maxLength) {
        if (overflow === 'error') throw new MaxLengthError(maxLength)
        return
      }
      controller.enqueue(line)
    }

    super({
      transform(chunk, controller) {
        const text = typeof chunk === 'string' ? chunk : decoder.decode(chunk, { stream: true })
        // A trailing CR may be the first half of a CRLF split across chunks, so hold it back.
        const holdCr = text.endsWith('\r')
        const lines = splitLines(partial + (holdCr ? text.slice(0, -1) : text))
        partial = lines.pop()! + (holdCr ? '\r' : '')

        if (overflowed) {
          if (lines.length === 0) {
            partial = ''
            return
          }
          lines.shift()
          overflowed = false
        }
        for (const line of lines) emit(line, controller)

        if (partial.length > maxLength) {
          if (overflow === 'error') throw new MaxLengthError(maxLength)
          overflowed = true
          partial = ''
        }
      },
      flush(controller) {
        const rest = partial + decoder.decode()
        if (overflowed) return
        const lines = splitLines(rest)
        const last = lines.pop()!
        for (const line of lines) emit(line, controller)
        if (last !== '') emit(last, controller)
      },
    })
  }
}

/** Thrown when a line grows past `maxLength` and `overflow` is `'error'`. */
export class MaxLengthError extends Error {
  override name = 'Lines.MaxLengthError'
  /** The limit that was exceeded. */
  readonly maxLength: number
  constructor(maxLength: number) {
    super(`Line exceeded maxLength of ${maxLength}.`)
    this.maxLength = maxLength
  }
}
