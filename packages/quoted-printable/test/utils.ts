import { decode, encode, DecoderStream, EncoderStream } from '@portable/quoted-printable'

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

export async function encodeStream(
  chunks: readonly (Uint8Array | string)[],
  options?: encode.Options,
): Promise<string> {
  return (await collect(fromChunks(chunks).pipeThrough(new EncoderStream(options)))).join('')
}

export async function decodeStream(chunks: readonly (Uint8Array | string)[]): Promise<Uint8Array> {
  return concat(await collect(fromChunks(chunks).pipeThrough(new DecoderStream())))
}

export function concat(chunks: readonly Uint8Array[]): Uint8Array {
  const result = new Uint8Array(chunks.reduce((sum, chunk) => sum + chunk.length, 0))
  let offset = 0
  for (const chunk of chunks) {
    result.set(chunk, offset)
    offset += chunk.length
  }
  return result
}

export const utf8 = (text: string): Uint8Array => new TextEncoder().encode(text)

export const text = (bytes: Uint8Array): string => new TextDecoder().decode(bytes)

/** Each char code as one byte, as libqp and quoted-printable read binary strings. */
export const latin1 = (binary: string): Uint8Array =>
  Uint8Array.from(binary, (char) => char.charCodeAt(0))

export const decodeText = (input: string | Uint8Array): string => text(decode(input))

/** Splits bytes into chunks of the given sizes, repeating the last size until the input ends. */
export function split(bytes: Uint8Array, sizes: number | readonly number[]): Uint8Array[] {
  const list = typeof sizes === 'number' ? [sizes] : sizes
  const chunks: Uint8Array[] = []
  for (let pos = 0, i = 0; pos < bytes.length; i++) {
    const size = list[Math.min(i, list.length - 1)]!
    chunks.push(bytes.subarray(pos, pos + size))
    pos += size
  }
  return chunks
}

/** A seeded pseudo-random number generator (mulberry32), so failures reproduce. */
export function random(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 2 ** 32
  }
}

/** Bytes that hit the special cases of the format, mixed with arbitrary bytes. */
const specialBytes = [
  0x2d, 0x20, 0x09, 0x0d, 0x0a, 0x3d, 0x41, 0x46, 0x61, 0x66, 0x30, 0x39, 0x2e, 0xc3, 0xb5, 0xe2,
  0x82, 0xac, 0xf0, 0x9f, 0x00, 0x7f, 0xff,
]

export function randomBytes(next: () => number, maxLength: number): Uint8Array {
  const length = Math.floor(next() * (maxLength + 1))
  return Uint8Array.from({ length }, () =>
    next() < 0.75
      ? specialBytes[Math.floor(next() * specialBytes.length)]!
      : Math.floor(next() * 256),
  )
}

const textFragments = [
  '-',
  '--',
  ' ',
  '  ',
  '\t',
  '\r\n',
  '\n',
  '\r',
  '=',
  '.',
  'a',
  'word',
  'õ',
  '€',
  '😀',
  '=C3',
  '=\r\n',
]

/** Text with multi-byte characters and plenty of whitespace and line breaks. */
export function randomText(next: () => number, maxFragments: number): string {
  const count = Math.floor(next() * (maxFragments + 1))
  let result = ''
  for (let i = 0; i < count; i++) {
    result +=
      next() < 0.8
        ? textFragments[Math.floor(next() * textFragments.length)]!
        : String.fromCodePoint(Math.floor(next() * 0x2ffff) % 0xd800)
  }
  return result
}

const qpFragments = [
  '=',
  '=3D',
  '=C3',
  '=c3',
  '=4',
  '=G1',
  '=\r\n',
  '=\n',
  ' \r\n',
  '\t\n',
  ' ',
  '\t',
  '\r',
  '\n',
  'a',
  '-',
  '\xe9',
  '\xff',
]

/** Quoted-printable-like bytes, valid or not: escapes, broken escapes, soft breaks and whitespace. */
export function randomQuotedPrintable(next: () => number, maxFragments: number): Uint8Array {
  const count = Math.floor(next() * (maxFragments + 1))
  let result = ''
  for (let i = 0; i < count; i++) result += qpFragments[Math.floor(next() * qpFragments.length)]!
  return latin1(result)
}

/** Random chunk sizes from 1 to `max`. */
export function randomSizes(next: () => number, max = 16): number[] {
  return Array.from({ length: 1 + Math.floor(next() * 8) }, () => 1 + Math.floor(next() * max))
}
