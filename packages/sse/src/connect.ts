import * as Timers from '@portable/timers'
import { createParser, type Event } from './decode.js'
import { MaxLengthError, ResponseError } from './errors.js'

export declare namespace connect {
  type Options = {
    /** Wait before each reconnect, until the server sends a `retry` field. @default { initial: 1000, max: 30_000 } */
    delay?: Timers.Delay | undefined
    /** Sends each request. Pass a wrapper to change a request before it is sent. @default globalThis.fetch */
    fetch?: ((request: Request) => Promise<Response>) | undefined
    /** Longest line, and longest `data` of one event, in UTF-16 code units. @default Infinity */
    maxLength?: number | undefined
    /**
     * Decides whether to reconnect after a connection ends, with the error and `{ attempt }`, the
     * number of reconnects since the last accepted response. `error` is `undefined` when the
     * response ended normally. Return `false` to close the stream, or to fail it with `error`.
     * @default (error) => !(error instanceof Sse.ResponseError || error instanceof Sse.MaxLengthError)
     */
    reconnectIf?:
      | ((error: unknown, retry: { attempt: number }) => boolean | PromiseLike<boolean>)
      | undefined
    /** Stops the stream, the request in flight and any wait, and fails the stream with `signal.reason`. */
    signal?: AbortSignal | undefined
  }
}

/**
 * Opens an event stream with `fetch` and returns its events, reconnecting with `Last-Event-ID`
 * when the response ends or fails, as `EventSource` does. Unlike `EventSource`, the request can
 * have any method, headers and body, and the events are a `ReadableStream` that can be piped and
 * cancelled. Cancelling it aborts the request in flight.
 *
 * Each attempt sends a clone of `request`, so a request body is sent again on every reconnect,
 * and a `fetch` wrapper can change the headers of each attempt.
 * A 204 response closes the stream. Any other status than 200, or a content type other than
 * `text/event-stream`, fails it with `ResponseError`.
 *
 * @example
 * ```ts
 * import * as Sse from '@portable/sse'
 *
 * const request = new Request('https://example.com/events', {
 *   method: 'POST',
 *   body: JSON.stringify({ topic: 'prices' }),
 * })
 * const events = Sse.connect(request, {
 *   // Each reconnect gets a fresh token.
 *   fetch: async (request) => {
 *     request.headers.set('authorization', `Bearer ${await getToken()}`)
 *     return fetch(request)
 *   },
 *   signal: AbortSignal.timeout(60_000),
 * })
 * const reader = events.getReader()
 * for (let r = await reader.read(); !r.done; r = await reader.read()) console.log(r.value.data)
 * ```
 */
export function connect(
  request: Request | string | URL,
  options: connect.Options = {},
): ReadableStream<Event> {
  const {
    delay = { initial: 1000, max: 30_000 },
    fetch = globalThis.fetch,
    maxLength,
    reconnectIf = reconnectByDefault,
    signal,
  } = options
  const next = Timers.backoff(delay)
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
      throw new ResponseError({ response, message: `Expected status 200, got ${response.status}.` })
    const type = response.headers.get('content-type')
    if (!isEventStream(type))
      throw new ResponseError({
        response,
        message: `Expected content type text/event-stream, got ${type}.`,
      })
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
        if (!(await reconnectIf(error, { attempt }))) {
          if (error === undefined) return controller.close()
          throw error
        }
        if (error instanceof ResponseError) await error.response.body?.cancel()
        await Timers.sleep(parser.retry ?? next({ attempt, error }), { signal: combined })
      }
    },
    async cancel(reason) {
      aborter.abort(reason)
      await reader?.cancel(reason).catch(() => {})
    },
  })
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
