import * as MimeHeaders from '@portable/mime-headers'
import { abortable } from './abortable.js'
import { MaxBoundaryLineBytesError, MaxHeaderBytesError, MaxPartsError } from './errors.js'

/**
 * One part of a message: the root, a part of a multipart, or the message inside a
 * `message/rfc822` part.
 */
export type Part = {
  /**
   * The multipart this part belongs to, or the `message/rfc822` part it is embedded in. Missing on
   * the root.
   */
  parent?: Part | undefined
  /** Header fields in order, unfolded, as `MimeHeaders.parseHeaders` reads them. */
  headers: readonly MimeHeaders.Header[]
  /**
   * Lowercase media type without parameters. `text/plain` when missing or invalid, and
   * `message/rfc822` inside `multipart/digest` (RFC 2046).
   */
  contentType: string
  /** Lowercase `Content-Transfer-Encoding` without comments. `7bit` when missing. */
  encoding: string
  /**
   * The boundary that splits this part into children. Set only on a `multipart/*` part that has
   * one.
   */
  boundary?: string | undefined
}

/**
 * A run of bytes from the message. Joining every chunk's `bytes` in order gives back the input.
 *
 * - `headers`: the header block of `part`, with the empty line that ends it.
 * - `body`: content of a part that has no children, still transfer-encoded.
 * - `preamble`, `epilogue`: text before the first and after the last delimiter of the multipart
 *   `part`.
 * - `delimiter`: a boundary line of the multipart `part`, with the line break before it and its
 *   own.
 */
export type Chunk = {
  type: 'headers' | 'body' | 'preamble' | 'delimiter' | 'epilogue'
  part: Part
  bytes: Uint8Array
}

export declare namespace DecoderStream {
  type Options = {
    /**
     * Read the message inside a `message/rfc822` or `message/global` part as parts too, when it
     * isn't base64 or quoted-printable.
     * @default false
     */
    embedded?: boolean | undefined
    /**
     * Longest boundary line, line break included. Only whitespace after the boundary can make one
     * this long.
     * @default 1000
     */
    maxBoundaryLineBytes?: number | undefined
    /**
     * Longest header block of a part, counted with the empty line that ends it.
     * @default 1048576
     */
    maxHeaderBytes?: number | undefined
    /** Most parts in a message, the root included. @default 1000 */
    maxParts?: number | undefined
    /**
     * Errors the stream with `signal.reason` when aborted, which cancels the source it is piped
     * from.
     */
    signal?: AbortSignal | undefined
  }
}

/**
 * A `TransformStream` that splits a raw MIME message into chunks of header blocks, bodies and
 * multipart structure, without decoding anything. Pipe the chunks through
 * `MimeStream.EncoderStream` to get the same bytes back, or change some chunks on the way.
 *
 * @example
 * ```ts
 * import * as MimeStream from '@portable/mime-stream'
 *
 * const reader = response.body!.pipeThrough(new MimeStream.DecoderStream()).getReader()
 * for (let r = await reader.read(); !r.done; r = await reader.read()) {
 *   if (r.value.type === 'headers') console.log(r.value.part.contentType)
 * }
 * ```
 */
export class DecoderStream extends TransformStream<Uint8Array, Chunk> {
  constructor(options: DecoderStream.Options = {}) {
    let decoder: ReturnType<typeof createDecoder>
    super(
      abortable(
        {
          start(controller) {
            decoder = createDecoder(options, (chunk) => controller.enqueue(chunk))
          },
          transform(chunk) {
            decoder.write(chunk)
          },
          flush() {
            decoder.end()
          },
        },
        options.signal,
      ),
    )
  }
}

const LF = 0x0a
const CR = 0x0d
const DASH = 0x2d
const SP = 0x20
const TAB = 0x09

const PREAMBLE = 0
const PARTS = 1
const EPILOGUE = 2

type Frame = { part: Part; boundary: Uint8Array; state: number }
type Match = { frame: number; close: boolean; end: number }
const PARTIAL = 'partial'

const encoder = new TextEncoder()

function createDecoder(options: DecoderStream.Options, enqueue: (chunk: Chunk) => void) {
  const {
    embedded = false,
    maxBoundaryLineBytes = 1000,
    maxHeaderBytes = 1024 * 1024,
    maxParts = 1000,
  } = options

  const frames: Frame[] = []
  let partCount = 1
  let rootDone = false
  let inHeader = true
  let parent: Part | undefined
  let current: Part | undefined
  let section: 'body' | 'preamble' | 'epilogue' = 'body'
  let head = new Uint8Array(1024)
  let headLength = 0
  let headLineStart = 0
  let carry: Uint8Array | undefined
  let atLineStart = true
  // Index in the current buffer where the current body section starts, or -1 if it started in an
  // earlier buffer.
  let sectionStart = 0

  function startPart(owner: Part) {
    if (++partCount > maxParts) throw new MaxPartsError({ maxParts })
    parent = owner
    inHeader = true
    headLength = 0
    headLineStart = 0
  }

  function enterSection(type: typeof section, part: Part) {
    inHeader = false
    section = type
    current = part
  }

  function finishHeaders(bytes: Uint8Array) {
    if (bytes.length > maxHeaderBytes) throw new MaxHeaderBytesError({ maxHeaderBytes })
    if (head.length > 64 * 1024) head = new Uint8Array(1024)
    const headers = readHeaders(bytes)
    let contentType: string | undefined
    let transferEncoding: string | undefined
    for (const { name, value } of headers) {
      const key = name.toLowerCase()
      if (key === 'content-type') contentType ??= value
      else if (key === 'content-transfer-encoding') transferEncoding ??= value
    }
    const value = contentType === undefined ? undefined : MimeHeaders.parseValue(contentType)
    let type = value?.value.trim().toLowerCase() ?? ''
    if (!/^[^/\s]+\/[^/\s]+$/.test(type))
      type = parent?.contentType === 'multipart/digest' ? 'message/rfc822' : 'text/plain'
    const encoding =
      stripComments(transferEncoding ?? '')
        .trim()
        .toLowerCase() || '7bit'
    const part: Part = { headers, contentType: type, encoding }
    if (parent) part.parent = parent
    const boundary = type.startsWith('multipart/') ? value?.params.boundary : undefined
    if (boundary) part.boundary = boundary
    if (!parent) rootDone = true
    enqueue({ type: 'headers', part, bytes })

    if (boundary) {
      frames.push({ part, boundary: encoder.encode(boundary), state: PREAMBLE })
      enterSection('preamble', part)
    } else if (
      embedded &&
      (type === 'message/rfc822' || type === 'message/global') &&
      (encoding === '7bit' || encoding === '8bit' || encoding === 'binary')
    )
      startPart(part)
    else enterSection('body', part)
  }

  function applyDelimiter(match: Match, bytes: Uint8Array) {
    frames.length = match.frame + 1
    const frame = frames[match.frame]!
    enqueue({ type: 'delimiter', part: frame.part, bytes })
    if (match.close) {
      frame.state = EPILOGUE
      enterSection('epilogue', frame.part)
    } else {
      frame.state = PARTS
      startPart(frame.part)
    }
  }

  function matchBoundary(
    b: Uint8Array,
    i: number,
    end: number,
    boundary: Uint8Array,
    final: boolean,
  ): { close: boolean; end: number } | typeof PARTIAL | undefined {
    const more = final ? undefined : PARTIAL
    let k = i + 2
    for (let j = 0; j < boundary.length; j++, k++) {
      if (k === end) return more
      if (b[k] !== boundary[j]) return undefined
    }
    let close = false
    if (k < end && b[k] === DASH) {
      if (k + 1 === end) return more
      if (b[k + 1] !== DASH) return undefined
      close = true
      k += 2
    }
    while (k < end && (b[k] === SP || b[k] === TAB)) {
      k++
      if (k - i > maxBoundaryLineBytes)
        throw new MaxBoundaryLineBytesError({ maxBoundaryLineBytes })
    }
    if (k === end) return final ? { close, end: k } : PARTIAL
    if (b[k] === CR) {
      if (k + 1 === end) return final ? { close, end: k + 1 } : PARTIAL
      if (b[k + 1] !== LF) return undefined
      k += 2
    } else if (b[k] === LF) k++
    else return undefined
    if (k - i > maxBoundaryLineBytes) throw new MaxBoundaryLineBytesError({ maxBoundaryLineBytes })
    return { close, end: k }
  }

  function matchDelimiter(
    b: Uint8Array,
    i: number,
    end: number,
    final: boolean,
  ): Match | typeof PARTIAL | undefined {
    if (b[i] !== DASH) return undefined
    if (i + 1 === end) return final ? undefined : PARTIAL
    if (b[i + 1] !== DASH) return undefined
    let partial = false
    for (let f = frames.length - 1; f >= 0; f--) {
      const frame = frames[f]!
      if (frame.state === EPILOGUE) continue
      const result = matchBoundary(b, i, end, frame.boundary, final)
      if (result === PARTIAL) partial = true
      // RFC 2046 needs a delimiter before a close delimiter, so a close delimiter in
      // the preamble is treated as text.
      else if (result && !(result.close && frame.state === PREAMBLE))
        return { frame: f, close: result.close, end: result.end }
    }
    return partial ? PARTIAL : undefined
  }

  const hasBoundary = () => frames.some((frame) => frame.state !== EPILOGUE)

  function endingStart(b: Uint8Array, i: number, start: number): number {
    if (i <= start || i === 0) return i
    return i >= 2 && i - 2 >= start && b[i - 2] === CR ? i - 2 : i - 1
  }

  function append(b: Uint8Array, start: number, end: number) {
    const length = headLength + end - start
    if (length > maxHeaderBytes + maxBoundaryLineBytes)
      throw new MaxHeaderBytesError({ maxHeaderBytes })
    if (length > head.length) {
      const grown = new Uint8Array(Math.max(length, head.length * 2))
      grown.set(head.subarray(0, headLength))
      head = grown
    }
    head.set(b.subarray(start, end), headLength)
    headLength = length
  }

  function endHeaderLine(final: boolean): boolean {
    const s = headLineStart
    const length = headLength - s
    if (
      (length === 1 && head[s] === LF) ||
      (length === 2 && head[s] === CR && head[s + 1] === LF)
    ) {
      finishHeaders(head.slice(0, headLength))
      return true
    }
    if (hasBoundary()) {
      const match = matchDelimiter(head, s, headLength, final)
      if (match && match !== PARTIAL) {
        const e = endingStart(head, s, 0)
        const headerBytes = head.slice(0, e)
        const delimiter = head.slice(e, headLength)
        finishHeaders(headerBytes)
        applyDelimiter(match, delimiter)
        return true
      }
    }
    const headerLength = final ? headLength : endingStart(head, headLength, 0)
    if (headerLength > maxHeaderBytes) throw new MaxHeaderBytesError({ maxHeaderBytes })
    headLineStart = headLength
    return false
  }

  function readHeader(b: Uint8Array, i: number): number {
    while (i < b.length) {
      const lf = b.indexOf(LF, i)
      const end = lf < 0 ? b.length : lf + 1
      append(b, i, end)
      i = end
      if (lf < 0) {
        if (
          headLength - (head[headLength - 1] === CR ? 1 : 0) > maxHeaderBytes &&
          !(hasBoundary() && matchDelimiter(head, headLineStart, headLength, false) === PARTIAL)
        )
          throw new MaxHeaderBytesError({ maxHeaderBytes })
        return i
      }
      if (endHeaderLine(false)) {
        sectionStart = i
        atLineStart = true
        return i
      }
    }
    return i
  }

  function emit(b: Uint8Array, start: number, end: number) {
    if (end > start) enqueue({ type: section, part: current!, bytes: b.subarray(start, end) })
  }

  function hold(b: Uint8Array, from: number, lineStart: boolean) {
    if (from < b.length) carry = b.subarray(from)
    atLineStart = lineStart
  }

  function readBody(b: Uint8Array, i: number, final: boolean): number {
    const emitStart = i
    if (!hasBoundary()) {
      emit(b, i, b.length)
      return b.length
    }
    for (;;) {
      if (!atLineStart) {
        const lf = b.indexOf(LF, i)
        if (lf < 0) {
          const from = !final && b[b.length - 1] === CR ? b.length - 1 : b.length
          emit(b, emitStart, from)
          hold(b, from, false)
          return b.length
        }
        i = lf + 1
        atLineStart = true
      }
      if (i === b.length) {
        if (final) {
          emit(b, emitStart, i)
          return i
        }
        const from = endingStart(b, i, sectionStart)
        emit(b, emitStart, from)
        hold(b, from, from === i)
        return b.length
      }
      const match = matchDelimiter(b, i, b.length, final)
      if (match === undefined) {
        atLineStart = false
        continue
      }
      const from = endingStart(b, i, sectionStart)
      emit(b, emitStart, from)
      if (match === PARTIAL) {
        hold(b, from, from === i)
        return b.length
      }
      applyDelimiter(match, b.subarray(from, match.end))
      sectionStart = match.end
      atLineStart = true
      return match.end
    }
  }

  function run(b: Uint8Array, final: boolean) {
    let i = 0
    while (i < b.length) i = inHeader ? readHeader(b, i) : readBody(b, i, final)
    const next = b.length - (carry?.length ?? 0)
    sectionStart = sectionStart >= next ? sectionStart - next : -1
  }

  return {
    write(chunk: Uint8Array) {
      if (!(chunk instanceof Uint8Array)) throw new TypeError('Expected a Uint8Array chunk.')
      if (chunk.length === 0) return
      let b = chunk
      if (carry) {
        b = new Uint8Array(carry.length + chunk.length)
        b.set(carry)
        b.set(chunk, carry.length)
        carry = undefined
      }
      run(b, false)
    },
    end() {
      if (carry) {
        const b = carry
        carry = undefined
        run(b, true)
      }
      if (!inHeader) return
      if (headLength > headLineStart && endHeaderLine(true)) return
      if (headLength > 0 || !rootDone) finishHeaders(head.slice(0, headLength))
    },
  }
}

const utf8 = new TextDecoder()

// Reads a header block the way mail clients do: a bare CR doesn't end a line, a continuation line
// with no field before it is skipped, and a line such as mbox's `From ` line isn't a field.
function readHeaders(bytes: Uint8Array): MimeHeaders.Header[] {
  let text = utf8.decode(bytes)
  if (text.includes('\r')) text = text.replace(/\r(?!\n)/g, ' ')
  if (text.startsWith(' ') || text.startsWith('\t'))
    text = text.replace(/^(?:[ \t][^\n]*(?:\n|$))+/, '')
  return MimeHeaders.parseHeaders(text).filter((header) =>
    /^[\x21-\x39\x3b-\x7e]+$/.test(header.name),
  )
}

function stripComments(text: string): string {
  if (!text.includes('(')) return text
  let result = ''
  let depth = 0
  for (const character of text) {
    if (character === '(') depth++
    else if (character === ')' && depth > 0) depth--
    else if (depth === 0) result += character
  }
  return result
}
