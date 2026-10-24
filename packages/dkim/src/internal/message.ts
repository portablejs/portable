import type * as Bytes from '@portable/bytes'
import { isInput, toUint8Array } from '@portable/bytes/internal'
const CR = 0x0d
const LF = 0x0a

/**
 * A message as `sign` and `verify` take it. Text is encoded as UTF-8.
 *
 * @example
 * ```ts
 * import * as Dkim from '@portable/dkim'
 *
 * const message: Dkim.Message = request.body!
 * ```
 */
export type Message = ReadableStream<Bytes.Input> | Bytes.Input | string

/** Pulls the body chunks that follow the header section. `undefined` ends the body. */
export type Body = {
  read: () => Promise<Uint8Array | undefined>
  cancel: () => Promise<void>
}

/**
 * Splits a message at the first empty line (RFC 5322 section 2.1). Every bare LF becomes CRLF
 * first, in the header section and the body, because messages stored on disk often use LF and
 * DKIM hashes CRLF line ends. `header` holds the header fields with the CRLF that ends the last
 * one, and without the empty line. A message that starts with an empty line has no header
 * fields, and one without an empty line has no body.
 */
export async function splitMessage(input: Message): Promise<{ header: Uint8Array; body: Body }> {
  const source = readChunks(input)
  const next = normalizeLineEnds(source.read)
  let header = new Uint8Array(4096)
  let length = 0
  for (;;) {
    const chunk = await next()
    if (!chunk)
      return { header: header.subarray(0, length), body: { read: next, cancel: source.cancel } }
    if (length + chunk.length > header.length) {
      const grown = new Uint8Array(Math.max(header.length * 2, length + chunk.length))
      grown.set(header.subarray(0, length))
      header = grown
    }
    header.set(chunk, length)
    const end = findEmptyLine(header, Math.max(0, length - 3), length + chunk.length)
    length += chunk.length
    if (end < 0) continue
    const rest = header.slice(end + 2, length)
    let pending: Uint8Array | undefined = rest.length > 0 ? rest : undefined
    return {
      header: header.subarray(0, end),
      body: {
        read() {
          if (!pending) return next()
          const chunk = pending
          pending = undefined
          return Promise.resolve(chunk)
        },
        cancel: source.cancel,
      },
    }
  }
}

function findEmptyLine(bytes: Uint8Array, from: number, to: number): number {
  if (from === 0 && to >= 2 && bytes[0] === CR && bytes[1] === LF) return 0
  for (let i = bytes.indexOf(LF, from); i >= 0 && i + 2 < to; i = bytes.indexOf(LF, i + 1)) {
    if (bytes[i - 1] === CR && bytes[i + 1] === CR && bytes[i + 2] === LF) return i + 1
  }
  return -1
}

function readChunks(input: Message): Body {
  if (typeof input === 'string') input = new TextEncoder().encode(input)
  if (isInput(input)) {
    let chunk: Uint8Array | undefined = toUint8Array(input)
    return {
      read() {
        const result = chunk
        chunk = undefined
        return Promise.resolve(result)
      },
      cancel() {
        chunk = undefined
        return Promise.resolve()
      },
    }
  }
  if (!(input instanceof ReadableStream))
    throw new TypeError('Expected the message as a ReadableStream, bytes or a string.')
  const reader = input.getReader()
  return {
    async read() {
      const { done, value } = await reader.read()
      if (done) return undefined
      return toUint8Array(value)
    },
    cancel: () => reader.cancel(),
  }
}

function normalizeLineEnds(
  next: () => Promise<Uint8Array | undefined>,
): () => Promise<Uint8Array | undefined> {
  let previous = 0
  return async () => {
    let chunk = await next()
    while (chunk?.length === 0) chunk = await next()
    if (!chunk) return undefined
    let bare = 0
    for (let i = chunk.indexOf(LF); i >= 0; i = chunk.indexOf(LF, i + 1))
      if ((i === 0 ? previous : chunk[i - 1]) !== CR) bare++
    const last = chunk[chunk.length - 1]!
    if (bare === 0) {
      previous = last
      return chunk
    }
    const out = new Uint8Array(chunk.length + bare)
    let o = 0
    let start = 0
    for (let i = chunk.indexOf(LF); i >= 0; i = chunk.indexOf(LF, i + 1)) {
      if ((i === 0 ? previous : chunk[i - 1]) === CR) continue
      out.set(chunk.subarray(start, i), o)
      o += i - start
      out[o++] = CR
      start = i
    }
    out.set(chunk.subarray(start), o)
    previous = last
    return out
  }
}
