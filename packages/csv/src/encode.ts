import { createEncoder } from './encoder.js';

export declare namespace encode {
  /**
   * A field value. `null` and `undefined` are written as an empty field, a `Date` with
   * `toISOString()`, and the rest with `String()`.
   */
  type Value = string | number | boolean | bigint | Date | null | undefined;

  /** A row as an array of fields, or as an object keyed by column name. */
  type Row = readonly Value[] | { readonly [name: string]: Value };

  type Options = {
    /** Start the output with a byte order mark, which Excel needs to read UTF-8. @default false */
    bom?: boolean | undefined;
    /** Field separator, one character. Use `'\t'` for TSV. @default ',' */
    delimiter?: string | undefined;
    /** Prefix fields that start with `=`, `+`, `-`, `@`, tab or CR with `'` and quote them, so spreadsheets don't run them as formulas. @default false */
    escapeFormulas?: boolean | undefined;
    /**
     * Write a header row. `true` takes the names from the first object row's keys. An array gives
     * the names and the order in which object rows' values are written. Without a header row,
     * object rows are written in the first row's key order.
     * @default false
     */
    header?: boolean | readonly string[] | undefined;
    /** Line break written after every row. @default '\r\n' */
    newline?: '\r\n' | '\n' | undefined;
    /** Quote character, or `false` to never quote, so a field that needs quoting throws. @default '"' */
    quote?: string | false | undefined;
  };
}

/**
 * Encodes rows as CSV text. A field is quoted only when it contains the delimiter, the quote or a
 * line break, and quotes inside it are doubled. Every row, including the last, ends with `newline`.
 *
 * @example
 * ```ts
 * import * as Csv from '@portable/csv';
 *
 * Csv.encode([['name', 'note'], ['Ada', 'said "hi", left']]); // 'name,note\r\nAda,"said ""hi"", left"\r\n'
 * Csv.encode([{ name: 'Ada', age: 36 }], { header: true }); // 'name,age\r\nAda,36\r\n'
 * ```
 *
 * @throws {InvalidInputError} When `quote` is `false` and a field needs quoting, a value isn't an
 * `encode.Value` or is an invalid `Date`, or an object row follows array rows and `header` isn't an array.
 * @throws {TypeError} When `header` is `true` with array rows.
 * @throws {RangeError} When `delimiter`, `quote` or `newline` isn't allowed.
 */
export function encode(rows: readonly encode.Row[], options: encode.Options = {}): string {
  const encoder = createEncoder(options);
  let text = '';
  for (const row of rows) {
    text += encoder.row(row);
  }
  return text + encoder.end();
}
