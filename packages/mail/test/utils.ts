import * as Mail from '@portable/mail'
import * as Streams from '@portable/streams'

/** nodemailer's boundary format, so expected output can be copied from its tests. */
export const boundary = '--_NmP-test-Part_'

export const fixed = { messageId: '<zzzzzz>', date: 'Sat, 21 Jun 2014 10:52:44 +0000' }

export function compose(
  message: Mail.Message,
  options: Mail.encodeStream.Options = {},
): Promise<string> {
  return Streams.toText(Mail.encodeStream({ ...fixed, ...message }, { boundary, ...options }))
}

export function composeBytes(
  message: Mail.Message,
  options: Mail.encodeStream.Options = {},
): Promise<Uint8Array> {
  return Streams.toBytes(Mail.encodeStream({ ...fixed, ...message }, { boundary, ...options }))
}

/** The header block of a message or part, before the first empty line. */
export const head = (raw: string): string => raw.slice(0, raw.indexOf('\r\n\r\n'))

/** The body of a single-part message, after the first empty line. */
export const bodyOf = (raw: string): string => raw.slice(raw.indexOf('\r\n\r\n') + 4)

/** The parts between the delimiters of boundary number `id`, each with its headers and body. */
export function partsOf(raw: string, id: number): string[] {
  const delimiter = '--' + boundary + id
  const first = raw.indexOf('\n' + delimiter + '\r\n') + 1
  const close = raw.indexOf('\r\n' + delimiter + '--\r\n', first)
  return raw.slice(first + delimiter.length + 2, close).split('\r\n' + delimiter + '\r\n')
}

export const encode = (text: string): Uint8Array => new TextEncoder().encode(text)

/** A stream that hands out `chunks` one per read, with a macrotask between reads. */
export function slowStream(chunks: readonly Uint8Array[]): ReadableStream<Uint8Array> {
  let i = 0
  return new ReadableStream({
    async pull(controller) {
      await new Promise((resolve) => setTimeout(resolve, 0))
      if (i < chunks.length) {
        controller.enqueue(chunks[i++]!)
      } else {
        controller.close()
      }
    },
  })
}

export function chunked(bytes: Uint8Array, size: number): Uint8Array[] {
  const chunks: Uint8Array[] = []
  for (let i = 0; i < bytes.length; i += size) {
    chunks.push(bytes.subarray(i, i + size))
  }
  return chunks
}

export function randomBytes(length: number, seed: number): Uint8Array {
  let state = seed
  const bytes = new Uint8Array(length)
  for (let i = 0; i < length; i++) {
    state = (state * 1103515245 + 12345) % 2 ** 31
    bytes[i] = state >> 23
  }
  return bytes
}
