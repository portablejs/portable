import { toBufferSource } from '@portable/bytes/internal'
import { concat } from './bytes.js'
import { MaxBytesError, classify } from './errors.js'

/** A format that `CompressionStream` and `DecompressionStream` support: gzip (RFC 1952), zlib (RFC 1950) or raw deflate (RFC 1951). */
export type Format = 'gzip' | 'deflate' | 'deflate-raw'

export declare namespace encode {
  type Options = {
    /** @default 'gzip' */
    format?: Format | undefined
    /** Rejects with `signal.reason` when aborted, and stops the compression stream. */
    signal?: AbortSignal | undefined
  }
}

/**
 * Compresses bytes or UTF-8 text with `CompressionStream`.
 *
 * @example
 * ```ts
 * import * as Compress from '@portable/compress'
 *
 * const gzipped = await Compress.encode('hello world')
 * const zlib = await Compress.encode(bytes, { format: 'deflate' })
 * ```
 */
export async function encode(
  data: Uint8Array | string,
  options: encode.Options = {},
): Promise<Uint8Array<ArrayBuffer>> {
  const { format = 'gzip', signal } = options
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data
  const chunks: Uint8Array[] = []
  let length = 0
  await run(
    bytes,
    new CompressionStream(format),
    (chunk) => {
      chunks.push(chunk)
      length += chunk.byteLength
    },
    signal,
  )
  return concat(chunks, length)
}

export declare namespace decode {
  type Options = {
    /** @default 'gzip' */
    format?: Format | undefined
    /** Fail with `MaxBytesError` once the output grows past this many bytes. @default Infinity */
    maxBytes?: number | undefined
    /** Rejects with `signal.reason` when aborted, and stops the compression stream. */
    signal?: AbortSignal | undefined
  }
}

/**
 * Decompresses bytes with `DecompressionStream`. A gzip file with several members decodes to
 * all of them joined, as `gunzip` does.
 *
 * @example
 * ```ts
 * import * as Compress from '@portable/compress'
 *
 * const response = await fetch('https://example.com/data.json.gz')
 * const bytes = await Compress.decode(await response.bytes(), { maxBytes: 100_000_000 })
 * ```
 */
export async function decode(
  data: Uint8Array,
  options: decode.Options = {},
): Promise<Uint8Array<ArrayBuffer>> {
  const { format = 'gzip', maxBytes = Infinity, signal } = options
  const chunks: Uint8Array[] = []
  let length = 0
  const decodeAll = (input: Uint8Array) =>
    run(
      input,
      new DecompressionStream(format),
      (chunk) => {
        length += chunk.byteLength
        if (length > maxBytes) throw new MaxBytesError({ maxBytes })
        chunks.push(chunk)
      },
      signal,
    )

  let firstError: unknown
  try {
    await decodeAll(data)
    return concat(chunks, length)
  } catch (error) {
    if (format !== 'gzip' || error instanceof MaxBytesError || signal?.aborted) throw error
    firstError = error
  }

  // DecompressionStream rejects anything after the first gzip member. Each member starts with
  // the bytes 1f 8b 08, so try every such position as the end of the current member.
  chunks.length = 0
  length = 0
  let offset = 0
  members: for (;;) {
    for (let end = nextMember(data, offset + 18); end > 0; end = nextMember(data, end + 1)) {
      const before = chunks.length
      try {
        await decodeAll(data.subarray(offset, end))
        offset = end
        continue members
      } catch (error) {
        if (error instanceof MaxBytesError || signal?.aborted) throw error
        for (const chunk of chunks.splice(before)) length -= chunk.byteLength
      }
    }
    if (offset === 0) throw firstError
    await decodeAll(data.subarray(offset))
    break
  }
  return concat(chunks, length)
}

function nextMember(data: Uint8Array, from: number): number {
  for (let i = from; i + 2 < data.length; i++)
    if (data[i] === 0x1f && data[i + 1] === 0x8b && data[i + 2] === 0x08) return i
  return -1
}

async function run(
  data: Uint8Array,
  stream: ReadableWritablePair<Uint8Array<ArrayBuffer>, BufferSource>,
  onChunk: (chunk: Uint8Array<ArrayBuffer>) => void,
  signal: AbortSignal | undefined,
): Promise<void> {
  signal?.throwIfAborted()
  const writer = stream.writable.getWriter()
  let closing = false
  writer
    .write(toBufferSource(data))
    .then(() => {
      closing = true
      return writer.close()
    })
    .catch(() => {})
  const reader = stream.readable.getReader()
  const onAbort = () => {
    reader.cancel(signal!.reason).catch(() => {})
    writer.abort(signal!.reason).catch(() => {})
  }
  signal?.addEventListener('abort', onAbort, { once: true })
  try {
    for (;;) {
      let result: ReadableStreamReadResult<Uint8Array<ArrayBuffer>>
      try {
        result = await reader.read()
      } catch (error) {
        signal?.throwIfAborted()
        throw classify(error, closing)
      }
      signal?.throwIfAborted()
      if (result.done) return
      try {
        onChunk(result.value)
      } catch (error) {
        await reader.cancel(error).catch(() => {})
        throw error
      }
    }
  } finally {
    signal?.removeEventListener('abort', onAbort)
  }
}
