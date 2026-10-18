import { EncoderStream } from '../index.js'
import type { Charset } from '../index.js'

// Not every browser has ReadableStream.from or async iteration of streams yet, so the
// tests build and drain streams by hand.
export function fromChunks<T>(chunks: readonly T[]): ReadableStream<T> {
  let i = 0
  return new ReadableStream({
    pull(controller) {
      if (i < chunks.length) controller.enqueue(chunks[i++]!)
      else controller.close()
    },
  })
}

export async function collect<T>(stream: ReadableStream<T>): Promise<T[]> {
  const reader = stream.getReader()
  const chunks: T[] = []
  for (;;) {
    const { done, value } = await reader.read()
    if (done) return chunks
    chunks.push(value)
  }
}

export function concat(chunks: readonly Uint8Array[]): Uint8Array {
  const bytes = new Uint8Array(chunks.reduce((sum, chunk) => sum + chunk.length, 0))
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.length
  }
  return bytes
}

export async function encodeStream(
  chunks: readonly (string | Uint8Array)[],
  charset: Charset,
  options?: EncoderStream.Options,
): Promise<Uint8Array> {
  return concat(await collect(fromChunks(chunks).pipeThrough(new EncoderStream(charset, options))))
}

export const hex = (bytes: Uint8Array): string =>
  Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')

export const fromHex = (text: string): Uint8Array =>
  Uint8Array.from(text.match(/../g) ?? [], (pair) => parseInt(pair, 16))

/** Bytes of a string whose code units are all below 0x100, like Node's 'binary' encoding. */
export const binary = (text: string): Uint8Array =>
  Uint8Array.from(text, (char) => char.charCodeAt(0))

/** A seeded linear congruential generator, so failures reproduce. */
export function random(seed: number): () => number {
  let state = seed
  return () => {
    state = (state * 1103515245 + 12345) % 2 ** 31
    return state / 2 ** 31
  }
}

/** Splits text into chunks of 1 to 16 code units, which can split surrogate pairs. */
export function randomChunks(text: string, seed: number): string[] {
  const next = random(seed)
  const chunks: string[] = []
  for (let i = 0; i < text.length;) {
    const size = 1 + Math.floor(next() * 16)
    chunks.push(text.slice(i, i + size))
    i += size
  }
  return chunks
}
