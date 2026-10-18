import { InvalidInputError } from './errors.js'

export declare namespace NdjsonDecoderStream {
  type Options = {
    /** What to do with a line that isn't valid JSON: fail the stream, or drop the line and continue. @default 'error' */
    invalid?: 'error' | 'skip' | undefined
  }
}

/**
 * A `TransformStream` that decodes NDJSON (newline-delimited JSON, also called JSON Lines)
 * into values, one per line. Lines may end in LF or CRLF. Blank lines are skipped. Each line
 * is parsed with `JSON.parse`, so a `null` line is emitted as `null`.
 *
 * The stream fails with `InvalidInputError` on a line that isn't valid JSON, unless
 * `invalid` is `'skip'`.
 *
 * @example
 * ```ts
 * import * as JsonStream from '@portable/json-stream'
 *
 * const response = await fetch('https://example.com/events.ndjson')
 * const events = response.body!.pipeThrough(new JsonStream.NdjsonDecoderStream())
 * ```
 */
export class NdjsonDecoderStream extends TransformStream<Uint8Array | string, unknown> {
  constructor(options: NdjsonDecoderStream.Options = {}) {
    const { invalid = 'error' } = options
    const decoder = new TextDecoder()
    let partial = ''
    let lineNumber = 0

    const decode = (line: string, controller: TransformStreamDefaultController<unknown>) => {
      lineNumber++
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

    super({
      transform(chunk, controller) {
        const text = typeof chunk === 'string' ? chunk : decoder.decode(chunk, { stream: true })
        if (!text.includes('\n')) {
          partial += text
          return
        }
        const lines = text.split('\n')
        lines[0] = partial + lines[0]
        partial = lines.pop()!
        for (const line of lines) decode(line, controller)
      },
      flush(controller) {
        decode(partial + decoder.decode(), controller)
      },
    })
  }
}
