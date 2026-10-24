import { isUint8Array } from '@portable/bytes/internal'
import * as Base64 from '@portable/base64'
import * as QuotedPrintable from '@portable/quoted-printable'

/**
 * A body or attachment: text (written as UTF-8), bytes, a `Blob` or `File`, or a stream of bytes
 * such as `response.body`. Blobs and streams are read only while the message is read, so a
 * large attachment is never held in memory.
 *
 * @example
 * ```ts
 * const content: Mail.Content = (await fetch('https://example.com/report.pdf')).body!
 * ```
 */
export type Content = string | Uint8Array | Blob | ReadableStream<Uint8Array>

/**
 * How a part's bytes are written. `7bit` and `8bit` write them as they are, with line breaks
 * turned into CRLF.
 *
 * @example
 * ```ts
 * Mail.encodeStream({ attachments: [{ content: 'a,b\n', contentType: 'text/csv', transferEncoding: '7bit' }] })
 * ```
 */
export type TransferEncoding = 'base64' | 'quoted-printable' | '7bit' | '8bit'

export function isContent(value: unknown): value is Content {
  return (
    typeof value === 'string' ||
    isUint8Array(value) ||
    value instanceof Blob ||
    value instanceof ReadableStream
  )
}

/** Plain text allowed in a `7bit` part: no control characters and no line over 76. */
function isShortAscii(text: string): boolean {
  // oxlint-disable-next-line no-control-regex
  if (/[\x00-\x08\x0b\x0c\x0e-\x1f\u0080-\uffff]/.test(text)) {
    return false
  }
  let line = 0
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i)
    if (code === 0x0a || code === 0x0d) {
      line = 0
    } else if (++line > 76) {
      return false
    }
  }
  return true
}

/** Quoted-printable keeps mostly Latin text readable, and base64 is shorter for anything else. */
function textEncoding(text: string): TransferEncoding {
  let latin = 0
  let other = 0
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i)
    if ((code >= 0x41 && code <= 0x5a) || (code >= 0x61 && code <= 0x7a)) {
      latin++
    } else if (code >= 0x80 || (code < 0x20 && code !== 0x09 && code !== 0x0a && code !== 0x0d)) {
      other++
    }
  }
  return other < latin ? 'quoted-printable' : 'base64'
}

/**
 * The encoding for a text part without a `transferEncoding`. A stream can't be scanned up front.
 */
export function chooseTextEncoding(content: Content): TransferEncoding {
  if (typeof content !== 'string' && !isUint8Array(content)) {
    return 'quoted-printable'
  }
  const text = typeof content === 'string' ? content : new TextDecoder().decode(content)
  return isShortAscii(text) ? '7bit' : textEncoding(text)
}

const bareBreak = /\r(?!\n)|(?<!\r)\n/

function toCrlfText(text: string): string {
  return bareBreak.test(text) ? text.replace(/\r\n|\r|\n/g, '\r\n') : text
}

function hasBareBreak(bytes: Uint8Array): boolean {
  for (let i = 0; i < bytes.length; i++) {
    const byte = bytes[i]!
    if (byte === 0x0d ? bytes[i + 1] !== 0x0a : byte === 0x0a && bytes[i - 1] !== 0x0d) {
      return true
    }
  }
  return false
}

/**
 * Writes every CR, LF and CRLF as CRLF. `afterCr` says whether the previous chunk ended in CR,
 * whose CRLF was already written, so an LF that starts this chunk is part of that CRLF.
 */
function toCrlfBytes(bytes: Uint8Array, afterCr: boolean): Uint8Array {
  if (!afterCr && !hasBareBreak(bytes)) {
    return bytes
  }
  const out = new Uint8Array(bytes.length * 2)
  let length = 0
  let previousCr = afterCr
  for (const byte of bytes) {
    if (byte === 0x0d) {
      out[length++] = 0x0d
      out[length++] = 0x0a
    } else if (byte !== 0x0a) {
      out[length++] = byte
    } else if (!previousCr) {
      out[length++] = 0x0d
      out[length++] = 0x0a
    }
    previousCr = byte === 0x0d
  }
  return out.subarray(0, length)
}

class CrlfStream extends TransformStream<Uint8Array, Uint8Array> {
  constructor() {
    let afterCr = false
    super({
      transform(chunk, controller) {
        if (chunk.length === 0) {
          return
        }
        controller.enqueue(toCrlfBytes(chunk, afterCr))
        afterCr = chunk[chunk.length - 1] === 0x0d
      },
    })
  }
}

export type Body = {
  readonly encoding: TransferEncoding
  /** Text whose line breaks become CRLF before quoted-printable encoding. */
  readonly text: boolean
}

export function encodeBody(content: string | Uint8Array, body: Body): string | Uint8Array {
  switch (body.encoding) {
    case 'base64':
      return Base64.encode(content, { lineLength: 76 })
    case 'quoted-printable':
      if (!body.text) {
        return QuotedPrintable.encode(content, { binary: true })
      }
      return QuotedPrintable.encode(
        typeof content === 'string' ? toCrlfText(content) : toCrlfBytes(content, false),
      )
    default:
      return typeof content === 'string' ? toCrlfText(content) : toCrlfBytes(content, false)
  }
}

export function encodeBodyStream(
  source: ReadableStream<Uint8Array>,
  body: Body,
): ReadableStream<Uint8Array> {
  switch (body.encoding) {
    case 'base64':
      return source.pipeThrough(new Base64.EncoderStream({ lineLength: 76 }))
    case 'quoted-printable':
      return body.text
        ? source.pipeThrough(new CrlfStream()).pipeThrough(new QuotedPrintable.EncoderStream())
        : source.pipeThrough(new QuotedPrintable.EncoderStream({ binary: true }))
    default:
      return source.pipeThrough(new CrlfStream())
  }
}
