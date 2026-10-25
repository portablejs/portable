import { fromIterable, toArray } from '@portable/streams';
import { describe, expect, test } from 'vite-plus/test';
import * as Csv from '@portable/csv';
import { bom, decodeAll, encodeStream } from './utils.js';

async function encodeAll(rows: readonly Csv.encode.Row[], options?: Csv.encode.Options) {
  const text = Csv.encode(rows, options);
  expect(await encodeStream(rows, options)).toBe(text);
  return text;
}

const objects = [
  { Col1: 'a', Col2: 'b', Col3: 'c' },
  { Col1: 'd', Col2: 'e', Col3: 'f' },
];

describe('RFC 4180', () => {
  test('ends every row with CRLF', async () => {
    expect(
      await encodeAll([
        ['a', 'b'],
        ['c', 'd'],
      ]),
    ).toBe('a,b\r\nc,d\r\n');
  });

  test('quotes only fields that hold the delimiter, a quote, or a line break', async () => {
    expect(await encodeAll([['plain', 'a,b', 'say "hi"', 'cr\r', 'lf\n', ' space ']])).toBe(
      'plain,"a,b","say ""hi""","cr\r","lf\n", space \r\n',
    );
  });

  test('decodes what it encodes', async () => {
    const rows = [['', 'a,b', '"', '\r\n', 'ü🚀'], [''], ['x', '', '', '', '']];
    expect(await decodeAll(Csv.encode(rows), { relaxColumnCount: true })).toEqual(rows);
  });

  test('writes a row of one empty field as "" so it is not read as an empty line', async () => {
    expect(await encodeAll([['a'], [''], [null], ['b']])).toBe('a\r\n""\r\n""\r\nb\r\n');
  });

  test('writes nothing for no rows', async () => {
    expect(await encodeAll([])).toBe('');
  });
});

describe('csv-stringify', () => {
  test('encodes arrays', async () => {
    expect(
      await encodeAll([['20322051544', '1979.0', '8.8017226E7', 'ABC', '45', '2000-01-01']]),
    ).toBe('20322051544,1979.0,8.8017226E7,ABC,45,2000-01-01\r\n');
  });

  test('encodes objects with a header array', async () => {
    expect(
      await encodeAll(
        [
          { a: 1, b: 2 },
          { b: 4, a: 3, c: 5 },
        ],
        { header: ['a', 'b'] },
      ),
    ).toBe('a,b\r\n1,2\r\n3,4\r\n');
  });

  test('does not change its input', async () => {
    const row = ['a', 'b'];
    const object = { a: '1', b: '2' };
    await encodeAll([row, row]);
    await encodeAll([object], { header: true });
    expect(row).toEqual(['a', 'b']);
    expect(object).toEqual({ a: '1', b: '2' });
  });

  test('writes values with String() and null and undefined as empty fields', async () => {
    expect(await encodeAll([[1, 1.5, -0.5, true, false, 10n, null, undefined, 'x']])).toBe(
      '1,1.5,-0.5,true,false,10,,,x\r\n',
    );
  });

  test('writes a Date as ISO 8601', async () => {
    expect(await encodeAll([[new Date(Date.UTC(2018, 4, 4, 21, 8, 3, 269))]])).toBe(
      '2018-05-04T21:08:03.269Z\r\n',
    );
  });

  test('throws InvalidInputError for a value it cannot encode', () => {
    expect(() => Csv.encode([[{} as never]])).toThrow(Csv.InvalidInputError);
    expect(() => Csv.encode([[Symbol('x') as never]])).toThrow(Csv.InvalidInputError);
  });

  test('fails the stream for a value it cannot encode', async () => {
    const stream = fromIterable([[['nested']] as never]).pipeThrough(new Csv.EncoderStream());
    await expect(toArray(stream)).rejects.toThrow(Csv.InvalidInputError);
  });

  describe('bom', () => {
    test('starts the output with a byte order mark when set', async () => {
      expect(await encodeAll([['a']], { bom: true })).toBe(`${bom}a\r\n`);
      expect(await encodeAll([['a']], { bom: false })).toBe('a\r\n');
      expect(await encodeAll([['a']])).toBe('a\r\n');
    });
  });

  describe('delimiter', () => {
    test('separates fields with the delimiter', async () => {
      expect(
        await encodeAll(
          [
            ['a', 'b'],
            ['c', 'd'],
          ],
          { delimiter: ';' },
        ),
      ).toBe('a;b\r\nc;d\r\n');
      expect(await encodeAll([['a\tb', 'c']], { delimiter: '\t' })).toBe('"a\tb"\tc\r\n');
    });

    test('quotes a field that holds the delimiter', async () => {
      expect(await encodeAll([['a;b', 'a,b']], { delimiter: ';' })).toBe('"a;b";a,b\r\n');
    });

    test('rejects a delimiter that is empty, longer than one character, a line break, or the quote', () => {
      for (const delimiter of ['', '::', '\n', '"']) {
        expect(() => Csv.encode([], { delimiter })).toThrow(RangeError);
      }
    });
  });

  describe('quote', () => {
    test('quotes with a custom character and doubles it inside fields', async () => {
      expect(await encodeAll([['a,d', 'b', "it's"]], { quote: "'" })).toBe("'a,d',b,'it''s'\r\n");
      expect(await encodeAll([['a', 'x+y']], { quote: '+' })).toBe('a,+x++y+\r\n');
      expect(await encodeAll([['a', 'x.y,z']], { quote: '.' })).toBe('a,.x..y,z.\r\n');
    });

    test('writes quotes as text when quote is false', async () => {
      expect(await encodeAll([['say "hi"', 'b']], { quote: false })).toBe('say "hi",b\r\n');
    });

    test('throws InvalidInputError for a field that needs quoting when quote is false', () => {
      expect(() => Csv.encode([['a,b']], { quote: false })).toThrow(Csv.InvalidInputError);
      expect(() => Csv.encode([['a\nb']], { quote: false })).toThrow(Csv.InvalidInputError);
    });
  });

  describe('newline', () => {
    test("writes '\\n' line breaks", async () => {
      expect(
        await encodeAll(
          [
            ['a', 'b'],
            ['c', 'd'],
          ],
          { newline: '\n' },
        ),
      ).toBe('a,b\nc,d\n');
    });

    test("rejects line breaks other than '\\r\\n' and '\\n'", () => {
      expect(() => Csv.encode([], { newline: '\r' as never })).toThrow(RangeError);
    });
  });

  describe('header', () => {
    test('writes names from the first object when true', async () => {
      expect(await encodeAll(objects, { header: true })).toBe(
        'Col1,Col2,Col3\r\na,b,c\r\nd,e,f\r\n',
      );
    });

    test('writes the header array even with no rows', async () => {
      expect(await encodeAll([], { header: ['a', 'b', 'c'] })).toBe('a,b,c\r\n');
      expect(await encodeAll([], { header: true })).toBe('');
    });

    test('writes the header array before array rows', async () => {
      expect(await encodeAll([['1', '2']], { header: ['a', 'b'] })).toBe('a,b\r\n1,2\r\n');
    });

    test('quotes header names that need it', async () => {
      expect(await encodeAll([{ 'a,b': 1 }], { header: true })).toBe('"a,b"\r\n1\r\n');
    });

    test('throws TypeError when true with array rows', () => {
      expect(() => Csv.encode([['a']], { header: true })).toThrow(TypeError);
    });

    test('throws InvalidInputError for an object row after array rows', () => {
      expect(() => Csv.encode([{ a: 1 }, ['x']], { header: true })).not.toThrow();
      expect(() => Csv.encode([['x'], { a: 1 }])).toThrow(Csv.InvalidInputError);
    });
  });

  describe('escapeFormulas', () => {
    test('is off by default', async () => {
      expect(await encodeAll([['=1+1', '@x']])).toBe('=1+1,@x\r\n');
    });

    test('prefixes and quotes fields that start with =, +, -, @, tab or CR', async () => {
      expect(
        await encodeAll([['=a', '+a', '-a', '@a', '\ta', '\ra', 'a=b', "'=a"]], {
          escapeFormulas: true,
        }),
      ).toBe(`"'=a","'+a","'-a","'@a","'\ta","'\ra",a=b,'=a\r\n`);
    });
  });
});

describe('papaparse', () => {
  describe('Unparse Tests', () => {
    test('A simple row', async () => {
      expect(await encodeAll([['A', 'b', 'c']])).toBe('A,b,c\r\n');
    });

    test('Two rows', async () => {
      expect(
        await encodeAll([
          ['A', 'b', 'c'],
          ['d', 'E', 'f'],
        ]),
      ).toBe('A,b,c\r\nd,E,f\r\n');
    });

    test('Data with quotes', async () => {
      expect(
        await encodeAll([
          ['a', '"b"', 'c'],
          ['"d"', 'e', 'f'],
        ]),
      ).toBe('a,"""b""",c\r\n"""d""",e,f\r\n');
    });

    test('Data with newlines', async () => {
      expect(
        await encodeAll([
          ['a', 'b\nb', 'c'],
          ['d', 'e', 'f\r\nf'],
        ]),
      ).toBe('a,"b\nb",c\r\nd,e,"f\r\nf"\r\n');
    });

    test('Array of objects (header row)', async () => {
      expect(await encodeAll(objects, { header: true })).toBe(
        'Col1,Col2,Col3\r\na,b,c\r\nd,e,f\r\n',
      );
    });

    test('With header row, missing a field in a row', async () => {
      const rows = [
        { Col1: 'a', Col2: 'b', Col3: 'c' },
        { Col1: 'd', Col3: 'f' },
      ];
      expect(await encodeAll(rows, { header: true })).toBe('Col1,Col2,Col3\r\na,b,c\r\nd,,f\r\n');
    });

    test('With header row, with extra field in a row', async () => {
      const rows = [
        { Col1: 'a', Col2: 'b', Col3: 'c' },
        { Col1: 'd', Col2: 'e', Extra: 'g', Col3: 'f' },
      ];
      expect(await encodeAll(rows, { header: true })).toBe('Col1,Col2,Col3\r\na,b,c\r\nd,e,f\r\n');
    });

    test('Specifying column names and data separately', async () => {
      expect(
        await encodeAll(
          [
            ['a', 'b', 'c'],
            ['d', 'e', 'f'],
          ],
          { header: ['Col1', 'Col2', 'Col3'] },
        ),
      ).toBe('Col1,Col2,Col3\r\na,b,c\r\nd,e,f\r\n');
    });

    test('Custom delimiter (ASCII 30)', async () => {
      const record = String.fromCharCode(30);
      expect(
        await encodeAll(
          [
            ['a', 'b'],
            ['c', 'd'],
          ],
          { delimiter: record },
        ),
      ).toBe(`a${record}b\r\nc${record}d\r\n`);
    });

    test('Mismatched field counts in rows', async () => {
      expect(await encodeAll([['a', 'b', 'c'], ['d', 'e'], ['f']])).toBe('a,b,c\r\nd,e\r\nf\r\n');
    });

    test('JSON null is treated as empty value', async () => {
      expect(await encodeAll([{ Col1: 'a', Col2: null, Col3: 'c' }], { header: true })).toBe(
        'Col1,Col2,Col3\r\na,,c\r\n',
      );
    });

    test("Don't print header if header:false option specified", async () => {
      expect(await encodeAll(objects, { header: false })).toBe('a,b,c\r\nd,e,f\r\n');
    });

    test('Invalid Date objects throw InvalidInputError', () => {
      expect(() => Csv.encode([[new Date(Number.NaN)]])).toThrow(Csv.InvalidInputError);
    });

    test('Returns empty rows when empty rows are passed', async () => {
      expect(await encodeAll([[null, ' '], [], ['1', '2']])).toBe(', \r\n\r\n1,2\r\n');
    });

    test('Column option used to manually specify keys', async () => {
      const rows = [{ a: 1, b: '2' }, {}, { a: 3, d: 'd', c: 4 }];
      expect(await encodeAll(rows, { header: ['a', 'b', 'c'] })).toBe(
        'a,b,c\r\n1,2,\r\n,,\r\n3,,4\r\n',
      );
    });

    test('Escape formulae', async () => {
      const rows = [
        { Col1: '=danger', Col2: '@danger', Col3: 'safe' },
        { Col1: 'safe=safe', Col2: '+danger', Col3: '-danger, danger' },
        { Col1: "'+safe", Col2: "'@safe", Col3: 'safe, safe' },
      ];
      expect(await encodeAll(rows, { header: true, escapeFormulas: true })).toBe(
        [
          'Col1,Col2,Col3',
          `"'=danger","'@danger",safe`,
          `safe=safe,"'+danger","'-danger, danger"`,
          `'+safe,'@safe,"safe, safe"`,
          '',
        ].join('\r\n'),
      );
    });

    test('Escape formulae with tab and carriage-return', async () => {
      const rows = [{ Col1: '\tdanger', Col2: '\rdanger,', Col3: 'safe\t\r' }];
      expect(await encodeAll(rows, { header: true, escapeFormulas: true })).toBe(
        `Col1,Col2,Col3\r\n"'\tdanger","'\rdanger,","safe\t\r"\r\n`,
      );
    });
  });
});

describe('EncoderStream', () => {
  test('encodes rows as UTF-8 bytes', async () => {
    const bytes = await toArray(fromIterable([['a', 'é']]).pipeThrough(new Csv.EncoderStream()));
    expect(new TextDecoder().decode(bytes[0])).toBe('a,é\r\n');
  });

  test('emits one chunk per row, with the header in the first', async () => {
    const chunks = await toArray(
      fromIterable(objects).pipeThrough(new Csv.EncoderStream({ header: true })),
    );
    expect(chunks.map((chunk) => new TextDecoder().decode(chunk))).toEqual([
      'Col1,Col2,Col3\r\na,b,c\r\n',
      'd,e,f\r\n',
    ]);
  });
});
