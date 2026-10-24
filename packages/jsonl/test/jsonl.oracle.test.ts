import { Readable } from 'node:stream'
import ndjson from 'ndjson'
import { describe, expect, test } from 'vite-plus/test'
import { decode, encode, encodeUtf8, randomChunks, rows } from './utils.js'

function collect(stream: NodeJS.ReadableStream): Promise<unknown[]> {
  const values = new Array<unknown>()
  return new Promise((resolve, reject) => {
    stream.on('data', (value: unknown) => values.push(value))
    stream.on('end', () => resolve(values))
    stream.on('error', reject)
  })
}

function viaNdjson(chunks: readonly Uint8Array[]): Promise<unknown[]> {
  return collect(Readable.from(chunks).pipe(ndjson.parse()))
}

async function stringifyViaNdjson(values: readonly unknown[]): Promise<string> {
  const stringify = ndjson.stringify()
  const output = collect(stringify)
  for (const value of values) stringify.write(value)
  stringify.end()
  return (await output).join('')
}

const lines =
  rows(500)
    .map((row) => JSON.stringify(row))
    .join('\n') + '\n'

describe('DecoderStream matches ndjson', () => {
  for (const [name, text] of [
    ['rows', lines],
    ['rows with CRLF', lines.replaceAll('\n', '\r\n')],
    ['values of every type', '1\n"two"\n[3]\n{"four":4}\ntrue\n\n-5.5e3\n'],
    ['no trailing newline', '{"a":1}\n{"b":2}'],
  ]) {
    for (const seed of [1, 2, 3]) {
      test(`${name}, random chunking ${seed}`, async () => {
        const chunks = randomChunks(encodeUtf8(text!), seed)
        expect(await decode(chunks)).toEqual(await viaNdjson(chunks))
      })
    }
  }
})

describe.skipIf(process.platform === 'win32')('EncoderStream matches ndjson', () => {
  test('rows', async () => {
    const values = rows(200)
    expect(await encode(values)).toBe(await stringifyViaNdjson(values))
  })
})
