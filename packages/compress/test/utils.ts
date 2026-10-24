import * as Compress from '@portable/compress'
import * as Streams from '@portable/streams'

const files = import.meta.glob<string>('./fixtures/*', { query: '?url&inline', import: 'default' })

/** Fixture names, such as `lorem.txt`. */
export const fixtures: readonly string[] = Object.keys(files)
  .map((path) => path.slice('./fixtures/'.length))
  .sort()

export async function fixture(name: string): Promise<Uint8Array> {
  const load = files[`./fixtures/${name}`]
  if (!load) throw new Error(`No fixture ${name}`)
  return new Uint8Array(await (await fetch(await load())).arrayBuffer())
}

/** pako's round-trip samples: text, UTF-8 text, a JPEG, a GIF and a zip. */
export const samples: readonly string[] = [
  'blank.gif',
  'lorem.txt',
  'lorem_cat.jpeg',
  'lorem_en_100k.txt',
  'lorem_utf_100k.txt',
  'utf8.zip',
]

export const formats: readonly Compress.Format[] = ['gzip', 'deflate', 'deflate-raw']

export function hex(text: string): Uint8Array {
  return new Uint8Array(text.split(' ').map((byte) => parseInt(byte, 16)))
}

export function chunked(bytes: Uint8Array, size: number): Uint8Array[] {
  const chunks = new Array<Uint8Array>()
  for (let i = 0; i < bytes.length; i += size) chunks.push(bytes.subarray(i, i + size))
  return chunks
}

export function randomChunks(bytes: Uint8Array, seed: number, maxSize = 64): Uint8Array[] {
  const random = seeded(seed)
  const chunks = new Array<Uint8Array>()
  for (let i = 0; i < bytes.length;) {
    const size = 1 + Math.floor(random() * maxSize)
    chunks.push(bytes.subarray(i, i + size))
    i += size
  }
  return chunks
}

export function randomBytes(length: number, seed: number): Uint8Array {
  const random = seeded(seed)
  const bytes = new Uint8Array(length)
  for (let i = 0; i < length; i++) bytes[i] = Math.floor(random() * 256)
  return bytes
}

function seeded(seed: number): () => number {
  let state = seed | 1
  return () => {
    state ^= state << 13
    state ^= state >>> 17
    state ^= state << 5
    return (state >>> 0) / 2 ** 32
  }
}

export function decodeChunks(
  chunks: readonly Uint8Array[],
  options?: Compress.DecoderStream.Options,
): Promise<Uint8Array> {
  return Streams.toBytes(
    Streams.fromIterable(chunks).pipeThrough(new Compress.DecoderStream(options)),
  )
}

/**
 * Describes the first byte or the length where two byte arrays differ, or returns `undefined` if
 * they are equal. Faster than `toEqual` on megabytes.
 */
export function difference(actual: Uint8Array, expected: Uint8Array): string | undefined {
  const length = Math.min(actual.length, expected.length)
  for (let i = 0; i < length; i++)
    if (actual[i] !== expected[i]) return `byte ${i}: ${actual[i]} instead of ${expected[i]}`
  if (actual.length !== expected.length)
    return `length ${actual.length} instead of ${expected.length}`
  return undefined
}

export const encode = (text: string): Uint8Array => new TextEncoder().encode(text)
export const decode = (bytes: Uint8Array): string => new TextDecoder().decode(bytes)
