import { Readable } from 'node:stream'
import { parse as parseStream } from 'csv-parse'
import { parse as parseSync } from 'csv-parse/sync'
import { stringify } from 'csv-stringify/sync'
import Papa from 'papaparse'
import { describe, expect, test } from 'vite-plus/test'
import * as Csv from '@portable/csv'
import { decodeStream, encodeUtf8, fixture, fixtures, randomChunks } from './utils.js'

function random(seed: number): () => number {
  let state = seed
  return () => {
    state = (state * 1103515245 + 12345) % 2 ** 31
    return state / 2 ** 31
  }
}

const pieces = [
  '',
  'a',
  'plain text',
  ',',
  '"',
  '""',
  '\r\n',
  '\n',
  '\r',
  ' ',
  'ü',
  '🚀',
  '\t',
  "'",
  '=1',
]

/**
 * papaparse quotes a field that starts or ends with whitespace, so its comparisons leave out
 * spaces and tabs.
 */
const papaPieces = pieces.filter((piece) => piece.trim() !== '' || piece === '')

function randomRows(seed: number, count: number, width: number, from = pieces): string[][] {
  const next = random(seed)
  return Array.from({ length: count }, () =>
    Array.from({ length: width }, () => {
      let field = ''
      for (let n = Math.floor(next() * 4); n > 0; n--)
        field += from[Math.floor(next() * from.length)]
      return field
    }),
  )
}

async function viaCsvParse(chunks: readonly Uint8Array[], delimiter = ','): Promise<string[][]> {
  const rows: string[][] = []
  const parser = Readable.from(chunks).pipe(
    parseStream({ bom: true, delimiter, relax_quotes: true, skip_empty_lines: true }),
  )
  for await (const row of parser) rows.push(row as string[])
  return rows
}

const inputs: Record<string, string> = {
  'quoted CRLF rows': Papa.unparse(randomRows(1, 200, 5)),
  'quoted LF rows': stringify(randomRows(2, 200, 3)),
  'one column': stringify(randomRows(3, 100, 1).filter(([field]) => field !== '')),
  'unquoted rows': 'a,b,c\nd,e,f\n,,\n1,2,3',
  'quotes inside unquoted fields': 'a,b "c" d,e"\nf,g,h',
  'trailing delimiter, no final line break': '"a","b",\n1,2,',
  'empty lines': '\n\na,b\n\n\nc,d\n\n',
  'byte order mark': `${String.fromCharCode(0xfeff)}a,b\n1,2\n`,
}

describe('matches csv-parse', () => {
  for (const [name, text] of Object.entries(inputs)) {
    test(`${name}, decode`, () => {
      const options = { bom: true, relax_quotes: true, skip_empty_lines: true }
      expect(Csv.decode(text)).toEqual(parseSync(text, options))
    })

    for (const seed of [1, 2, 3])
      test(`${name}, random chunking ${seed}`, async () => {
        const chunks = randomChunks(encodeUtf8(text), seed, 32)
        expect(await decodeStream(chunks)).toEqual(await viaCsvParse(chunks))
      })
  }

  test('header', () => {
    const text = stringify([['a', 'b', 'c'], ...randomRows(6, 100, 3)])
    expect(Csv.decode(text, { header: true })).toEqual(parseSync(text, { columns: true }))
  })

  test('tab delimiter', async () => {
    const text = stringify(randomRows(4, 100, 4), { delimiter: '\t' })
    const chunks = randomChunks(encodeUtf8(text), 4, 32)
    expect(await decodeStream(chunks, { delimiter: '\t' })).toEqual(await viaCsvParse(chunks, '\t'))
  })

  for (const path of fixtures.filter((path) => path.endsWith('.csv')))
    test(`csv-spectrum ${path}`, async () => {
      const text = new TextDecoder().decode(await fixture(path))
      const options = { columns: true, relax_quotes: true }
      expect(Csv.decode(text, { header: true })).toEqual(parseSync(text, options))
    })
})

describe('matches papaparse', () => {
  for (const [name, text] of Object.entries(inputs)) {
    test(`${name}`, () => {
      expect(Csv.decode(text)).toEqual(Papa.parse(text, { skipEmptyLines: true }).data)
    })
  }

  test('header', () => {
    const text = stringify([['a', 'b', 'c'], ...randomRows(7, 100, 3)])
    expect(Csv.decode(text, { header: true })).toEqual(
      Papa.parse(text, { header: true, skipEmptyLines: true }).data,
    )
  })
})

describe('encodes like csv-stringify and papaparse', () => {
  for (const seed of [1, 2, 3]) {
    test(`random rows ${seed}, csv-stringify`, () => {
      const rows = randomRows(seed, 100, 4)
      expect(Csv.encode(rows, { newline: '\n' })).toBe(stringify(rows))
      expect(Csv.encode(rows, { newline: '\n', delimiter: ';' })).toBe(
        stringify(rows, { delimiter: ';' }),
      )
    })

    test(`random rows ${seed}, papaparse`, () => {
      const rows = randomRows(seed, 100, 4, papaPieces)
      expect(Csv.encode(rows)).toBe(`${Papa.unparse(rows)}\r\n`)
    })
  }

  test('objects with a header row', () => {
    const rows = randomRows(5, 50, 3, papaPieces).map(([a, b, c]) => ({ a, b, c }))
    expect(Csv.encode(rows, { header: true, newline: '\n' })).toBe(
      stringify(rows, { header: true }),
    )
    expect(Csv.encode(rows, { header: true })).toBe(`${Papa.unparse(rows)}\r\n`)
  })
})
