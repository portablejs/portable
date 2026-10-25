import { describe, expect, test } from 'vite-plus/test';
import * as Csv from '@portable/csv';
import { bom, decodeAll, decodeError } from './utils.js';

describe('known upstream issues', () => {
  test('a __proto__ column is kept (papaparse drops it)', async () => {
    expect(await decodeAll('__proto__,b\nx,y', { header: true })).toEqual([
      JSON.parse('{"__proto__":"x","b":"y"}'),
    ]);
  });

  test('a final line break does not add an empty row (papaparse adds [""])', async () => {
    expect(await decodeAll('a,b\n1,2\n')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });

  test('a repeated header name throws (papaparse renames it, csv-parse keeps the last value)', async () => {
    expect(await decodeError('a,a\n1,2', { header: true })).toBeInstanceOf(Csv.InvalidInputError);
  });

  test('values are never converted, so leading zeros stay (papaparse dynamicTyping drops them)', async () => {
    expect(await decodeAll('zip,big\n02134,16142028098527942586', { header: true })).toEqual([
      { zip: '02134', big: '16142028098527942586' },
    ]);
  });

  test('one-column input needs no delimiter guess (papaparse reports UndetectableDelimiter)', async () => {
    expect(await decodeAll('a\nb')).toEqual([['a'], ['b']]);
  });

  test('text after a closing quote throws (papaparse merges the rest of the line into the field)', async () => {
    expect(await decodeError('"a" b,c')).toBeInstanceOf(Csv.InvalidInputError);
  });

  test('the byte order mark is dropped from the first column name (csv-parse keeps it by default)', async () => {
    expect(await decodeAll(`${bom}key\nvalue`, { header: true })).toEqual([{ key: 'value' }]);
  });

  test('an empty line is skipped (csv-parse throws Invalid Record Length by default)', async () => {
    expect(await decodeAll('a,b\n\nc,d\n')).toEqual([
      ['a', 'b'],
      ['c', 'd'],
    ]);
  });

  test("booleans are written as 'true' and 'false' (csv-stringify writes '1' and '')", () => {
    expect(Csv.encode([[true, false]])).toBe('true,false\r\n');
  });

  test('a Date is written as ISO 8601 (csv-stringify writes milliseconds since 1970)', () => {
    expect(Csv.encode([[new Date(0)]])).toBe('1970-01-01T00:00:00.000Z\r\n');
  });

  test('a lone LF or CR in a field is quoted with CRLF line breaks (csv-stringify with record_delimiter leaves it bare)', async () => {
    const text = Csv.encode([['a\nb', 'c\rd']]);
    expect(text).toBe('"a\nb","c\rd"\r\n');
    expect(await decodeAll(text)).toEqual([['a\nb', 'c\rd']]);
  });

  test('a row of one empty field survives a round trip (papaparse and csv-stringify write an empty line)', async () => {
    const rows = [['a'], [''], ['b']];
    expect(await decodeAll(Csv.encode(rows))).toEqual(rows);
  });
});
