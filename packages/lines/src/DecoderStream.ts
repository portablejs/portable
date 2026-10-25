import { assertUint8Array } from '@portable/bytes/internal';
import * as Streams from '@portable/streams';
import { MaxLengthError } from './errors.js';
/**
 * The separator `DecoderStream` splits lines at. A string is matched literally, and anything with
 * `[Symbol.split]`, such as a `RegExp`, is used as is.
 */
export type Separator = string | { [Symbol.split](text: string, limit?: number): string[] };

export declare namespace DecoderStream {
  type Options = {
    /**
     * Aborting errors the stream with `signal.reason` and cancels the source piped into it.
     */
    signal?: AbortSignal | undefined;
    /** Text encoding of byte chunks, as a `TextDecoder` label. @default 'utf-8' */
    encoding?: string | undefined;
    /** The longest line, in UTF-16 code units, not counting the separator. @default Infinity */
    maxLength?: number | undefined;
    /**
     * What to do with a line longer than `maxLength`: fail the stream, or drop the line and
     * continue.
     * @default 'error'
     */
    overflow?: 'error' | 'skip' | undefined;
    /** Where to split lines. @default /\r?\n/ */
    separator?: Separator | undefined;
    /** Drop empty lines instead of emitting them. @default false */
    skipEmpty?: boolean | undefined;
  };
}

const lineBreak = /\r?\n/;

/**
 * A `TransformStream` that decodes bytes into lines of text, or splits text into lines.
 *
 * @example
 * ```ts
 * import * as Lines from '@portable/lines';
 * import * as Streams from '@portable/streams';
 *
 * const response = await fetch('https://example.com/log.txt');
 * const lines = response.body!.pipeThrough(new Lines.DecoderStream());
 * for await (const line of Streams.toAsyncIterable(lines)) {
 *   console.log(line);
 * }
 * ```
 */
export class DecoderStream extends TransformStream<Uint8Array | string, string> {
  constructor(options: DecoderStream.Options = {}) {
    const {
      encoding = 'utf-8',
      maxLength = Infinity,
      overflow = 'error',
      separator = lineBreak,
      skipEmpty = false,
    } = options;
    if (!(maxLength >= 0)) {
      throw new RangeError('`maxLength` must be a number >= 0.');
    }
    const decoder = new TextDecoder(encoding);
    const splitLines = (text: string) =>
      typeof separator === 'string' ? text.split(separator) : text.split(separator);
    // The end of `partial` may be the start of a string separator, so its last `slack` characters
    // don't count toward `maxLength` and are kept when an overflowing line is dropped.
    const slack = typeof separator === 'string' ? Math.max(separator.length - 1, 0) : 0;
    const tail = (text: string) => (slack === 0 ? '' : text.slice(-slack));
    // Splitting `partial + text` again for every chunk of a long line takes quadratic time, so
    // `canSplit` checks first whether the new text can end the line. `end` holds the last `slack`
    // characters of `partial`, because slicing the joined string would copy all of it.
    let end = '';
    const canSplit = (text: string) =>
      separator === lineBreak
        ? text.includes('\n')
        : typeof separator === 'string'
          ? (end + text).includes(separator)
          : true;
    let partial = '';
    // A trailing CR may be the first half of a CRLF split across chunks, so it is held back.
    let cr = false;
    let overflowed = false;

    const emit = (line: string, controller: TransformStreamDefaultController<string>) => {
      if (skipEmpty && line === '') {
        return;
      }
      if (line.length > maxLength) {
        if (overflow === 'error') {
          throw new MaxLengthError({ maxLength });
        }
        return;
      }
      controller.enqueue(line);
    };

    super(
      Streams.abortable(
        {
          transform(chunk, controller) {
            let text =
              typeof chunk === 'string'
                ? chunk
                : decoder.decode(assertUint8Array(chunk), { stream: true });
            if (cr) {
              text = '\r' + text;
            }
            cr = text.endsWith('\r');
            const body = cr ? text.slice(0, -1) : text;
            let lines: string[] = [];
            if (canSplit(body)) {
              lines = splitLines(partial + body);
              partial = lines.pop()!;
              end = tail(partial);
            } else {
              partial += body;
              end = tail(end + body);
            }

            if (overflowed) {
              if (lines.length === 0) {
                partial = end;
                return;
              }
              lines.shift();
              overflowed = false;
            }
            for (const line of lines) {
              emit(line, controller);
            }

            if (partial.length > maxLength + slack) {
              if (overflow === 'error') {
                throw new MaxLengthError({ maxLength });
              }
              overflowed = true;
              partial = end;
            }
          },
          flush(controller) {
            const lines = splitLines(partial + (cr ? '\r' : '') + decoder.decode());
            const last = lines.pop()!;
            if (overflowed) {
              if (lines.length === 0) {
                return;
              }
              lines.shift();
            }
            for (const line of lines) {
              emit(line, controller);
            }
            if (last !== '') {
              emit(last, controller);
            }
          },
        },
        options,
      ),
    );
  }
}
