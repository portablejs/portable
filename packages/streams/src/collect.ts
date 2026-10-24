import * as Bytes from '@portable/bytes'
import { toBufferSource } from '@portable/bytes/internal'
import { byteLength, toUint8Array } from './bytes.js'
import { MaxBytesError } from './errors.js'
import { type Source, forEach } from './source.js'

export declare namespace toBytes {
  type Options = {
    /** Fail with `MaxBytesError` and cancel the source once it yields more bytes than this. @default Infinity */
    maxBytes?: number | undefined
    /** Rejects with `signal.reason` and cancels the source when aborted. */
    signal?: AbortSignal | undefined
  }
}

/**
 * Reads a stream or iterable to the end and returns its bytes in one `Uint8Array`.
 * String chunks are encoded as UTF-8.
 *
 * @example
 * ```ts
 * import * as Streams from '@portable/streams'
 *
 * const response = await fetch('https://example.com/image.png')
 * const bytes = await Streams.toBytes(response.body!, { maxBytes: 10_000_000 })
 * ```
 */
export async function toBytes(
  source: Source<Bytes.Input | string>,
  options: toBytes.Options = {},
): Promise<Uint8Array<ArrayBuffer>> {
  const { maxBytes = Infinity, signal } = options
  const chunks: Uint8Array[] = []
  let length = 0
  await forEach(
    source,
    (chunk) => {
      const bytes = toUint8Array(chunk)
      length += bytes.byteLength
      if (length > maxBytes) throw new MaxBytesError({ maxBytes })
      chunks.push(bytes)
    },
    signal,
  )
  return Bytes.concat(chunks)
}

export declare namespace toBlob {
  type Options = toBytes.Options & {
    /** The `Blob`'s `type`, such as `'image/png'`. @default '' */
    type?: string | undefined
  }
}

/**
 * Reads a stream or iterable to the end and returns its bytes in a `Blob`. String chunks are
 * encoded as UTF-8. Unlike `new Response(stream).blob()`, it takes a `maxBytes` limit and a
 * `signal`, and reads async iterables.
 *
 * @example
 * ```ts
 * import * as Streams from '@portable/streams'
 *
 * const response = await fetch('https://example.com/image.png')
 * const blob = await Streams.toBlob(response.body!, { maxBytes: 10_000_000, type: 'image/png' })
 * ```
 */
export async function toBlob(
  source: Source<Bytes.Input | string>,
  options: toBlob.Options = {},
): Promise<Blob> {
  const { maxBytes = Infinity, signal, type = '' } = options
  const chunks: BlobPart[] = []
  let length = 0
  await forEach(
    source,
    (chunk) => {
      const bytes = toUint8Array(chunk)
      length += bytes.byteLength
      if (length > maxBytes) throw new MaxBytesError({ maxBytes })
      chunks.push(toBufferSource(bytes))
    },
    signal,
  )
  return new Blob(chunks, { type })
}

export declare namespace toText {
  type Options = {
    /** Text encoding of byte chunks, as a `TextDecoder` label. @default 'utf-8' */
    encoding?: string | undefined
    /** Fail with `MaxBytesError` and cancel the source once it yields more bytes than this. String chunks count as their UTF-8 length. @default Infinity */
    maxBytes?: number | undefined
    /** Rejects with `signal.reason` and cancels the source when aborted. */
    signal?: AbortSignal | undefined
  }
}

/**
 * Reads a stream or iterable to the end and decodes it as text. String chunks are kept as
 * they are, and byte chunks are decoded with `TextDecoder`, so a character split across
 * chunks decodes correctly.
 *
 * @example
 * ```ts
 * import * as Streams from '@portable/streams'
 *
 * const response = await fetch('https://example.com/')
 * const html = await Streams.toText(response.body!, { maxBytes: 1_000_000 })
 * ```
 */
export async function toText(
  source: Source<Bytes.Input | string>,
  options: toText.Options = {},
): Promise<string> {
  const { encoding = 'utf-8', maxBytes = Infinity, signal } = options
  const decoder = new TextDecoder(encoding)
  let text = ''
  let decoding = false
  let length = 0
  await forEach(
    source,
    (chunk) => {
      length += byteLength(chunk)
      if (length > maxBytes) throw new MaxBytesError({ maxBytes })
      if (typeof chunk === 'string') {
        if (decoding) text += decoder.decode()
        decoding = false
        text += chunk
      } else {
        text += decoder.decode(toUint8Array(chunk), { stream: true })
        decoding = true
      }
    },
    signal,
  )
  if (decoding) text += decoder.decode()
  return text
}

export declare namespace toJson {
  type Options = toText.Options
}

/**
 * Reads a stream or iterable to the end and parses it as JSON.
 *
 * @example
 * ```ts
 * import * as Streams from '@portable/streams'
 *
 * const body = await Streams.toJson(request.body!, { maxBytes: 100_000 })
 * ```
 */
export async function toJson(
  source: Source<Bytes.Input | string>,
  options: toJson.Options = {},
): Promise<unknown> {
  return JSON.parse(await toText(source, options))
}

export declare namespace toArray {
  type Options = {
    /** Rejects with `signal.reason` and cancels the source when aborted. */
    signal?: AbortSignal | undefined
  }
}

/**
 * Reads a stream or iterable to the end and returns its chunks in an array.
 *
 * @example
 * ```ts
 * import * as Streams from '@portable/streams'
 * import * as Lines from '@portable/lines'
 *
 * const lines = await Streams.toArray(response.body!.pipeThrough(new Lines.DecoderStream()))
 * ```
 */
export async function toArray<value>(
  source: Source<value>,
  options: toArray.Options = {},
): Promise<value[]> {
  const chunks: value[] = []
  await forEach(
    source,
    (chunk) => {
      chunks.push(chunk)
    },
    options.signal,
  )
  return chunks
}
