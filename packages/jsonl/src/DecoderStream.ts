import { InvalidInputError, MaxLengthError } from './errors.js'
import { abortable } from './abortable.js'

export declare namespace DecoderStream {
  type Options = {
    /**
     * Errors the stream with `signal.reason` when aborted, which cancels the source it is piped
     * from.
     */
    signal?: AbortSignal | undefined
    /**
     * What to do with a line that isn't valid JSON: fail the stream, or drop the line and
     * continue.
     * @default 'error'
     */
    invalid?: 'error' | 'skip' | undefined
    /**
     * Longest line, in UTF-16 code units, line ending excluded. A longer line fails the stream with
     * `MaxLengthError` as soon as it grows past the limit, so a line without a newline can't use
     * unbounded memory. @default Infinity
     */
    maxLength?: number | undefined
  }
}

/**
 * A `TransformStream` that decodes NDJSON (newline-delimited JSON, also called JSON Lines) into
 * values, one per line. Lines may end in LF or CRLF. Blank lines are skipped. Each line is
 * parsed with `JSON.parse`, so a `null` line is emitted as `null`.
 *
 * The stream fails with `InvalidInputError` on a line that isn't valid JSON, unless
 * `invalid` is `'skip'`, and with `MaxLengthError` on a line longer than `maxLength`.
 *
 * @example
 * ```ts
 * import * as Jsonl from '@portable/jsonl'
 *
 * const response = await fetch('https://example.com/events.ndjson')
 * const events = response.body!.pipeThrough(new Jsonl.DecoderStream())
 * ```
 */
export class DecoderStream extends TransformStream<Uint8Array | string, unknown> {
  constructor(options: DecoderStream.Options = {}) {
    const { invalid = 'error', maxLength = Infinity } = options
    if (!(maxLength >= 0)) throw new RangeError('`maxLength` must be a number >= 0.')
    const decoder = new TextDecoder()
    let partial = ''
    let lineNumber = 0

    const decode = (line: string, controller: TransformStreamDefaultController<unknown>) => {
      lineNumber++
      if (line.endsWith('\r')) line = line.slice(0, -1)
      if (line.length > maxLength) throw new MaxLengthError({ maxLength })
      if (line === '') return
      let value: unknown
      try {
        value = JSON.parse(line)
      } catch (error) {
        if (invalid === 'skip' || line.trim() === '') return
        throw new InvalidInputError(`Invalid JSON on line ${lineNumber}.`, { cause: error })
      }
      controller.enqueue(value)
    }

    super(
      abortable(
        {
          transform(chunk, controller) {
            const text = typeof chunk === 'string' ? chunk : decoder.decode(chunk, { stream: true })
            if (!text.includes('\n')) {
              partial += text
              if (partial.length > maxLength + 1) throw new MaxLengthError({ maxLength })
              return
            }
            const lines = text.split('\n')
            lines[0] = partial + lines[0]
            partial = lines.pop()!
            if (partial.length > maxLength + 1) throw new MaxLengthError({ maxLength })
            for (const line of lines) decode(line, controller)
          },
          flush(controller) {
            decode(partial + decoder.decode(), controller)
          },
        },
        options.signal,
      ),
    )
  }
}
