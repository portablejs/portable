import { DecoderStream, EncoderStream, decode, encode } from '@portable/base64'

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

export async function collect<T>(
  stream: ReadableStream<T>,
  onChunk?: (count: number) => Promise<void>,
): Promise<T[]> {
  const reader = stream.getReader()
  const chunks: T[] = []
  for (;;) {
    const { done, value } = await reader.read()
    if (done) return chunks
    chunks.push(value)
    await onChunk?.(chunks.length)
  }
}

export function concat(chunks: readonly Uint8Array[]): Uint8Array {
  const out = new Uint8Array(chunks.reduce((sum, chunk) => sum + chunk.length, 0))
  let offset = 0
  for (const chunk of chunks) {
    out.set(chunk, offset)
    offset += chunk.length
  }
  return out
}

export async function encodeStream(
  chunks: readonly (Uint8Array | string)[],
  options?: encode.Options,
): Promise<string> {
  return (await collect(fromChunks(chunks).pipeThrough(new EncoderStream(options)))).join('')
}

export async function decodeStream(
  chunks: readonly (Uint8Array | string)[],
  options?: decode.Options,
): Promise<Uint8Array> {
  return concat(await collect(fromChunks(chunks).pipeThrough(new DecoderStream(options))))
}

/** Splits `input` into pieces of the given sizes, used in turn. A size of 0 makes an empty chunk. */
export function chunked<T extends Uint8Array | string>(
  input: T,
  sizes: number | readonly number[],
): T[] {
  const list = typeof sizes === 'number' ? [sizes] : sizes
  const chunks: T[] = []
  for (let pos = 0, i = 0; pos < input.length; i++) {
    const size = list[i % list.length]!
    chunks.push(input.slice(pos, pos + size) as T)
    pos += size
  }
  return chunks
}

export function random(seed: number): () => number {
  let state = seed
  return () => {
    state = (state * 1103515245 + 12345) % 2 ** 31
    return state / 2 ** 31
  }
}

export function randomBytes(length: number, seed: number): Uint8Array {
  const next = random(seed)
  return Uint8Array.from({ length }, () => Math.floor(next() * 256))
}

export function randomChunkSizes(seed: number, max = 300): number[] {
  const next = random(seed)
  return Array.from({ length: 1 + Math.floor(next() * 8) }, () => 1 + Math.floor(next() * max))
}

export const utf8 = (text: string): Uint8Array => new TextEncoder().encode(text)
export const text = (bytes: Uint8Array): string => new TextDecoder().decode(bytes)
export const latin1 = (text: string): Uint8Array =>
  Uint8Array.from(text, (char) => char.charCodeAt(0))

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

/** RFC 4648 encoder, bit by bit, ported from libbase64's property tests. */
export function referenceEncode(data: Uint8Array): string {
  let out = ''
  for (let i = 0; i < data.length; i += 3) {
    const n = (data[i]! << 16) | ((data[i + 1] ?? 0) << 8) | (data[i + 2] ?? 0)
    const chars = [(n >> 18) & 63, (n >> 12) & 63, (n >> 6) & 63, n & 63].map((c) => ALPHABET[c])
    const used = Math.min(data.length - i, 3) + 1
    out += chars.slice(0, used).join('') + '='.repeat(4 - used)
  }
  return out
}

/**
 * libbase64's reference for lenient decoding, which `mode: 'mime'` follows: characters outside
 * both alphabets are skipped, and every `=` ends a segment that is decoded on its own.
 */
export function referenceDecode(str: string): Uint8Array {
  const out: number[] = []
  for (const segment of str.split('=')) {
    let bits = 0
    let count = 0
    for (const char of segment) {
      let value = ALPHABET.indexOf(char)
      if (char === '-') value = 62
      else if (char === '_') value = 63
      if (value < 0) continue
      bits = ((bits << 6) | value) & 0xffffff
      count += 6
      if (count >= 8) {
        count -= 8
        out.push((bits >> count) & 0xff)
      }
    }
  }
  return Uint8Array.from(out)
}

export function referenceWrap(str: string, lineLength: number, lineEnding = '\r\n'): string {
  const lines: string[] = []
  for (let pos = 0; pos < str.length; pos += lineLength)
    lines.push(str.slice(pos, pos + lineLength))
  return lines.join(lineEnding)
}

/**
 * Base64-looking text: mostly alphabet characters, with padding runs, line breaks, other ASCII,
 * 8-bit and non-Latin-1 characters mixed in. Ported from libbase64's `encodedLike` arbitrary.
 */
export function encodedLike(seed: number, maxLength = 2000): string {
  const next = random(seed)
  const pick = (options: string | readonly string[]) =>
    options[Math.floor(next() * options.length)]!
  const parts: string[] = []
  const length = Math.floor(next() * maxLength)
  for (let i = 0; i < length; i++) {
    const kind = next() * 13
    if (kind < 10) parts.push(pick(ALPHABET + '-_'))
    else if (kind < 12) parts.push(pick(['=', '==', '\r\n', ' ', '\t']))
    else parts.push(String.fromCharCode(Math.floor(next() * (next() < 0.9 ? 256 : 0x10000))))
  }
  return parts.join('')
}
