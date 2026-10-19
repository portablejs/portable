import { describe, expect, test } from 'vite-plus/test'
import * as Csv from '@portable/csv'
import { bom, decodeAll, decodeError, decodeStream } from './utils.js'

const record = String.fromCharCode(30)

type Case = readonly [name: string, input: string, expected: unknown, options?: Csv.decode.Options]

const coreParser: readonly Case[] = [
  ['One row', 'A,b,c', [['A', 'b', 'c']]],
  [
    'Two rows',
    'A,b,c\nd,E,f',
    [
      ['A', 'b', 'c'],
      ['d', 'E', 'f'],
    ],
  ],
  [
    'Three rows',
    'A,b,c\nd,E,f\nG,h,i',
    [
      ['A', 'b', 'c'],
      ['d', 'E', 'f'],
      ['G', 'h', 'i'],
    ],
  ],
  ['Whitespace at edges of unquoted field', 'a,\tb ,c', [['a', '\tb ', 'c']]],
  ['Quoted field', 'A,"B",C', [['A', 'B', 'C']]],
  ['Quoted field with extra whitespace on edges', 'A," B  ",C', [['A', ' B  ', 'C']]],
  ['Quoted field with delimiter', 'A,"B,B",C', [['A', 'B,B', 'C']]],
  ['Quoted field with line break', 'A,"B\nB",C', [['A', 'B\nB', 'C']]],
  ['Quoted fields with line breaks', 'A,"B\nB","C\nC\nC"', [['A', 'B\nB', 'C\nC\nC']]],
  [
    'Quoted fields at end of row with delimiter and line break',
    'a,b,"c,c\nc"\nd,e,f',
    [
      ['a', 'b', 'c,c\nc'],
      ['d', 'e', 'f'],
    ],
  ],
  ['Quoted field with escaped quotes', 'A,"B""B""B",C', [['A', 'B"B"B', 'C']]],
  ['Quoted field with escaped quotes at boundaries', 'A,"""B""",C', [['A', '"B"', 'C']]],
  ['Unquoted field with quotes at end of field', 'A,B",C', [['A', 'B"', 'C']]],
  ['Quoted field with quotes around delimiter', 'A,""",""",C', [['A', '","', 'C']]],
  ['Quoted field with quotes on right side of delimiter', 'A,",""",C', [['A', ',"', 'C']]],
  ['Quoted field with quotes on left side of delimiter', 'A,""",",C', [['A', '",', 'C']]],
  [
    'Quoted field with 5 quotes in a row and a delimiter in there, too',
    '"1","cnonce="""",nc=""""","2"',
    [['1', 'cnonce="",nc=""', '2']],
  ],
  ['Quoted field with whitespace around quotes', 'A, "B" ,C', [['A', ' "B" ', 'C']]],
  ['Misplaced quotes in data, not as opening quotes', 'A,B "B",C', [['A', 'B "B"', 'C']]],
  [
    'Quoted field has valid trailing quote via delimiter',
    'a,"b",c\nd,e,f',
    [
      ['a', 'b', 'c'],
      ['d', 'e', 'f'],
    ],
  ],
  [
    'Quoted field has valid trailing quote via \\n',
    'a,b,"c"\nd,e,f',
    [
      ['a', 'b', 'c'],
      ['d', 'e', 'f'],
    ],
  ],
  [
    'Quoted field has valid trailing quote via EOF',
    'a,b,c\nd,e,"f"',
    [
      ['a', 'b', 'c'],
      ['d', 'e', 'f'],
    ],
  ],
  [
    'Quoted field contains delimiters and \\n with valid trailing quote',
    'a,"b,c\nd,e,f"',
    [['a', 'b,c\nd,e,f']],
  ],
  [
    'Line starts with quoted field',
    'a,b,c\n"d",e,f',
    [
      ['a', 'b', 'c'],
      ['d', 'e', 'f'],
    ],
  ],
  [
    'Line starts with unquoted empty field',
    ',b,c\n"d",e,f',
    [
      ['', 'b', 'c'],
      ['d', 'e', 'f'],
    ],
  ],
  [
    'Line ends with quoted field',
    'a,b,c\nd,e,f\n"g","h","i"\n"j","k","l"',
    [
      ['a', 'b', 'c'],
      ['d', 'e', 'f'],
      ['g', 'h', 'i'],
      ['j', 'k', 'l'],
    ],
  ],
  [
    'Line ends with quoted field, first field of next line is empty, \\n',
    'a,b,c\n,e,f\n,"h","i"\n,"k","l"',
    [
      ['a', 'b', 'c'],
      ['', 'e', 'f'],
      ['', 'h', 'i'],
      ['', 'k', 'l'],
    ],
  ],
  [
    'Quoted field at end of row (but not at EOF) has quotes',
    'a,b,"c""c"""\nd,e,f',
    [
      ['a', 'b', 'c"c"'],
      ['d', 'e', 'f'],
    ],
  ],
  [
    'Empty quoted field at EOF is empty',
    'a,b,""\na,b,""',
    [
      ['a', 'b', ''],
      ['a', 'b', ''],
    ],
  ],
  [
    'Multiple consecutive empty fields',
    'a,b,,,c,d\n,,e,,,f',
    [
      ['a', 'b', '', '', 'c', 'd'],
      ['', '', 'e', '', '', 'f'],
    ],
  ],
  ['Empty input string', '', []],
  ['Input is just the delimiter (2 empty fields)', ',', [['', '']]],
  [
    'Input is just empty fields',
    ',,\n,,,',
    [
      ['', '', ''],
      ['', '', '', ''],
    ],
    { relaxColumnCount: true },
  ],
  ['Input is just a string (a single field)', 'Abc def', [['Abc def']]],
  [
    'Input with only a commented line, without comments enabled',
    '#commented line',
    [['#commented line']],
  ],
  ['Input without comments with line starting with whitespace', 'a\n b\nc', [['a'], [' b'], ['c']]],
  [
    'Multiple rows, one column (no delimiter found)',
    'a\nb\nc\nd\ne',
    [['a'], ['b'], ['c'], ['d'], ['e']],
  ],
  [
    'One column input with empty fields',
    'a\nb\n\n\nc\nd\ne\n',
    [['a'], ['b'], [''], [''], ['c'], ['d'], ['e']],
    { skipEmpty: false },
  ],
]

const parse: readonly Case[] = [
  [
    'Two rows, just \\r',
    'A,b,c\rd,E,f',
    [
      ['A', 'b', 'c'],
      ['d', 'E', 'f'],
    ],
  ],
  [
    'Two rows, \\r\\n',
    'A,b,c\r\nd,E,f',
    [
      ['A', 'b', 'c'],
      ['d', 'E', 'f'],
    ],
  ],
  ['Quoted field with \\r\\n', 'A,"B\r\nB",C', [['A', 'B\r\nB', 'C']]],
  ['Quoted field with \\r', 'A,"B\rB",C', [['A', 'B\rB', 'C']]],
  ['Quoted field with \\n', 'A,"B\nB",C', [['A', 'B\nB', 'C']]],
  [
    'Quoted fields with spaces between closing quote and next delimiter',
    'A,"B" ,C,D\r\nE,F,"G"  ,H',
    [
      ['A', 'B', 'C', 'D'],
      ['E', 'F', 'G', 'H'],
    ],
  ],
  [
    'Quoted fields with spaces between closing quote and next new line',
    'A,B,C,"D" \r\nE,F,G,"H"  \r\nQ,W,E,R',
    [
      ['A', 'B', 'C', 'D'],
      ['E', 'F', 'G', 'H'],
      ['Q', 'W', 'E', 'R'],
    ],
  ],
  [
    'Quoted fields with spaces after closing quote',
    'A,"B" ,C,"D" \r\nE,F,"G"  ,"H"  \r\nQ,W,"E" ,R',
    [
      ['A', 'B', 'C', 'D'],
      ['E', 'F', 'G', 'H'],
      ['Q', 'W', 'E', 'R'],
    ],
  ],
  [
    'Misplaced quotes in data twice, not as opening quotes',
    'A,B",C\nD,E",F',
    [
      ['A', 'B"', 'C'],
      ['D', 'E"', 'F'],
    ],
  ],
  [
    'Mixed slash n and slash r should choose first as precident',
    'a,b,c\nd,e,f\rg,h,i\n',
    [
      ['a', 'b', 'c'],
      ['d', 'e', 'f'],
      ['g', 'h', 'i'],
    ],
  ],
  [
    'Header row with one row of data',
    'A,B,C\r\na,b,c',
    [{ A: 'a', B: 'b', C: 'c' }],
    { header: true },
  ],
  ['Header row only', 'A,B,C', [], { header: true }],
  [
    'Row with enough fields but blank field in the begining',
    'A,B,C\r\n,b1,c1\r\na2,b2,c2',
    [
      ['A', 'B', 'C'],
      ['', 'b1', 'c1'],
      ['a2', 'b2', 'c2'],
    ],
  ],
  [
    'Row with enough fields but blank field in the begining using headers',
    'A,B,C\r\n,b1,c1\r\n,b2,c2',
    [
      { A: '', B: 'b1', C: 'c1' },
      { A: '', B: 'b2', C: 'c2' },
    ],
    { header: true },
  ],
  [
    'Row with enough fields but blank field at end',
    'A,B,C\r\na,b,',
    [{ A: 'a', B: 'b', C: '' }],
    { header: true },
  ],
  [
    'Line ends with quoted field, first field of next line is empty using headers',
    'a,b,"c"\r\nd,e,"f"\r\n,"h","i"\r\n,"k","l"',
    [
      { a: 'd', b: 'e', c: 'f' },
      { a: '', b: 'h', c: 'i' },
      { a: '', b: 'k', c: 'l' },
    ],
    { header: true },
  ],
  [
    'Tab delimiter',
    'a\tb\tc\r\nd\te\tf',
    [
      ['a', 'b', 'c'],
      ['d', 'e', 'f'],
    ],
    { delimiter: '\t' },
  ],
  [
    'Pipe delimiter',
    'a|b|c\r\nd|e|f',
    [
      ['a', 'b', 'c'],
      ['d', 'e', 'f'],
    ],
    { delimiter: '|' },
  ],
  [
    'ASCII 30 delimiter',
    `a${record}b${record}c\r\nd${record}e${record}f`,
    [
      ['a', 'b', 'c'],
      ['d', 'e', 'f'],
    ],
    { delimiter: record },
  ],
  [
    "Dynamic typing doesn't convert other types",
    'A,B,C\r\nundefined,null,[\r\nvar,float,if',
    [
      ['A', 'B', 'C'],
      ['undefined', 'null', '['],
      ['var', 'float', 'if'],
    ],
  ],
  [
    'Blank line at beginning',
    '\r\na,b,c\r\nd,e,f',
    [
      ['a', 'b', 'c'],
      ['d', 'e', 'f'],
    ],
  ],
  [
    'Blank line in middle',
    'a,b,c\r\n\r\nd,e,f',
    [
      ['a', 'b', 'c'],
      ['d', 'e', 'f'],
    ],
  ],
  [
    'Blank lines at end',
    'a,b,c\nd,e,f\n\n',
    [
      ['a', 'b', 'c'],
      ['d', 'e', 'f'],
    ],
  ],
  [
    'Blank line in middle with whitespace',
    'a,b,c\r\n \r\nd,e,f',
    [['a', 'b', 'c'], [' '], ['d', 'e', 'f']],
    { relaxColumnCount: true },
  ],
  [
    'First field of a line is empty',
    'a,b,c\r\n,e,f',
    [
      ['a', 'b', 'c'],
      ['', 'e', 'f'],
    ],
  ],
  [
    'Last field of a line is empty',
    'a,b,\r\nd,e,f',
    [
      ['a', 'b', ''],
      ['d', 'e', 'f'],
    ],
  ],
  [
    'Other fields are empty',
    'a,,c\r\n,,',
    [
      ['a', '', 'c'],
      ['', '', ''],
    ],
  ],
  [
    'Empty lines',
    '\na,b,c\n\nd,e,f\n\n',
    [[''], ['a', 'b', 'c'], [''], ['d', 'e', 'f'], ['']],
    { skipEmpty: false, relaxColumnCount: true },
  ],
  [
    'Skip empty lines',
    'a,b,c\n\nd,e,f',
    [
      ['a', 'b', 'c'],
      ['d', 'e', 'f'],
    ],
  ],
  [
    'Skip empty lines, with newline at end of input',
    'a,b,c\r\n\r\nd,e,f\r\n',
    [
      ['a', 'b', 'c'],
      ['d', 'e', 'f'],
    ],
  ],
  [
    'Skip empty lines, with first line only whitespace',
    ' \na,b,c',
    [[' '], ['a', 'b', 'c']],
    { relaxColumnCount: true },
  ],
  [
    'Skip empty lines while detecting delimiter',
    'a,b\n1,2\n3,4\n',
    [
      { a: '1', b: '2' },
      { a: '3', b: '4' },
    ],
    { header: true },
  ],
  [
    'Pipe delimiter is guessed correctly when first field are enclosed in quotes and contain delimiter characters',
    '"Field1,1,1";Field2;"Field3";Field4;Field5;Field6',
    [['Field1,1,1', 'Field2', 'Field3', 'Field4', 'Field5', 'Field6']],
    { delimiter: ';' },
  ],
  [
    'Pipe delimiter is guessed correctly when some fields are enclosed in quotes and contain delimiter characters and escaoped quotes',
    'Field1;Field2;"Field,3,""3,3";Field4;Field5;"Field6,6"',
    [['Field1', 'Field2', 'Field,3,"3,3', 'Field4', 'Field5', 'Field6,6']],
    { delimiter: ';' },
  ],
  [
    'Delimiter is guessed correctly when a quoted field holds newlines and other delimiter characters',
    'id;title;data\r\n1;row one;"{\n  ""a"": 1,\n  ""b"": 2\n}"\r\n2;row two;"{\n  ""a"": 1\n}"',
    [
      ['id', 'title', 'data'],
      ['1', 'row one', '{\n  "a": 1,\n  "b": 2\n}'],
      ['2', 'row two', '{\n  "a": 1\n}'],
    ],
    { delimiter: ';' },
  ],
  ['Single quote as quote character', "a,b,'c,d'", [['a', 'b', 'c,d']], { quote: "'" }],
  [
    'Carriage return in header inside quotes, with line feed endings',
    '"a\r\na","b"\n"c","d"\n"e","f"',
    [
      ['a\r\na', 'b'],
      ['c', 'd'],
      ['e', 'f'],
    ],
  ],
  [
    'Line feed in header inside quotes, with carriage return + line feed endings',
    '"a\na","b"\r\n"c","d"\r\n"e","f"',
    [
      ['a\na', 'b'],
      ['c', 'd'],
      ['e', 'f'],
    ],
  ],
  [
    'Using \\r\\n endings uses \\r\\n linebreak',
    'a,b\r\nc,d\r\ne,f\r\ng,h\r\ni,j',
    [
      ['a', 'b'],
      ['c', 'd'],
      ['e', 'f'],
      ['g', 'h'],
      ['i', 'j'],
    ],
  ],
  [
    'Using \\n endings uses \\n linebreak',
    'a,b\nc,d\ne,f\ng,h\ni,j',
    [
      ['a', 'b'],
      ['c', 'd'],
      ['e', 'f'],
      ['g', 'h'],
      ['i', 'j'],
    ],
  ],
  [
    'Using \\r\\n endings with \\r\\n in header field uses \\r\\n linebreak',
    '"a\r\na",b\r\nc,d\r\ne,f',
    [
      ['a\r\na', 'b'],
      ['c', 'd'],
      ['e', 'f'],
    ],
  ],
  [
    'Using \\r\\n endings with \\n in header field uses \\r\\n linebreak',
    '"a\na",b\r\nc,d\r\ne,f',
    [
      ['a\na', 'b'],
      ['c', 'd'],
      ['e', 'f'],
    ],
  ],
  [
    'Using \\r\\n endings with \\n in header field with skip empty lines uses \\r\\n linebreak',
    '"a\na",b\r\nc,d\r\ne,f\r\n',
    [
      ['a\na', 'b'],
      ['c', 'd'],
      ['e', 'f'],
    ],
  ],
  [
    'Using \\n endings with \\r\\n in header field uses \\n linebreak',
    '"a\r\na",b\nc,d\ne,f',
    [
      ['a\r\na', 'b'],
      ['c', 'd'],
      ['e', 'f'],
    ],
  ],
  [
    'Using reserved regex character . as quote character',
    '.a\na.,b\r\nc,d',
    [
      ['a\na', 'b'],
      ['c', 'd'],
    ],
    { quote: '.' },
  ],
  [
    'Using reserved regex character | as quote character',
    '|a\na|,b\r\nc,d',
    [
      ['a\na', 'b'],
      ['c', 'd'],
    ],
    { quote: '|' },
  ],
  [
    'UTF-8 BOM encoded input is stripped from invisible BOM character',
    `${bom}A,B\nX,Y`,
    [
      ['A', 'B'],
      ['X', 'Y'],
    ],
  ],
  [
    'UTF-8 BOM encoded input with header produces column key stripped from invisible BOM character',
    `${bom}A,B\nX,Y`,
    [{ A: 'X', B: 'Y' }],
    { header: true },
  ],
  [
    "Parsing with skipEmptyLines set to 'greedy' with quotes and delimiters as content",
    'a,b\n\nc,d\n" , ",","\n""" """,""""""\n\n\n',
    [
      ['a', 'b'],
      ['c', 'd'],
      [' , ', ','],
      ['" "', '""'],
    ],
  ],
  [
    'Quoted fields with spaces between closing quote and next delimiter and contains delimiter',
    'A,",B" ,C,D\nE,F,G,H',
    [
      ['A', ',B', 'C', 'D'],
      ['E', 'F', 'G', 'H'],
    ],
  ],
  [
    'Quoted fields with spaces between closing quote and newline and contains newline',
    'a,b,"c\n" \nd,e,f',
    [
      ['a', 'b', 'c\n'],
      ['d', 'e', 'f'],
    ],
  ],
]

describe('papaparse', () => {
  describe('Core Parser Tests', () => {
    for (const [name, input, expected, options] of coreParser)
      test(`${name}`, async () => {
        expect(await decodeAll(input, options)).toEqual(expected)
      })

    test('Quoted field has no closing quote', async () => {
      expect(await decodeError('a,"b,c\nd,e,f')).toBeInstanceOf(Csv.TruncatedError)
    })

    test('Quoted field has invalid trailing quote after delimiter with a valid closer', async () => {
      expect(await decodeError('"a,"b,c"\nd,e,f')).toBeInstanceOf(Csv.InvalidInputError)
    })

    test('Quoted field has invalid trailing quote after delimiter', async () => {
      expect(await decodeError('a,"b,"c\nd,e,f')).toBeInstanceOf(Csv.InvalidInputError)
    })

    test('Quoted field has invalid trailing quote before delimiter', async () => {
      expect(await decodeError('a,"b"c,d\ne,f,g')).toBeInstanceOf(Csv.InvalidInputError)
    })

    test('Quoted field has invalid trailing quote after new line', async () => {
      expect(await decodeError('a,"b,c\nd"e,f,g')).toBeInstanceOf(Csv.InvalidInputError)
    })

    test('Duplicated header names', async () => {
      for (const text of ['A,A,A,A\n1,2,3,4', 'c,c,c,c_1\n1,2,3,4', '__proto__,__proto__\n1,2'])
        expect(await decodeError(text, { header: true })).toBeInstanceOf(Csv.InvalidInputError)
    })
  })

  describe('Parse Tests', () => {
    for (const [name, input, expected, options] of parse)
      test(`${name}`, async () => {
        expect(await decodeAll(input, options)).toEqual(expected)
      })

    test('Row with too few fields', async () => {
      expect(await decodeError('A,B,C\r\na,b', { header: true })).toBeInstanceOf(
        Csv.InvalidInputError,
      )
      expect(await decodeAll('A,B,C\r\na,b', { header: true, relaxColumnCount: true })).toEqual([
        { A: 'a', B: 'b' },
      ])
    })

    test('Row with too many fields', async () => {
      const text = 'A,B,C\r\na,b,c,d,e\r\nf,g,h'
      expect(await decodeError(text, { header: true })).toBeInstanceOf(Csv.InvalidInputError)
      expect(await decodeAll(text, { header: true, relaxColumnCount: true })).toEqual([
        { A: 'a', B: 'b', C: 'c' },
        { A: 'f', B: 'g', C: 'h' },
      ])
    })

    test('Bad delimiter (\\n)', () => {
      expect(() => Csv.decode('a,b,c', { delimiter: '\n' })).toThrow(RangeError)
    })

    test('Multi-character delimiter', () => {
      expect(() => Csv.decode('a, b, c', { delimiter: ', ' })).toThrow(RangeError)
    })
  })

  describe('Parse Async Tests', () => {
    test('Simple worker', async () => {
      expect(await decodeStream(['A,B,C\nX,Y,Z'])).toEqual([
        ['A', 'B', 'C'],
        ['X', 'Y', 'Z'],
      ])
    })
  })

  describe('Custom Tests', () => {
    test('Duplicate values in a data row are not renamed after resume (Regression Test for Issue #998)', async () => {
      const text = 'c1,c2,c3\n"foo, bar","foo, bar",v1\n"foo, bar","foo, bar",v2'
      expect(await decodeAll(text, { header: true })).toEqual([
        { c1: 'foo, bar', c2: 'foo, bar', c3: 'v1' },
        { c1: 'foo, bar', c2: 'foo, bar', c3: 'v2' },
      ])
    })

    test('Empty trailing fields stay empty after resume (Regression Test for Issue #985)', async () => {
      expect(await decodeAll('a,b,c,d\n1,x,,\n2,y,,', { header: true })).toEqual([
        { a: '1', b: 'x', c: '', d: '' },
        { a: '2', b: 'y', c: '', d: '' },
      ])
    })

    test('Data is correctly parsed with steps when there are empty values', async () => {
      expect(await decodeAll('A,B,C,D\na,b,c,d\na,,,', { header: true })).toEqual([
        { A: 'a', B: 'b', C: 'c', D: 'd' },
        { A: 'a', B: '', C: '', D: '' },
      ])
    })

    test('Quoted line breaks near chunk boundaries are handled', async () => {
      expect(await decodeStream(['A,B,C\nX,"Y\n1\n2', '\n3",Z'])).toEqual([
        ['A', 'B', 'C'],
        ['X', 'Y\n1\n2\n3', 'Z'],
      ])
    })

    test('Step functions can abort parsing', async () => {
      const reader = new Csv.DecoderStream()
      const writer = reader.writable.getWriter()
      void writer.write('A,b,c\nd,E,f\nG,h,i')
      const rows = reader.readable.getReader()
      expect((await rows.read()).value).toEqual(['A', 'b', 'c'])
      await rows.cancel()
    })
  })
})
