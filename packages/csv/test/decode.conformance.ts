import { fromIterable, toArray } from '@portable/streams';
import { describe, expect, expectTypeOf, test } from 'vite-plus/test';
import * as Csv from '@portable/csv';
import {
  bom,
  chunked,
  decodeAll,
  decodeError,
  decodeStream,
  encodeUtf8,
  fixture,
  fixtures,
} from './utils.js';

describe('RFC 4180', () => {
  const spectrum = fixtures.filter((path) => path.startsWith('spectrum/') && path.endsWith('.csv'));

  for (const path of spectrum) {
    test(`decodes csv-spectrum ${path.slice('spectrum/'.length)}`, async () => {
      const text = new TextDecoder().decode(await fixture(path));
      const json: unknown = JSON.parse(
        new TextDecoder().decode(await fixture(path.replace(/\.csv$/, '.json'))),
      );
      const expected = Array.isArray(json) ? json : [json];
      expect(await decodeAll(text, { header: true })).toEqual(expected);
    });
  }

  test('ends a row at CRLF, LF or CR', async () => {
    expect(await decodeAll('a,b\r\nc,d\ne,f\rg,h')).toEqual([
      ['a', 'b'],
      ['c', 'd'],
      ['e', 'f'],
      ['g', 'h'],
    ]);
  });

  test('reads a last row with or without a line break', async () => {
    expect(await decodeAll('a,b\r\nc,d')).toEqual(await decodeAll('a,b\r\nc,d\r\n'));
  });

  test('keeps spaces in unquoted fields', async () => {
    expect(await decodeAll('a,\tb ,c')).toEqual([['a', '\tb ', 'c']]);
  });

  test('keeps delimiters, doubled quotes and line breaks inside quoted fields', async () => {
    expect(await decodeAll('"a,b","say ""hi""","line\r\nbreak","cr\ronly"\n')).toEqual([
      ['a,b', 'say "hi"', 'line\r\nbreak', 'cr\ronly'],
    ]);
  });

  test('reads an empty field before, between and after delimiters', async () => {
    expect(await decodeAll(',a,,b,\n')).toEqual([['', 'a', '', 'b', '']]);
  });

  test('reads a quoted empty field as an empty string', async () => {
    expect(await decodeAll('"",a,""')).toEqual([['', 'a', '']]);
  });

  test('emits nothing for empty input', async () => {
    expect(await decodeAll('')).toEqual([]);
  });
});

describe('csv-parse', () => {
  test('decodes a string', () => {
    expect(Csv.decode('field_1,field_2\nvalue 1,value 2')).toEqual([
      ['field_1', 'field_2'],
      ['value 1', 'value 2'],
    ]);
  });

  test('decodes bytes', () => {
    expect(Csv.decode(encodeUtf8('field_1,field_2\nvalue 1,value 2'))).toEqual([
      ['field_1', 'field_2'],
      ['value 1', 'value 2'],
    ]);
  });

  test('gives the same rows for any split of the input', async () => {
    let text = '';
    for (let i = 0; i < 10; i++) {
      text += `Test ${i},${i},""""\n`;
    }
    const expected = Array.from({ length: 10 }, (_, i) => [`Test ${i}`, `${i}`, '"']);
    expect(await decodeAll(text)).toEqual(expected);
    expect(await decodeStream(chunked(text, 250))).toEqual(expected);
  });

  test('decodes a multi-byte character written one byte at a time', async () => {
    expect(await decodeStream(chunked(encodeUtf8('€'), 1))).toEqual([['€']]);
  });

  test('decodes generated rows piped from a stream', async () => {
    const stream = fromIterable(['OMH,ONKCHhJmjadoA\n', 'D,GeACHiN\n']);
    expect(await toArray(stream.pipeThrough(new Csv.DecoderStream()))).toEqual([
      ['OMH', 'ONKCHhJmjadoA'],
      ['D', 'GeACHiN'],
    ]);
  });

  test('fails the stream when the source fails', async () => {
    const source = new ReadableStream<string>({
      pull: (controller) => controller.error(new Error('ENOENT')),
    });
    await expect(toArray(source.pipeThrough(new Csv.DecoderStream()))).rejects.toThrow('ENOENT');
  });

  describe('quote', () => {
    test('reads quoted and unquoted fields', async () => {
      expect(await decodeAll('abc,"123",def,"456"\nhij,klm,"789",nop')).toEqual([
        ['abc', '123', 'def', '456'],
        ['hij', 'klm', '789', 'nop'],
      ]);
    });

    test('reads fields containing delimiters', async () => {
      const text = [
        '20322051544,",1979.0,8.8017226E7,ABC,45,2000-01-01",1,2,3,4',
        '"28392898392,1974.0","8.8392926E7","DEF,23,2050-11-27,",4,5,6',
      ].join('\n');
      expect(await decodeAll(text)).toEqual([
        ['20322051544', ',1979.0,8.8017226E7,ABC,45,2000-01-01', '1', '2', '3', '4'],
        ['28392898392,1974.0', '8.8392926E7', 'DEF,23,2050-11-27,', '4', '5', '6'],
      ]);
    });

    test('reads empty quoted values', async () => {
      expect(
        await decodeAll('20322051544,"",8.8017226E7,45,""\n"",1974,8.8392926E7,"",""'),
      ).toEqual([
        ['20322051544', '', '8.8017226E7', '45', ''],
        ['', '1974', '8.8392926E7', '', ''],
      ]);
    });

    test('reads doubled quotes', async () => {
      expect(await decodeAll('AB,"""",CD,"""hi"""\n"",JK,"",""\n')).toEqual([
        ['AB', '"', 'CD', '"hi"'],
        ['', 'JK', '', ''],
      ]);
      expect(await decodeAll('""""\n""""\n')).toEqual([['"'], ['"']]);
    });

    test('reads line breaks inside quotes', async () => {
      const text = '20322051544,"\n",8.8017226E7,45,"\nok\n"\n"\n",1974,8.8392926E7,"","\n"';
      expect(await decodeAll(text)).toEqual([
        ['20322051544', '\n', '8.8017226E7', '45', '\nok\n'],
        ['\n', '1974', '8.8392926E7', '', '\n'],
      ]);
    });

    test('reads quotes as text when quote is false', async () => {
      expect(await decodeAll('a,b,c\n1,r"2"d"2",3', { quote: false })).toEqual([
        ['a', 'b', 'c'],
        ['1', 'r"2"d"2"', '3'],
      ]);
      expect(await decodeAll('"a\tb"\t"c\n', { delimiter: '\t', quote: false })).toEqual([
        ['"a', 'b"', '"c'],
      ]);
    });

    test('reads a custom quote character', async () => {
      expect(await decodeAll("a,b,'c,d'", { quote: "'" })).toEqual([['a', 'b', 'c,d']]);
    });

    test('reads quoted fields with header', async () => {
      expect(await decodeAll('a,"b",c\n1,"2",3', { header: true })).toEqual([
        { a: '1', b: '2', c: '3' },
      ]);
    });

    test('throws TruncatedError when a quoted field is not closed', async () => {
      expect(await decodeError('"",1974,8.8392926E7,"","')).toBeInstanceOf(Csv.TruncatedError);
    });

    test('throws InvalidInputError for text after a closing quote', async () => {
      expect(await decodeError('""!')).toBeInstanceOf(Csv.InvalidInputError);
      expect(await decodeError('a,"b" c,d')).toBeInstanceOf(Csv.InvalidInputError);
      expect(await decodeError('a,""b"" c,d')).toBeInstanceOf(Csv.InvalidInputError);
    });

    test('accepts a delimiter or line break after a closing quote', async () => {
      expect(await decodeAll('""|BB', { delimiter: '|' })).toEqual([['', 'BB']]);
      expect(await decodeAll('""\nBB')).toEqual([[''], ['BB']]);
    });

    test('names the row of the error', async () => {
      const text = '"",1974,""\n"",1974,""t\n';
      expect(await decodeError(text)).toHaveProperty('message', expect.stringMatching(/Row 2\b/));
      const unclosed = '"",1\n"",1\n"",1\n"",1\n"",1,"';
      expect(await decodeError(unclosed)).toHaveProperty(
        'message',
        expect.stringMatching(/Row 5\b/),
      );
    });

    test('reads a quote inside an unquoted field as text', async () => {
      expect(await decodeAll('384682,the "SAMAY" Hostel,Jiron Florida 285')).toEqual([
        ['384682', 'the "SAMAY" Hostel', 'Jiron Florida 285'],
      ]);
      expect(await decodeAll('a,b "c",d\nBob"","23",e')).toEqual([
        ['a', 'b "c"', 'd'],
        ['Bob""', '23', 'e'],
      ]);
      expect(
        await decodeAll('"this","line",is,"also,valid"\nthis,"line",is,invalid h"ere"'),
      ).toEqual([
        ['this', 'line', 'is', 'also,valid'],
        ['this', 'line', 'is', 'invalid h"ere"'],
      ]);
    });
  });

  describe('bom', () => {
    test('drops a leading byte order mark', async () => {
      expect(await decodeAll(`${bom}a,b,c\nd,e,f`)).toEqual([
        ['a', 'b', 'c'],
        ['d', 'e', 'f'],
      ]);
    });

    test('drops the byte order mark from the first column name', async () => {
      expect(await decodeAll(`${bom}key\nvalue`, { header: true })).toEqual([{ key: 'value' }]);
    });

    test('reads a quoted field after the byte order mark', async () => {
      expect(await decodeAll(`${bom}"a",b,c\nd,e,f`)).toEqual([
        ['a', 'b', 'c'],
        ['d', 'e', 'f'],
      ]);
    });

    test('drops a byte order mark written one byte at a time', async () => {
      const chunks = [new Uint8Array([239]), new Uint8Array([187]), new Uint8Array([191])];
      expect(await decodeStream([...chunks, encodeUtf8('a,b,c\nd,e,f')])).toEqual([
        ['a', 'b', 'c'],
        ['d', 'e', 'f'],
      ]);
    });

    test('keeps input that only starts like a byte order mark', async () => {
      expect(await decodeStream([new Uint8Array([239, 187])])).toEqual([
        [String.fromCharCode(0xfffd)],
      ]);
    });

    test('keeps a byte order mark that is not at the start', async () => {
      expect(await decodeAll(`a\n${bom}b`)).toEqual([['a'], [`${bom}b`]]);
    });
  });

  describe('header', () => {
    test('reads column names from the first row', async () => {
      const text =
        'FIELD_1,FIELD_2,FIELD_3\n20322051544,1979,8.8017226E7\n28392898392,1974,8.8392926E7';
      expect(await decodeAll(text, { header: true })).toEqual([
        { FIELD_1: '20322051544', FIELD_2: '1979', FIELD_3: '8.8017226E7' },
        { FIELD_1: '28392898392', FIELD_2: '1974', FIELD_3: '8.8392926E7' },
      ]);
    });

    test('emits arrays when header is false', async () => {
      expect(await decodeAll('a,b,c\nd,e,f', { header: false })).toEqual([
        ['a', 'b', 'c'],
        ['d', 'e', 'f'],
      ]);
    });

    test('uses the given names for every row when header is an array', async () => {
      expect(await decodeAll('1,2,3\n4,5,6', { header: ['a', 'b', 'c'] })).toEqual([
        { a: '1', b: '2', c: '3' },
        { a: '4', b: '5', c: '6' },
      ]);
    });

    test('does not change the header array', async () => {
      const header = ['a', 'b', 'c', 'd'];
      await decodeAll('1,2,3,4\n5,6,7,8', { header });
      expect(header).toEqual(['a', 'b', 'c', 'd']);
    });

    test('skips empty lines before the header row', async () => {
      expect(await decodeAll('\na,b,c\n1,2,3', { header: true })).toEqual([
        { a: '1', b: '2', c: '3' },
      ]);
    });

    test('emits nothing for a header row alone', async () => {
      expect(await decodeAll('A,B,C', { header: true })).toEqual([]);
    });

    test('keeps values as strings', async () => {
      expect(await decodeAll('Person,2023\nJohn,100', { header: true })).toEqual([
        { Person: 'John', 2023: '100' },
      ]);
    });

    test('throws InvalidInputError when the header repeats a name', async () => {
      expect(await decodeError('a,b,a,c\n1,2,3,4', { header: true })).toBeInstanceOf(
        Csv.InvalidInputError,
      );
      expect(await decodeError(',,,\n1,2,3,4', { header: true })).toBeInstanceOf(
        Csv.InvalidInputError,
      );
      expect(() => Csv.decode('1,2', { header: ['a', 'a'] })).toThrow(Csv.InvalidInputError);
    });

    test('throws InvalidInputError when a row has fewer fields than the header', async () => {
      const header = ['a', 'b', 'c', 'd'];
      expect(await decodeError('1,2,3\n4,5,6,x', { header })).toBeInstanceOf(Csv.InvalidInputError);
      expect(await decodeError('1,2,3,x\n4,5,6,x\n7,8,9', { header })).toBeInstanceOf(
        Csv.InvalidInputError,
      );
      expect(await decodeError('a\nb,\n', { header: true })).toBeInstanceOf(Csv.InvalidInputError);
    });

    test('stores a __proto__ column as an own property', async () => {
      const [row] = await decodeAll('__proto__,role\nEVIL,admin\n', { header: true });
      expect(Object.getPrototypeOf(row)).toBe(Object.prototype);
      expect(Object.keys(row!)).toEqual(['__proto__', 'role']);
      expect(JSON.stringify(row)).toBe('{"__proto__":"EVIL","role":"admin"}');
    });
  });

  describe('delimiter', () => {
    test('defaults to a comma', async () => {
      expect(await decodeAll('abc,,123,\n,def,,')).toEqual([
        ['abc', '', '123', ''],
        ['', 'def', '', ''],
      ]);
    });

    test('splits on a tab', async () => {
      expect(await decodeAll('abc\t\tde\tf\t\n\thij\tklm\t\t', { delimiter: '\t' })).toEqual([
        ['abc', '', 'de', 'f', ''],
        ['', 'hij', 'klm', '', ''],
      ]);
    });

    test('splits on any one character', async () => {
      expect(await decodeAll('a|b|c\r\nd|e|f', { delimiter: '|' })).toEqual([
        ['a', 'b', 'c'],
        ['d', 'e', 'f'],
      ]);
      const unit = String.fromCharCode(31);
      expect(await decodeAll(`a${unit}b\r\nc${unit}d`, { delimiter: unit })).toEqual([
        ['a', 'b'],
        ['c', 'd'],
      ]);
      expect(await decodeAll('aфbфc\ndфeфf', { delimiter: 'ф' })).toEqual([
        ['a', 'b', 'c'],
        ['d', 'e', 'f'],
      ]);
    });

    test('rejects a delimiter that is empty, longer than one character, a line break or the quote', () => {
      for (const delimiter of ['', '!#', '\n', '\r', '"']) {
        expect(() => Csv.decode('a', { delimiter })).toThrow(RangeError);
      }
      expect(() => Csv.decode('a', { quote: '' })).toThrow(RangeError);
    });
  });

  describe('line breaks', () => {
    test('handles a line break split across chunks', async () => {
      const chunks = ['ABC,45', '\r\nDEF,23\r', '\nGHI,94\r\n', 'JKL,02\r\n'];
      expect(await decodeStream(chunks)).toEqual([
        ['ABC', '45'],
        ['DEF', '23'],
        ['GHI', '94'],
        ['JKL', '02'],
      ]);
      expect(await decodeStream(['abc,123', '\n', 'def,456'])).toEqual([
        ['abc', '123'],
        ['def', '456'],
      ]);
    });

    test('reads a trailing delimiter as a last empty field', async () => {
      expect(await decodeAll('"a","b","c",')).toEqual([['a', 'b', 'c', '']]);
    });

    test('keeps line breaks inside quotes when written one character at a time', async () => {
      expect(await decodeStream(chunked('1,2,"\n"\r\n3,4,', 1))).toEqual([
        ['1', '2', '\n'],
        ['3', '4', ''],
      ]);
    });

    for (const [name, text] of [
      ['CRLF', 'a,b\r\n1,2'],
      ['CR', 'a,b\r1,2'],
      ['LF', 'a,b\n1,2'],
    ] as const) {
      test(`reads ${name} line breaks from UTF-8 and UTF-16 bytes written one byte at a time`, async () => {
        const expected = [
          ['a', 'b'],
          ['1', '2'],
        ];
        expect(await decodeStream(chunked(encodeUtf8(text), 1))).toEqual(expected);
        expect(await decodeStream(chunked(encodeUtf8(bom + text), 1))).toEqual(expected);
        const utf16 = utf16le(bom + text);
        expect(await decodeStream(chunked(utf16, 1), { encoding: 'utf-16le' })).toEqual(expected);
      });
    }
  });

  describe('encoding', () => {
    test('decodes UTF-16LE bytes', async () => {
      expect(Csv.decode(utf16le('x:x'), { delimiter: ':', encoding: 'utf-16le' })).toEqual([
        ['x', 'x'],
      ]);
      expect(Csv.decode(utf16le('a,b,c\n1,"2 ""3"" 4",5'), { encoding: 'utf-16le' })).toEqual([
        ['a', 'b', 'c'],
        ['1', '2 "3" 4', '5'],
      ]);
    });

    test('decodes Windows-1252 bytes', async () => {
      const bytes = new Uint8Array([0x63, 0x61, 0x66, 0xe9, 0x2c, 0x80, 0x0a]);
      expect(Csv.decode(bytes, { encoding: 'windows-1252' })).toEqual([['café', '€']]);
    });

    test('drops a UTF-16LE byte order mark', async () => {
      const chunks = [utf16le(`${bom}a,"b",c\n`), utf16le('d,"e",f')];
      expect(await decodeStream(chunks, { encoding: 'utf-16le' })).toEqual([
        ['a', 'b', 'c'],
        ['d', 'e', 'f'],
      ]);
    });
  });

  describe('relaxColumnCount', () => {
    test('throws InvalidInputError by default when a row has a different field count', async () => {
      expect(await decodeError('1,2,3\n4,5')).toBeInstanceOf(Csv.InvalidInputError);
      expect(await decodeError('1,2\n1\n3,4\n5,6,7')).toHaveProperty(
        'message',
        expect.stringMatching(/Row 2\b/),
      );
      expect(await decodeError('headerA, headerB\nA2, B2\nA1, B1, C2, D2')).toHaveProperty(
        'message',
        expect.stringMatching(/Row 3\b/),
      );
    });

    test('accepts rows of any length when set', async () => {
      expect(await decodeAll('1,2,3\n4,5', { relaxColumnCount: true })).toEqual([
        ['1', '2', '3'],
        ['4', '5'],
      ]);
      expect(await decodeAll('1,2,3\na,b,c,d', { relaxColumnCount: true })).toEqual([
        ['1', '2', '3'],
        ['a', 'b', 'c', 'd'],
      ]);
    });

    test('leaves out missing columns of a short row', async () => {
      const options = { header: ['a', 'b', 'c', 'd'], relaxColumnCount: true };
      expect(await decodeAll('1,2,3\n4,5', options)).toEqual([
        { a: '1', b: '2', c: '3' },
        { a: '4', b: '5' },
      ]);
    });

    test('drops the extra fields of a long row', async () => {
      const options = { header: ['a', 'b', 'c'], relaxColumnCount: true };
      expect(await decodeAll('1,2,3,4\n5,6,7', options)).toEqual([
        { a: '1', b: '2', c: '3' },
        { a: '5', b: '6', c: '7' },
      ]);
    });

    test('reads a header row followed by a longer row', async () => {
      expect(await decodeAll('column_a\na,b', { relaxColumnCount: true })).toEqual([
        ['column_a'],
        ['a', 'b'],
      ]);
    });
  });

  describe('skipEmpty', () => {
    test('skips empty lines by default', async () => {
      expect(await decodeAll('ABC\n\nDEF')).toEqual([['ABC'], ['DEF']]);
      expect(await decodeAll('ABC\r\n\r\nDEF\r\n\r\n')).toEqual([['ABC'], ['DEF']]);
      const text = '\n20322051544,1979,8.8017226E7\n\n28392898392,1974,8.8392926E7\n';
      expect(await decodeAll(text)).toEqual([
        ['20322051544', '1979', '8.8017226E7'],
        ['28392898392', '1974', '8.8392926E7'],
      ]);
    });

    test('reads an empty line as one empty field when false', async () => {
      expect(await decodeAll('ABC\n\nDEF', { skipEmpty: false })).toEqual([['ABC'], [''], ['DEF']]);
    });

    test('reads a quoted empty field as a row', async () => {
      expect(await decodeAll('ABC\n""\nDEF')).toEqual([['ABC'], [''], ['DEF']]);
    });

    test('reads a line of whitespace as a row', async () => {
      expect(await decodeAll('a,b,c\n\t\nd,e,f', { relaxColumnCount: true })).toEqual([
        ['a', 'b', 'c'],
        ['\t'],
        ['d', 'e', 'f'],
      ]);
    });

    test('counts skipped lines in row numbers', async () => {
      expect(await decodeError('a,b\n\n\nc')).toHaveProperty(
        'message',
        expect.stringMatching(/Row 4\b/),
      );
    });

    test('gives the number of the first row that was read, after skipped lines', async () => {
      expect(await decodeError('\n\na,b\nc')).toHaveProperty(
        'message',
        'Row 4 has 1 fields, but row 3 has 2.',
      );
    });
  });

  describe('maxLength', () => {
    test('throws MaxLengthError for a row longer than maxLength', async () => {
      const text = '12,34,56\nab,cd,ef\nhi,xxxxxxxxxxxxxxx,jk\nlm,no,pq';
      const error = await decodeError(text, { maxLength: 10 });
      expect(error).toBeInstanceOf(Csv.MaxLengthError);
      expect(error).toHaveProperty('maxLength', 10);
    });

    test('accepts rows up to maxLength', async () => {
      expect(await decodeAll('12345678\n"1234"\r\n', { maxLength: 8 })).toEqual([
        ['12345678'],
        ['1234'],
      ]);
    });
  });
});

describe('row types', () => {
  test('an array of names types the row keys', () => {
    const rows = Csv.decode('1,a@b.c\n', { header: ['id', 'email'] });
    expectTypeOf(rows).toEqualTypeOf<Record<'id' | 'email', string>[]>();
    expect(rows).toEqual([{ id: '1', email: 'a@b.c' }]);
  });

  test('relaxColumnCount makes the named keys optional', () => {
    const rows = Csv.decode('1\n', { header: ['id', 'email'], relaxColumnCount: true });
    expectTypeOf(rows).toEqualTypeOf<Partial<Record<'id' | 'email', string>>[]>();
    expect(rows).toEqual([{ id: '1' }]);
  });

  test('header: true and a string[] of names give string keys', () => {
    const names = ['id'] satisfies string[];
    expectTypeOf(Csv.decode('id\n1\n', { header: true })).toEqualTypeOf<Record<string, string>[]>();
    expectTypeOf(Csv.decode('1\n', { header: names })).toEqualTypeOf<Record<string, string>[]>();
    expectTypeOf(Csv.decode('1\n')).toEqualTypeOf<string[][]>();
  });

  test('DecoderStream types its rows the same way', () => {
    const stream = new Csv.DecoderStream({ header: ['id'], relaxColumnCount: true });
    expectTypeOf(stream.readable).toEqualTypeOf<ReadableStream<Partial<Record<'id', string>>>>();
  });
});

function utf16le(text: string): Uint8Array {
  const bytes = new Uint8Array(text.length * 2);
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    bytes[i * 2] = code & 0xff;
    bytes[i * 2 + 1] = code >> 8;
  }
  return bytes;
}
