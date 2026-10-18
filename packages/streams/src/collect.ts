import { type BinaryChunk, MaxBytesError, byteLength, toUint8Array } from './bytes.js'
import { type Source, forEach } from './source.js'

export declare namespace toBytes {
  type Options = {
    /** Fail with `MaxBytesError` and cancel the source once it yields more bytes than this. @default Infinity */
    maxBytes?: number | undefined
  }
}

/**
 * Reads a stream or iterable to the end and returns its bytes in one `Uint8Array`.
 * String chunks are encoded as UTF-8.
 *
 * @example
 * ```ts
 * import { toBytes } from '@portable/streams'
 *
 * const response = await fetch('https://example.com/image.png')
 * const bytes = await toBytes(response.body!, { maxBytes: 10_000_000 })
 * ```
 */
export async function toBytes(
  source: Source<BinaryChunk>,
  options: toBytes.Options = {},
): Promise<Uint8Array<ArrayBuffer>> {
  const { maxBytes = Infinity } = options
  const chunks: Uint8Array[] = []
  let length = 0
  await forEach(source, (chunk) => {
    const bytes = toUint8Array(chunk)
    length += bytes.byteLength
    if (length > maxBytes) throw new MaxBytesError(maxBytes)
    chunks.push(bytes)
  })
  return concatBytes(chunks, length)
}

export declare namespace toText {
  type Options = {
    /** Text encoding of byte chunks, as a `TextDecoder` label. @default 'utf-8' */
    encoding?: string | undefined
    /** Fail with `MaxBytesError` and cancel the source once it yields more bytes than this. String chunks count as their UTF-8 length. @default Infinity */
    maxBytes?: number | undefined
  }
}

/**
 * Reads a stream or iterable to the end and decodes it as text. String chunks are kept as
 * they are, and byte chunks are decoded with `TextDecoder`, so a character split across
 * chunks decodes correctly.
 *
 * @example
 * ```ts
 * import { toText } from '@portable/streams'
 *
 * const response = await fetch('https://example.com/')
 * const html = await toText(response.body!, { maxBytes: 1_000_000 })
 * ```
 */
export async function toText(
  source: Source<BinaryChunk>,
  options: toText.Options = {},
): Promise<string> {
  const { encoding = 'utf-8', maxBytes = Infinity } = options
  const decoder = new TextDecoder(encoding)
  let text = ''
  let pending: Uint8Array[] = []
  let pendingLength = 0
  let length = 0
  const decodePending = () => {
    text += decoder.decode(concatBytes(pending, pendingLength))
    pending = []
    pendingLength = 0
  }
  await forEach(source, (chunk) => {
    length += byteLength(chunk)
    if (length > maxBytes) throw new MaxBytesError(maxBytes)
    if (typeof chunk === 'string') {
      if (pendingLength > 0) decodePending()
      text += chunk
      return
    }
    const bytes = toUint8Array(chunk)
    pending.push(bytes)
    pendingLength += bytes.byteLength
  })
  decodePending()
  return text
}

/**
 * Reads a stream or iterable to the end and parses it as JSON.
 *
 * @example
 * ```ts
 * import { toJson } from '@portable/streams'
 *
 * const body = await toJson(request.body!, { maxBytes: 100_000 })
 * ```
 */
export async function toJson(
  source: Source<BinaryChunk>,
  options: toText.Options = {},
): Promise<unknown> {
  return JSON.parse(await toText(source, options))
}

/**
 * Reads a stream or iterable to the end and returns its chunks in an array.
 *
 * @example
 * ```ts
 * import { toArray } from '@portable/streams'
 * import { LineStream } from '@portable/lines'
 *
 * const lines = await toArray(response.body!.pipeThrough(new LineStream()))
 * ```
 */
export async function toArray<T>(source: Source<T>): Promise<T[]> {
  const chunks: T[] = []
  await forEach(source, (chunk) => {
    chunks.push(chunk)
  })
  return chunks
}

function concatBytes(chunks: readonly Uint8Array[], length: number): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(length)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  return bytes
}
