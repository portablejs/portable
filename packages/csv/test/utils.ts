import { fromIterable, toArray } from '@portable/streams'
import * as Csv from '@portable/csv'

const files = import.meta.glob<string>('./fixtures/**/*.*', {
  query: '?url&inline',
  import: 'default',
})

export const fixtures: readonly string[] = Object.keys(files)
  .map((path) => path.slice('./fixtures/'.length))
  .sort()

export async function fixture(path: string): Promise<Uint8Array> {
  const load = files[`./fixtures/${path}`]
  if (!load) throw new Error(`No fixture ${path}`)
  return new Uint8Array(await (await fetch(await load())).arrayBuffer())
}

export const encodeUtf8 = (text: string): Uint8Array => new TextEncoder().encode(text)

/** U+FEFF, which the formatter would turn into an invisible literal inside a string. */
export const bom: string = String.fromCharCode(0xfeff)

function random(seed: number): () => number {
  let state = seed
  return () => {
    state = (state * 1103515245 + 12345) % 2 ** 31
    return state / 2 ** 31
  }
}

export function randomChunks<value extends string | Uint8Array>(
  input: value,
  seed: number,
  maxSize = 16,
): value[] {
  const next = random(seed)
  const chunks = new Array<value>()
  for (let i = 0; i < input.length;) {
    const size = 1 + Math.floor(next() * maxSize)
    chunks.push(input.slice(i, i + size) as value)
    i += size
  }
  return chunks
}

export function chunked<value extends string | Uint8Array>(input: value, size: number): value[] {
  const chunks = new Array<value>()
  for (let i = 0; i < input.length; i += size) chunks.push(input.slice(i, i + size) as value)
  return chunks
}

export function decodeStream<const header extends Csv.DecoderStream.Header = false>(
  chunks: readonly (string | Uint8Array)[],
  options?: Csv.DecoderStream.Options<header>,
): Promise<Csv.DecoderStream.Row<header>[]> {
  return toArray(fromIterable(chunks).pipeThrough(new Csv.DecoderStream<header>(options)))
}

export async function encodeStream(
  rows: readonly Csv.encode.Row[],
  options?: Csv.EncoderStream.Options,
): Promise<string> {
  return (
    await toArray(
      fromIterable(rows)
        .pipeThrough(new Csv.EncoderStream(options))
        .pipeThrough(new TextDecoderStream('utf-8', { ignoreBOM: true })),
    )
  ).join('')
}

/**
 * Decodes `text` with `decode`, then with `DecoderStream` fed one character at a time and in random
 * chunks of text and of bytes. Fails if any result differs from the first, and returns it.
 */
export async function decodeAll<const header extends Csv.DecoderStream.Header = false>(
  text: string,
  options?: Csv.DecoderStream.Options<header>,
): Promise<Csv.DecoderStream.Row<header>[]> {
  const expected = Csv.decode<header>(text, options)
  const bytes = encodeUtf8(text)
  const runs = [
    decodeStream<header>([text], options),
    decodeStream<header>(chunked(text, 1), options),
    decodeStream<header>(chunked(bytes, 1), options),
    decodeStream<header>(randomChunks(text, 1), options),
    decodeStream<header>(randomChunks(bytes, 2), options),
  ]
  for (const run of runs) {
    const rows = await run
    if (JSON.stringify(rows) !== JSON.stringify(expected))
      throw new Error(
        `Stream gave ${JSON.stringify(rows)}, decode gave ${JSON.stringify(expected)}`,
      )
  }
  return expected
}

export async function decodeError(
  text: string,
  options?: Csv.DecoderStream.Options,
): Promise<Error> {
  let expected: Error | undefined
  try {
    Csv.decode(text, options)
  } catch (error) {
    if (error instanceof Error) expected = error
  }
  if (!expected) throw new Error('decode did not throw an Error')
  for (const chunks of [[text], chunked(text, 1), randomChunks(encodeUtf8(text), 3)]) {
    const error = await decodeStream(chunks, options).then(
      () => undefined,
      (error: unknown) => error,
    )
    if (!(error instanceof Error) || error.constructor !== expected.constructor)
      throw new Error(`Stream gave ${String(error)}, decode threw ${expected.name}`)
  }
  return expected
}
