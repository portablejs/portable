import { assertUint8Array } from '@portable/bytes/internal';
import type * as Errors from '@portable/errors';
import { formatIssues, isPromiseLike, validate } from '@portable/errors/internal';
import { InvalidInputError, MaxLengthError, SchemaError } from './errors.js';
import * as Streams from '@portable/streams';

export declare namespace DecoderStream {
  type Options<value = unknown> = {
    /**
     * Aborting errors the stream with `signal.reason` and cancels the source piped into it.
     */
    signal?: AbortSignal | undefined;
    /**
     * What to do with a line that isn't valid JSON: fail the stream, or drop the line and
     * continue.
     * @default 'error'
     */
    invalid?: 'error' | 'skip' | undefined;
    /**
     * Longest line, in UTF-16 code units, line ending excluded. The stream fails with
     * `MaxLengthError` as soon as a line grows past the limit, so a line without a newline can't
     * use unbounded memory. @default Infinity
     */
    maxLength?: number | undefined;
    /**
     * A [Standard Schema](https://standardschema.dev), such as one from Zod or Valibot, that each
     * value must pass. The stream emits the value that `validate` returns, and fails with
     * `SchemaError` on a value that doesn't pass, whatever `invalid` is. It also types the
     * values, so you don't need a type argument.
     */
    schema?: Errors.Schema<value> | undefined;
  };
}

/**
 * A `TransformStream` that decodes NDJSON (newline-delimited JSON, also called JSON Lines) into
 * values, one per line. Lines may end in LF or CRLF. Blank and whitespace-only lines are skipped.
 * Each line is parsed with `JSON.parse`, so a `null` line is emitted as `null`.
 *
 * The stream fails with `InvalidInputError` on a line that isn't valid JSON, unless
 * `invalid` is `'skip'`, and with `MaxLengthError` on a line longer than `maxLength`.
 *
 * Values are typed `unknown` unless you pass `schema`, which also checks each value, or a type
 * argument, as in `new Jsonl.DecoderStream<Event>()`, which doesn't.
 *
 * @example
 * ```ts
 * import * as Jsonl from '@portable/jsonl';
 *
 * const response = await fetch('https://example.com/events.ndjson');
 * const events = response.body!.pipeThrough(new Jsonl.DecoderStream());
 * ```
 */
export class DecoderStream<value = unknown> extends TransformStream<Uint8Array | string, value> {
  constructor(options: DecoderStream.Options<value> = {}) {
    const { invalid = 'error', maxLength = Infinity, schema } = options;
    if (!(maxLength >= 0)) {
      throw new RangeError('`maxLength` must be a number >= 0.');
    }
    const decoder = new TextDecoder();
    let partial = '';
    let lineNumber = 0;

    const decode = (
      line: string,
      controller: TransformStreamDefaultController<value>,
    ): void | PromiseLike<void> => {
      lineNumber++;
      if (line.endsWith('\r')) {
        line = line.slice(0, -1);
      }
      if (line.length > maxLength) {
        throw new MaxLengthError({ maxLength });
      }
      if (line === '') {
        return;
      }
      let parsed: value;
      try {
        parsed = JSON.parse(line);
      } catch (error) {
        if (invalid === 'skip' || line.trim() === '') {
          return;
        }
        throw new InvalidInputError(`Invalid JSON on line ${lineNumber}.`, { cause: error });
      }
      if (!schema) {
        controller.enqueue(parsed);
        return;
      }
      const at = lineNumber;
      const checked = validate(
        schema,
        parsed,
        (issues) =>
          new SchemaError({
            issues,
            message: `Line ${at} doesn't match the schema: ${formatIssues(issues)}`,
          }),
      );
      if (isPromiseLike(checked)) {
        return checked.then((value) => controller.enqueue(value));
      }
      controller.enqueue(checked);
    };

    // Decodes lines in order. An async schema makes it wait for each value before the next line.
    const decodeLines = (
      lines: readonly string[],
      start: number,
      controller: TransformStreamDefaultController<value>,
    ): void | PromiseLike<void> => {
      for (let i = start; i < lines.length; i++) {
        const pending = decode(lines[i]!, controller);
        if (pending) {
          return pending.then(() => decodeLines(lines, i + 1, controller));
        }
      }
    };

    super(
      Streams.abortable(
        {
          transform(chunk, controller) {
            const text =
              typeof chunk === 'string'
                ? chunk
                : decoder.decode(assertUint8Array(chunk), { stream: true });
            if (!text.includes('\n')) {
              partial += text;
              if (partial.length > maxLength + 1) {
                throw new MaxLengthError({ maxLength });
              }
              return;
            }
            const lines = text.split('\n');
            lines[0] = partial + lines[0];
            partial = lines.pop()!;
            if (partial.length > maxLength + 1) {
              throw new MaxLengthError({ maxLength });
            }
            return decodeLines(lines, 0, controller);
          },
          flush(controller) {
            return decode(partial + decoder.decode(), controller);
          },
        },
        options,
      ),
    );
  }
}
