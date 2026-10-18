/** A chunk that can be read as bytes: text (encoded as UTF-8), an `ArrayBuffer`, or any typed array or `DataView`. */
export type BinaryChunk = string | ArrayBuffer | ArrayBufferView

/** Thrown when a stream holds more bytes than `maxBytes` allows. */
export class MaxBytesError extends Error {
  override name = 'Streams.MaxBytesError'
  /** The limit that was exceeded. */
  readonly maxBytes: number
  constructor(maxBytes: number) {
    super(`Stream exceeded maxBytes of ${maxBytes}.`)
    this.maxBytes = maxBytes
  }
}

const encoder = new TextEncoder()

export function toUint8Array(chunk: unknown): Uint8Array {
  if (chunk instanceof Uint8Array) return chunk
  if (typeof chunk === 'string') return encoder.encode(chunk)
  if (ArrayBuffer.isView(chunk))
    return new Uint8Array(chunk.buffer, chunk.byteOffset, chunk.byteLength)
  if (chunk instanceof ArrayBuffer) return new Uint8Array(chunk)
  throw unsupportedChunk(chunk)
}

export function byteLength(chunk: unknown): number {
  if (typeof chunk === 'string') return utf8Length(chunk)
  if (ArrayBuffer.isView(chunk) || chunk instanceof ArrayBuffer) return chunk.byteLength
  throw unsupportedChunk(chunk)
}

export function unsupportedChunk(chunk: unknown): TypeError {
  const type = chunk === null ? 'null' : typeof chunk
  return new TypeError(
    `Chunk type ${type} is not supported. Expected a string, ArrayBuffer or ArrayBufferView.`,
  )
}

function utf8Length(text: string): number {
  let length = text.length
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i)
    if (code < 0x80) continue
    if (code < 0x800) length += 1
    else if (code >= 0xd800 && code < 0xdc00 && isLowSurrogate(text.charCodeAt(i + 1))) {
      length += 2
      i++
    } else length += 2
  }
  return length
}

const isLowSurrogate = (code: number) => code >= 0xdc00 && code < 0xe000
