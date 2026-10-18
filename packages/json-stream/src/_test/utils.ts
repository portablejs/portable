import { fromIterable, toArray, toText } from '@portable/streams'
import { encode, NdjsonDecoderStream, NdjsonEncoderStream, ParserStream } from '../index.js'

/** U+2028, which the formatter would turn into a literal line break inside a string. */
export const lineSeparator: string = String.fromCharCode(0x2028)

export const encodeUtf8 = (text: string): Uint8Array => new TextEncoder().encode(text)

/** Splits text or bytes into chunks of `size`, the way a network read might. */
export function chunked<T extends string | Uint8Array>(input: T, size: number): T[] {
  const chunks: T[] = []
  for (let i = 0; i < input.length; i += size) chunks.push(input.slice(i, i + size) as T)
  return chunks
}

/** Splits bytes at pseudo-random offsets, the same ones for the same seed. */
export function randomChunks(bytes: Uint8Array, seed: number, maxSize = 64): Uint8Array[] {
  let state = seed
  const random = () => {
    state = (state * 1103515245 + 12345) % 2 ** 31
    return state / 2 ** 31
  }
  const chunks: Uint8Array[] = []
  for (let i = 0; i < bytes.length;) {
    const size = 1 + Math.floor(random() * maxSize)
    chunks.push(bytes.subarray(i, i + size))
    i += size
  }
  return chunks
}

export function parse(
  chunks: readonly (string | Uint8Array)[],
  options?: ParserStream.Options,
): Promise<ParserStream.Match[]> {
  return toArray(fromIterable(chunks).pipeThrough(new ParserStream(options)))
}

export async function parseValues(
  chunks: readonly (string | Uint8Array)[],
  options?: ParserStream.Options,
): Promise<unknown[]> {
  return (await parse(chunks, options)).map((match) => match.value)
}

export function decodeNdjson(
  chunks: readonly (string | Uint8Array)[],
  options?: NdjsonDecoderStream.Options,
): Promise<unknown[]> {
  return toArray(fromIterable(chunks).pipeThrough(new NdjsonDecoderStream(options)))
}

export async function encodeNdjson(values: readonly unknown[]): Promise<string> {
  return (await toArray(fromIterable(values).pipeThrough(new NdjsonEncoderStream()))).join('')
}

export function encodeText(value: unknown, options?: encode.Options): Promise<string> {
  return toText(encode(value, options))
}

export function deferred<T>(): {
  promise: Promise<T>
  resolve: (value: T) => void
  reject: (reason: unknown) => void
} {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

/** A stream that yields `values` one per pull, then closes. */
export function streamOf<T>(values: readonly T[]): ReadableStream<T> {
  let i = 0
  return new ReadableStream<T>({
    pull(controller) {
      if (i < values.length) controller.enqueue(values[i++]!)
      else controller.close()
    },
  })
}
