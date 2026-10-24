import * as Errors from '@portable/errors'
import { errorOnAbort } from './signal.js'

/** An event read from a stream, as `EventSource` would dispatch it. */
export type Event = {
  /** The event type: the block's last `event` field, or `'message'` when it has none. */
  event: string
  /** The block's `data` fields, joined with `\n`. */
  data: string
  /**
   * The last event ID, as in `MessageEvent.lastEventId`. It keeps the value of the last `id` field
   * until another `id` field changes it, and is `undefined` until the stream sends one.
   */
  id?: string | undefined
  /**
   * The reconnection time in milliseconds, when a valid `retry` field arrived after the previous
   * event.
   */
  retry?: number | undefined
}

export declare namespace DecoderStream {
  type Options = {
    /**
     * Longest line, and longest `data` of one event, in UTF-16 code units. A longer one fails the
     * stream with `MaxLengthError`. @default Infinity
     */
    maxLength?: number | undefined
    /** Fails the stream with `signal.reason` and cancels its source when aborted. */
    signal?: AbortSignal | undefined
  }
}

/**
 * A `TransformStream` that reads a `text/event-stream` body into events, following the
 * WHATWG HTML standard's event stream rules. Byte chunks are decoded as UTF-8.
 *
 * @example
 * ```ts
 * import * as Sse from '@portable/sse'
 *
 * const response = await fetch('https://example.com/events', { method: 'POST', body })
 * const events = response.body!.pipeThrough(new Sse.DecoderStream())
 * ```
 */
export class DecoderStream extends TransformStream<Uint8Array | string, Event> {
  constructor(options: DecoderStream.Options = {}) {
    let parser: Parser
    let release: () => void
    const transformer = {
      start(controller: TransformStreamDefaultController<Event>) {
        parser = createParser((event) => controller.enqueue(event), options.maxLength)
        release = errorOnAbort(options.signal, controller)
      },
      transform(chunk: Uint8Array | string) {
        parser.push(chunk)
      },
      flush() {
        release()
        parser.end()
      },
      cancel() {
        release()
      },
    }
    super(transformer)
  }
}

export declare namespace decode {
  type Options = {
    /** Longest line, and longest `data` of one event, in UTF-16 code units. @default Infinity */
    maxLength?: number | undefined
  }
}

/**
 * Reads every event out of a complete `text/event-stream` body. An event without its closing
 * blank line is dropped, as `EventSource` drops it when a stream ends.
 *
 * @example
 * ```ts
 * import * as Sse from '@portable/sse'
 *
 * Sse.decode('event: greeting\ndata: hello\n\n')
 * // [{ event: 'greeting', data: 'hello', id: undefined, retry: undefined }]
 * ```
 */
export function decode(input: Uint8Array | string, options: decode.Options = {}): Event[] {
  const events = new Array<Event>()
  const parser = createParser((event) => events.push(event), options.maxLength)
  parser.push(input)
  parser.end()
  return events
}

/**
 * Thrown when a line or an event's `data` grows past `maxLength`.
 *
 * @example
 * ```ts
 * import * as Sse from '@portable/sse'
 *
 * try {
 *   Sse.decode(`data: ${'x'.repeat(2000)}\n\n`, { maxLength: 1000 })
 * } catch (error) {
 *   if (error instanceof Sse.MaxLengthError) console.log(`longer than ${error.maxLength}`)
 * }
 * ```
 */
export class MaxLengthError extends Errors.MaxLengthError {
  static override readonly kind: string = 'Sse.MaxLengthError'
  constructor(options: Errors.MaxLengthError.Options) {
    super({
      message: `Event stream line or data exceeded maxLength of ${options.maxLength}.`,
      ...options,
    })
  }
}

export type Parser = {
  push(chunk: Uint8Array | string): void
  /** Discards an unfinished line or event, as at the end of a stream. */
  end(): void
  /** Starts a new stream, keeping the last event ID and reconnection time. */
  restart(): void
  readonly id: string | undefined
  readonly retry: number | undefined
}

const LF = 10
const SPACE = 32
const COLON = 58

export function createParser(emit: (event: Event) => void, maxLength: number = Infinity): Parser {
  let decoder: TextDecoder | undefined
  let started = false
  let skipLf = false
  let pending: string[] = []
  let pendingLength = 0
  let data = ''
  let hasData = false
  let type = ''
  let idBuffer: string | undefined
  let lastId: string | undefined
  let retry: number | undefined
  let reconnectionTime: number | undefined

  const dispatch = () => {
    lastId = idBuffer
    if (hasData) {
      emit({ event: type || 'message', data, id: lastId, retry })
      retry = undefined
    }
    data = ''
    hasData = false
    type = ''
  }

  const appendData = (value: string) => {
    if (hasData) data += '\n' + value
    else {
      data = value
      hasData = true
    }
    if (data.length > maxLength) throw new MaxLengthError({ maxLength })
  }

  const line = (text: string, start: number, end: number) => {
    if (start === end) return dispatch()
    if (end - start > maxLength) throw new MaxLengthError({ maxLength })
    const first = text.charCodeAt(start)
    if (first === COLON) return
    if (
      first === 100 &&
      text.charCodeAt(start + 1) === 97 &&
      text.charCodeAt(start + 2) === 116 &&
      text.charCodeAt(start + 3) === 97 &&
      text.charCodeAt(start + 4) === COLON
    ) {
      const from = text.charCodeAt(start + 5) === SPACE ? start + 6 : start + 5
      return appendData(text.slice(from, end))
    }
    if (first === 101 && text.startsWith('event:', start)) {
      type = text.slice(text.charCodeAt(start + 6) === SPACE ? start + 7 : start + 6, end)
      return
    }
    if (
      first === 105 &&
      text.charCodeAt(start + 1) === 100 &&
      text.charCodeAt(start + 2) === COLON
    ) {
      const value = text.slice(text.charCodeAt(start + 3) === SPACE ? start + 4 : start + 3, end)
      if (!value.includes('\0')) idBuffer = value
      return
    }
    const raw = text.slice(start, end)
    const colon = raw.indexOf(':')
    const field = colon === -1 ? raw : raw.slice(0, colon)
    const value =
      colon === -1 ? '' : raw.slice(raw.charCodeAt(colon + 1) === SPACE ? colon + 2 : colon + 1)
    switch (field) {
      case 'event':
        type = value
        break
      case 'data':
        appendData(value)
        break
      case 'id':
        if (!value.includes('\0')) idBuffer = value
        break
      case 'retry':
        if (isDigits(value)) reconnectionTime = retry = Number(value)
        break
    }
  }

  const lines = (text: string, from: number): number => {
    let start = from
    if (text.indexOf('\r', start) === -1) {
      for (let lf = text.indexOf('\n', start); lf !== -1; lf = text.indexOf('\n', start)) {
        line(text, start, lf)
        start = lf + 1
      }
      return start
    }
    let cr = text.indexOf('\r', start)
    let lf = text.indexOf('\n', start)
    for (;;) {
      if (cr !== -1 && cr < start) cr = text.indexOf('\r', start)
      if (lf !== -1 && lf < start) lf = text.indexOf('\n', start)
      const end = cr === -1 ? lf : lf === -1 || cr < lf ? cr : lf
      if (end === -1) return start
      line(text, start, end)
      start = end + 1
      if (end === cr) {
        if (start === text.length) skipLf = true
        else if (text.charCodeAt(start) === LF) start++
      }
    }
  }

  const keep = (text: string, from: number) => {
    if (from === text.length) return
    const rest = from === 0 ? text : text.slice(from)
    pending.push(rest)
    pendingLength += rest.length
    if (pendingLength > maxLength) throw new MaxLengthError({ maxLength })
  }

  return {
    push(chunk) {
      let text =
        typeof chunk === 'string'
          ? chunk
          : (decoder ??= new TextDecoder('utf-8', { ignoreBOM: true })).decode(chunk, {
              stream: true,
            })
      if (text === '') return
      if (!started) {
        started = true
        if (text.charCodeAt(0) === 0xfeff) text = text.slice(1)
      }
      let start = 0
      if (skipLf) {
        skipLf = false
        if (text.charCodeAt(0) === LF) start = 1
      }
      if (pending.length > 0) {
        const lf = text.indexOf('\n', start)
        const cr = text.indexOf('\r', start)
        const end = cr === -1 ? lf : lf === -1 || cr < lf ? cr : lf
        if (end === -1) return keep(text, start)
        pending.push(text.slice(start, end))
        const joined = pending.join('')
        pending = []
        pendingLength = 0
        line(joined, 0, joined.length)
        start = end + 1
        if (end === cr) {
          if (start === text.length) skipLf = true
          else if (text.charCodeAt(start) === LF) start++
        }
      }
      keep(text, lines(text, start))
    },
    end() {
      decoder?.decode()
      pending = []
      pendingLength = 0
      skipLf = false
      data = ''
      hasData = false
      type = ''
    },
    restart() {
      this.end()
      started = false
      idBuffer = lastId
    },
    get id() {
      return lastId
    },
    get retry() {
      return reconnectionTime
    },
  }
}

function isDigits(value: string): boolean {
  if (value === '') return false
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i)
    if (code < 48 || code > 57) return false
  }
  return true
}
