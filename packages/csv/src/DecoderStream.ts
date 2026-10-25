import { assertUint8Array } from '@portable/bytes/internal';
import * as Streams from '@portable/streams';
import { createParser, type Parser } from './parser.js';

export declare namespace DecoderStream {
  /** `true` reads column names from the first row. An array gives the names for input with no header row. */
  type Header = boolean | readonly string[];

  /**
   * A row as `string[]`, or as an object keyed by column name when `header` is set. With an array
   * of names, the keys are those names, and with `relaxColumnCount` each key is optional, because
   * a short row leaves the missing keys out.
   */
  type Row<header extends Header = false, relax extends boolean = false> = header extends false
    ? string[]
    : header extends readonly (infer name extends string)[]
      ? [relax] extends [false]
        ? Record<name, string>
        : Partial<Record<name, string>>
      : Record<string, string>;

  type Options<header extends Header = Header, relax extends boolean = boolean> = {
    /** Field separator, one character. Use `'\t'` for TSV. @default ',' */
    delimiter?: string | undefined;
    /** Text encoding of byte input, as a `TextDecoder` label. @default 'utf-8' */
    encoding?: string | undefined;
    /** Emit each row as an object keyed by column name. @default false */
    header?: header | undefined;
    /** Longest allowed row, in UTF-16 code units of input text, not counting the line break. @default Infinity */
    maxLength?: number | undefined;
    /** Quote character, one character, or `false` to read quotes as ordinary text. @default '"' */
    quote?: string | false | undefined;
    /** Accept rows whose field count differs from the first row's or the header's. @default false */
    relaxColumnCount?: relax | undefined;
    /** Drop lines with no characters instead of reading each as a row with one empty field. @default true */
    skipEmpty?: boolean | undefined;
    /**
     * Errors the stream with `signal.reason` when the signal aborts, which makes `pipeThrough`
     * cancel the source.
     */
    signal?: AbortSignal | undefined;
  };
}

/**
 * A `TransformStream` that decodes CSV bytes or text into rows. A row is a `string[]`, or an
 * object keyed by column name when `header` is set. Quoted fields may hold delimiters, doubled
 * quotes and line breaks. Rows end in CRLF, LF or CR, and a leading byte order mark is dropped.
 * The output is the same however the input is split into chunks.
 *
 * @example
 * ```ts
 * import * as Csv from '@portable/csv';
 * import * as Streams from '@portable/streams';
 *
 * const response = await fetch('https://example.com/users.csv');
 * const rows = response.body!.pipeThrough(new Csv.DecoderStream({ header: true }));
 * for await (const row of Streams.toAsyncIterable(rows)) {
 *   console.log(row.email);
 * }
 * ```
 */
export class DecoderStream<
  const header extends DecoderStream.Header = false,
  relax extends boolean = false,
> extends TransformStream<Uint8Array | string, DecoderStream.Row<header, relax>> {
  constructor(options: DecoderStream.Options<header, relax> = {}) {
    const decoder = new TextDecoder(options.encoding ?? 'utf-8', { ignoreBOM: true });
    let parser: Parser;
    super(
      Streams.abortable(
        {
          start(controller) {
            parser = createParser(options, (row) =>
              controller.enqueue(row as DecoderStream.Row<header, relax>),
            );
          },
          transform(chunk) {
            parser.write(
              typeof chunk === 'string'
                ? chunk
                : decoder.decode(assertUint8Array(chunk), { stream: true }),
            );
          },
          flush() {
            parser.write(decoder.decode());
            parser.end();
          },
        },
        options,
      ),
    );
  }
}
