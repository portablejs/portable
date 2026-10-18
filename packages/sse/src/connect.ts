import { createParser, type Event, MaxLengthError } from './decode.js'

export declare namespace connect {
  /**
   * How long to wait before reconnecting: a fixed number of milliseconds, exponential backoff, or a
   * function of the reconnect attempt (1 for the first since the last accepted response) and the
   * error that ended the previous connection.
   */
  type Delay =
    | number
    | {
        /** Cap for the first wait, in ms. */
        initial: number
        /** Largest wait, in ms. */
        max: number
        /** Growth of the cap per attempt. @default 2 */
        factor?: number | undefined
        /** Wait a random time between 0 and the cap. With `false`, wait exactly the cap. @default true */
        jitter?: boolean | undefined
      }
    | ((attempt: number, error?: unknown) => number)

  type Options = {
    /** Wait before each reconnect, until the server sends a `retry` field. @default { initial: 1000, max: 30_000 } */
    delay?: Delay | undefined
    /** Sends each request. Pass a wrapper to change a request before it is sent. @default globalThis.fetch */
    fetch?: ((request: Request) => Promise<Response>) | undefined
    /** Longest line, and longest `data` of one event, in UTF-16 code units. @default Infinity */
    maxLength?: number | undefined
    /**
     * Decides whether to reconnect after a connection ends. `error` is `undefined` when the
     * response ended normally. Return `false` to close the stream, or to fail it with `error`.
     * @default (error) => !(error instanceof Sse.ResponseError || error instanceof Sse.MaxLengthError)
     */
    reconnectIf?: ((error: unknown, attempt: number) => boolean | PromiseLike<boolean>) | undefined
    /** Stops the stream, the request in flight and any wait, and fails the stream with `signal.reason`. */
    signal?: AbortSignal | undefined
  }
}

const defaultDelay: connect.Delay = { initial: 1000, max: 30_000 }

/**
 * Opens an event stream with `fetch` and returns its events, reconnecting with `Last-Event-ID`
 * when the response ends or fails, as `EventSource` does. Unlike `EventSource`, the request can
 * have any method, headers and body, and the events are a `ReadableStream` that can be piped and
 * cancelled. Cancelling it aborts the request in flight.
 *
 * Each attempt sends a clone of `request`, so a request body is sent again on every reconnect.
 * A 204 response closes the stream. Any other status than 200, or a content type other than
 * `text/event-stream`, fails it with `ResponseError`.
 *
 * @example
 * ```ts
 * import * as Sse from '@portable/sse'
 *
 * const request = new Request('https://example.com/events', {
 *   method: 'POST',
 *   headers: { authorization: `Bearer ${token}` },
 *   body: JSON.stringify({ topic: 'prices' }),
 * })
 * const reader = Sse.connect(request, { signal: AbortSignal.timeout(60_000) }).getReader()
 * for (let r = await reader.read(); !r.done; r = await reader.read()) console.log(r.value.data)
 * ```
 */
export function connect(
  request: Request | string | URL,
  options: connect.Options = {},
): ReadableStream<Event> {
  const {
    delay = defaultDelay,
    fetch = globalThis.fetch,
    maxLength,
    reconnectIf = reconnectByDefault,
    signal,
  } = options
  const base = request instanceof Request ? request.clone() : new Request(request)
  const aborter = new AbortController()
  const combined = AbortSignal.any(
    signal ? [aborter.signal, signal, base.signal] : [aborter.signal, base.signal],
  )
  let enqueued = false
  let output: ReadableStreamDefaultController<Event>
  const parser = createParser((event) => {
    output.enqueue(event)
    enqueued = true
  }, maxLength)
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined
  let attempt = 0

  const open = async (): Promise<ReadableStreamDefaultReader<Uint8Array> | undefined> => {
    const headers = new Headers(base.headers)
    if (!headers.has('accept')) headers.set('accept', 'text/event-stream')
    const id = parser.id
    if (id === '') headers.delete('last-event-id')
    else if (id !== undefined) headers.set('last-event-id', toByteString(id))
    const response = await fetch(new Request(base.clone(), { headers, signal: combined }))
    if (response.status === 204) {
      await response.body?.cancel()
      return undefined
    }
    if (response.status !== 200)
      throw new ResponseError(response, `Expected status 200, got ${response.status}.`)
    const type = response.headers.get('content-type')
    if (!isEventStream(type))
      throw new ResponseError(response, `Expected content type text/event-stream, got ${type}.`)
    attempt = 0
    parser.restart()
    return (response.body ?? new ReadableStream({ start: (c) => c.close() })).getReader()
  }

  return new ReadableStream<Event>({
    start(controller) {
      output = controller
    },
    async pull(controller) {
      for (;;) {
        let error: unknown
        try {
          if (!reader) {
            reader = await open()
            if (!reader) return controller.close()
          }
          const { done, value } = await reader.read()
          if (!done) {
            enqueued = false
            parser.push(value)
            if (enqueued) return
            continue
          }
        } catch (e) {
          error = e
        }
        if (combined.aborted) throw combined.reason
        if (error !== undefined) await reader?.cancel(error).catch(() => {})
        reader = undefined
        parser.end()
        attempt++
        if (!(await reconnectIf(error, attempt))) {
          if (error === undefined) return controller.close()
          throw error
        }
        if (error instanceof ResponseError) await error.response.body?.cancel()
        await sleep(parser.retry ?? delayFor(delay, attempt, error), combined)
      }
    },
    async cancel(reason) {
      aborter.abort(reason)
      await reader?.cancel(reason).catch(() => {})
    },
  })
}

/** Thrown by `connect` for a response that isn't an event stream. */
export class ResponseError extends Error {
  override name = 'Sse.ResponseError'
  /** The rejected response. Its body is not read, so read or cancel it when you're done. */
  readonly response: Response
  constructor(response: Response, message: string) {
    super(message)
    this.response = response
  }
}

function reconnectByDefault(error: unknown): boolean {
  return !(error instanceof ResponseError || error instanceof MaxLengthError)
}

const httpWhitespace = /^[\t\n\r ]+|[\t\n\r ]+$/g

function isEventStream(contentType: string | null): boolean {
  if (contentType === null) return false
  const semicolon = contentType.indexOf(';')
  const essence = semicolon === -1 ? contentType : contentType.slice(0, semicolon)
  return essence.replace(httpWhitespace, '').toLowerCase() === 'text/event-stream'
}

// HTTP header values are byte strings, so a non-ASCII ID is sent as its UTF-8 bytes.
function toByteString(text: string): string {
  if (!/[^\0-\x7f]/.test(text)) return text
  let bytes = ''
  for (const byte of new TextEncoder().encode(text)) bytes += String.fromCharCode(byte)
  return bytes
}

function delayFor(delay: connect.Delay, attempt: number, error: unknown): number {
  if (typeof delay === 'number') return delay
  if (typeof delay === 'function') return delay(attempt, error)
  const { initial, max, factor = 2, jitter = true } = delay
  const cap = Math.min(max, initial * factor ** (attempt - 1))
  return jitter ? Math.random() * cap : cap
}

const maxTimeout = 2 ** 31 - 1

async function sleep(ms: number, signal: AbortSignal): Promise<void> {
  for (let remaining = ms; remaining > 0; remaining -= maxTimeout) {
    await new Promise<void>((resolve, reject) => {
      const onAbort = () => {
        clearTimeout(timer)
        reject(signal.reason)
      }
      const timer = setTimeout(
        () => {
          signal.removeEventListener('abort', onAbort)
          resolve()
        },
        Math.min(remaining, maxTimeout),
      )
      if (signal.aborted) onAbort()
      else signal.addEventListener('abort', onAbort, { once: true })
    })
  }
}
