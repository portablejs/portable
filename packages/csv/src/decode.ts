import { assertUint8Array } from '@portable/bytes/internal';
import type { DecoderStream } from './DecoderStream.js';
import { createParser } from './parser.js';

export declare namespace decode {
  type Options<
    header extends DecoderStream.Header = DecoderStream.Header,
    relax extends boolean = boolean,
  > = Omit<DecoderStream.Options<header, relax>, 'signal'>;
}

/**
 * Decodes CSV bytes or text into rows. A row is a `string[]`, or an object keyed by column name
 * when `header` is set. Values stay strings.
 *
 * @example
 * ```ts
 * import * as Csv from '@portable/csv';
 *
 * Csv.decode('name,age\r\n"Smith, J",42\r\n'); // [['name', 'age'], ['Smith, J', '42']]
 * Csv.decode('name,age\nAda,36\n', { header: true }); // [{ name: 'Ada', age: '36' }]
 * Csv.decode('a\tb\n', { delimiter: '\t' }); // [['a', 'b']]
 * ```
 *
 * @throws {InvalidInputError} When text follows a closing quote, a row's field count differs from
 * the first row's (unless `relaxColumnCount` is set), or the header repeats a name.
 * @throws {TruncatedError} When the input ends inside a quoted field.
 * @throws {MaxLengthError} When a row is longer than `maxLength`.
 */
export function decode<
  const header extends DecoderStream.Header = false,
  relax extends boolean = false,
>(
  input: string | Uint8Array,
  options: decode.Options<header, relax> = {},
): DecoderStream.Row<header, relax>[] {
  const text =
    typeof input === 'string'
      ? input
      : new TextDecoder(options.encoding ?? 'utf-8', { ignoreBOM: true }).decode(
          assertUint8Array(input),
        );
  const rows: DecoderStream.Row<header, relax>[] = [];
  const parser = createParser(options, (row) => rows.push(row as DecoderStream.Row<header, relax>));
  parser.write(text);
  parser.end();
  return rows;
}
