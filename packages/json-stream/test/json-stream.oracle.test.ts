import { Readable } from 'node:stream'
import { JsonStreamStringify } from 'json-stream-stringify'
import JSONStream from 'JSONStream'
import { describe, expect, test } from 'vite-plus/test'
import allNpm from './fixtures/all_npm.json?raw'
import depth from './fixtures/depth.json?raw'
import headerFooter from './fixtures/header_footer.json?raw'
import { encodeText, encodeUtf8, parseValues, randomChunks, streamOf } from './utils.js'

function collect(stream: NodeJS.ReadableStream): Promise<unknown[]> {
  const values: unknown[] = []
  return new Promise((resolve, reject) => {
    stream.on('data', (value: unknown) => values.push(value))
    stream.on('end', () => resolve(values))
    stream.on('error', reject)
  })
}

function viaJSONStream(
  chunks: readonly Uint8Array[],
  path: string | unknown[],
): Promise<unknown[]> {
  return collect(Readable.from(chunks).pipe(JSONStream.parse(path)))
}

async function viaJsonStreamStringify(value: unknown, space?: number): Promise<string> {
  return (await collect(new JsonStreamStringify(value, undefined, space))).join('')
}

/** A JSON value with no nulls, because JSONStream drops null matches. */
function randomValue(seed: number, depth = 0): unknown {
  let state = seed
  const random = () => {
    state = (state * 1103515245 + 12345) % 2 ** 31
    return state / 2 ** 31
  }
  const build = (level: number): unknown => {
    const kind = Math.floor(random() * (level > 3 ? 4 : 6))
    if (kind === 0) return Math.floor(random() * 2 ** 40) / 1000 - 1e6
    if (kind === 1)
      return ['', 'plain', 'esc"aped\\\n\t', 'ü🚀\u0001', '1e5'][Math.floor(random() * 5)]
    if (kind === 2) return random() < 0.5
    if (kind === 3) return Math.floor(random() * 1000)
    const size = Math.floor(random() * 5)
    if (kind === 4) return Array.from({ length: size }, () => build(level + 1))
    return Object.fromEntries(Array.from({ length: size }, (_, i) => [`k${i}`, build(level + 1)]))
  }
  return build(depth)
}

describe('DecoderStream matches JSONStream', () => {
  const cases = [
    ['all_npm rows', allNpm, '$.rows[*]', 'rows.*'],
    ['all_npm revs at any depth', allNpm, '$.rows..rev', 'rows..rev'],
    ['all_npm keys', allNpm, '$.rows[*].key', ['rows', true, 'key']],
    ['depth values', depth, '$.docs..value', ['docs', { recurse: true }, 'value']],
    ['header_footer rows', headerFooter, '$.rows[*]', ['rows', /\d+/]],
    ['header_footer foo', headerFooter, '$.foo.bar', 'foo.bar'],
  ] satisfies [string, string, string, string | unknown[]][]
  for (const [name, text, path, upstreamPath] of cases) {
    for (const seed of [1, 2, 3]) {
      test(`${name}, random chunking ${seed}`, async () => {
        const chunks = randomChunks(encodeUtf8(text), seed, 256)
        expect(await parseValues(chunks, { paths: [path] })).toEqual(
          await viaJSONStream(chunks, upstreamPath),
        )
      })
    }
  }

  for (const seed of [11, 12, 13, 14, 15, 16, 17, 18]) {
    test(`random document ${seed}, every element of the root`, async () => {
      const text = JSON.stringify([
        randomValue(seed),
        randomValue(seed + 100),
        randomValue(seed + 200),
      ])
      const chunks = randomChunks(encodeUtf8(text), seed, 16)
      expect(await parseValues(chunks, { paths: ['$[*]'] })).toEqual(
        await viaJSONStream(chunks, [true]),
      )
    })
  }

  test('several root documents', async () => {
    const chunks = randomChunks(
      encodeUtf8(`${headerFooter}\n${headerFooter} ${headerFooter}`),
      4,
      64,
    )
    expect(await parseValues(chunks, { paths: ['$.rows[*].id'] })).toEqual(
      await viaJSONStream(chunks, 'rows.*.id'),
    )
  })
})

describe('encodeStream matches json-stream-stringify', () => {
  for (const seed of [21, 22, 23, 24, 25, 26, 27, 28]) {
    test(`random value ${seed}`, async () => {
      const value = { a: randomValue(seed), b: [randomValue(seed + 1)], c: 'x' }
      expect(await encodeText(value)).toBe(await viaJsonStreamStringify(value))
      expect(await encodeText(value, { space: 2 })).toBe(await viaJsonStreamStringify(value, 2))
    })
  }

  test('promises and streams of objects', async () => {
    const rows = [{ a: 1 }, { b: [2, { c: 3 }] }, 'four']
    const ours = await encodeText({
      a: Promise.resolve(1),
      b: streamOf(rows),
      c: Promise.resolve({ d: Promise.resolve([5]) }),
    })
    const theirs = await viaJsonStreamStringify({
      a: Promise.resolve(1),
      b: Readable.from(rows),
      c: Promise.resolve({ d: Promise.resolve([5]) }),
    })
    expect(ours).toBe(theirs)
  })
})
