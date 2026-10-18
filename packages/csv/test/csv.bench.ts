import { Readable } from 'node:stream'
import * as FastCsvFormat from '@fast-csv/format'
import * as FastCsvParse from '@fast-csv/parse'
import { fromIterable, toArray } from '@portable/streams'
import { parse as csvParseStream } from 'csv-parse'
import { parse as csvParse } from 'csv-parse/sync'
import { stringify as csvStringifyStream } from 'csv-stringify'
import { stringify as csvStringify } from 'csv-stringify/sync'
import Papa from 'papaparse'
import { expect, test } from 'vite-plus/test'
import * as Csv from '@portable/csv'
import { chunked, encodeUtf8 } from './utils.js'

function random(seed: number): () => number {
  let state = seed
  return () => {
    state = (state * 1103515245 + 12345) % 2 ** 31
    return state / 2 ** 31
  }
}

function orders(count: number): string[][] {
  const next = random(count)
  const names = ['Ada Lovelace', 'Grace Hopper', 'Smith, J.', 'Ken "K" Thompson', 'Zoë Ünal']
  const notes = ['', 'leave at door', 'call first, then knock', 'fragile\nhandle with care', 'n/a']
  return Array.from({ length: count }, (_, i) => [
    String(100000 + i),
    names[Math.floor(next() * names.length)]!,
    `user${i}@example.com`,
    (next() * 1000).toFixed(2),
    String(Math.floor(next() * 10)),
    notes[Math.floor(next() * notes.length)]!,
    `2026-${String(1 + Math.floor(next() * 12)).padStart(2, '0')}-15T10:00:00Z`,
    next() < 0.5 ? 'true' : 'false',
  ])
}

const rows = orders(5_000)
const text = Csv.encode(rows)
const chunks = chunked(encodeUtf8(text), 65536)

function drain(readable: NodeJS.ReadableStream): Promise<number> {
  let count = 0
  return new Promise((resolve, reject) => {
    readable.on('data', () => count++)
    readable.on('end', () => resolve(count))
    readable.on('error', reject)
  })
}

test('decodes 5,000 rows from a string within 25% of csv-parse, papaparse and fast-csv', async ({
  bench,
}) => {
  const result = await bench.compare(
    bench('@portable/csv', () => {
      Csv.decode(text)
    }),
    bench('csv-parse', () => {
      csvParse(text)
    }),
    bench('papaparse', () => {
      Papa.parse(text)
    }),
    bench('fast-csv', async () => {
      await drain(FastCsvParse.parseString(text))
    }),
  )
  for (const name of ['csv-parse', 'papaparse', 'fast-csv'] as const)
    expect(result.get(name)).not.toBeFasterThan(result.get('@portable/csv'), { delta: 0.25 })
})

test('decodes a 500 kB stream within 25% of csv-parse, papaparse and fast-csv', async ({
  bench,
}) => {
  const result = await bench.compare(
    bench('@portable/csv', async () => {
      await toArray(fromIterable(chunks).pipeThrough(new Csv.DecoderStream()))
    }),
    bench('csv-parse', async () => {
      await drain(Readable.from(chunks).pipe(csvParseStream()))
    }),
    bench('papaparse', async () => {
      await drain(Readable.from(chunks).pipe(Papa.parse(Papa.NODE_STREAM_INPUT)))
    }),
    bench('fast-csv', async () => {
      await drain(Readable.from(chunks).pipe(FastCsvParse.parse()))
    }),
  )
  for (const name of ['csv-parse', 'papaparse', 'fast-csv'] as const)
    expect(result.get(name)).not.toBeFasterThan(result.get('@portable/csv'), { delta: 0.25 })
})

test('encodes 5,000 rows to a string within 25% of csv-stringify, papaparse and fast-csv', async ({
  bench,
}) => {
  const result = await bench.compare(
    bench('@portable/csv', () => {
      Csv.encode(rows)
    }),
    bench('csv-stringify', () => {
      csvStringify(rows)
    }),
    bench('papaparse', () => {
      Papa.unparse(rows)
    }),
    bench('fast-csv', async () => {
      await FastCsvFormat.writeToString(rows)
    }),
  )
  for (const name of ['csv-stringify', 'papaparse', 'fast-csv'] as const)
    expect(result.get(name)).not.toBeFasterThan(result.get('@portable/csv'), { delta: 0.25 })
})

test('encodes a stream of 5,000 rows within 25% of csv-stringify and fast-csv', async ({
  bench,
}) => {
  const result = await bench.compare(
    bench('@portable/csv', async () => {
      await toArray(fromIterable(rows).pipeThrough(new Csv.EncoderStream()))
    }),
    bench('csv-stringify', async () => {
      await drain(Readable.from(rows).pipe(csvStringifyStream()))
    }),
    bench('fast-csv', async () => {
      await drain(Readable.from(rows).pipe(FastCsvFormat.format()))
    }),
  )
  for (const name of ['csv-stringify', 'fast-csv'] as const)
    expect(result.get(name)).not.toBeFasterThan(result.get('@portable/csv'), { delta: 0.25 })
})
