import { fromIterable, toArray } from '@portable/streams'
import { DecoderStream, EncoderStream } from '@portable/jsonl'

/** U+2028, which the formatter would turn into a literal line break inside a string. */
export const lineSeparator: string = String.fromCharCode(0x2028)

export const encodeUtf8 = (text: string): Uint8Array => new TextEncoder().encode(text)

/** Splits text or bytes into chunks of `size`, the way a network read might. */
export function chunked<value extends string | Uint8Array>(input: value, size: number): value[] {
  const chunks: value[] = []
  for (let i = 0; i < input.length; i += size) {
    chunks.push(input.slice(i, i + size) as value)
  }
  return chunks
}

function random(seed: number): () => number {
  let state = seed
  return () => {
    state = (state * 1103515245 + 12345) % 2 ** 31
    return state / 2 ** 31
  }
}

/** Splits bytes at pseudo-random offsets, the same ones for the same seed. */
export function randomChunks(bytes: Uint8Array, seed: number, maxSize = 64): Uint8Array[] {
  const next = random(seed)
  const chunks: Uint8Array[] = []
  for (let i = 0; i < bytes.length;) {
    const size = 1 + Math.floor(next() * maxSize)
    chunks.push(bytes.subarray(i, i + size))
    i += size
  }
  return chunks
}

/** Rows shaped like a CouchDB `_all_docs` listing, the same ones for the same count. */
export function rows(count: number): unknown[] {
  const next = random(count)
  const words = ['', 'plain', 'esc"aped\\\n\t', 'ü🚀\u0001', 'npm', 'stream']
  return Array.from({ length: count }, (_, i) => {
    const id = `${words[Math.floor(next() * words.length)]}-${i}`
    return {
      id,
      key: id,
      value: { rev: `${1 + Math.floor(next() * 20)}-${Math.floor(next() * 2 ** 48).toString(16)}` },
      tags: Array.from({ length: Math.floor(next() * 4) }, () => next() < 0.5),
      score: Math.floor(next() * 2 ** 40) / 1000 - 1e6,
    }
  })
}

export function decode(
  chunks: readonly (string | Uint8Array)[],
  options?: DecoderStream.Options,
): Promise<unknown[]> {
  return toArray(fromIterable(chunks).pipeThrough(new DecoderStream(options)))
}

export async function encode(values: readonly unknown[]): Promise<string> {
  return (
    await toArray(
      fromIterable(values).pipeThrough(new EncoderStream()).pipeThrough(new TextDecoderStream()),
    )
  ).join('')
}

/** A stream that yields `values` one per pull, then closes. */
export function streamOf<chunk>(values: readonly chunk[]): ReadableStream<chunk> {
  let i = 0
  return new ReadableStream<chunk>({
    pull(controller) {
      if (i < values.length) {
        controller.enqueue(values[i++]!)
      } else {
        controller.close()
      }
    },
  })
}
