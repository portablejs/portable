import * as Sse from '@portable/sse'
import * as Streams from '@portable/streams'

export function decodeChunks(
  chunks: readonly (Uint8Array | string)[],
  options?: Sse.DecoderStream.Options,
): Promise<Sse.Event[]> {
  return Streams.toArray(Streams.fromIterable(chunks).pipeThrough(new Sse.DecoderStream(options)))
}

export function datas(events: readonly Sse.Event[]): string[] {
  return events.map((event) => event.data)
}

export async function encodeMessages(messages: readonly Sse.Message[]): Promise<string> {
  return Streams.toText(Streams.fromIterable(messages).pipeThrough(new Sse.EncoderStream()))
}

export const utf8 = (text: string): Uint8Array<ArrayBuffer> => new TextEncoder().encode(text)

export function chunked(bytes: Uint8Array, size: number): Uint8Array[] {
  const chunks = new Array<Uint8Array>()
  for (let i = 0; i < bytes.length; i += size) chunks.push(bytes.subarray(i, i + size))
  return chunks
}

export function seededRandom(seed: number): () => number {
  let state = seed
  return () => {
    state = (state * 1103515245 + 12345) % 2 ** 31
    return state / 2 ** 31
  }
}

export function randomChunks<value extends Uint8Array | string>(
  input: value,
  seed: number,
  maxSize = 64,
): value[] {
  const random = seededRandom(seed)
  const chunks = new Array<value>()
  for (let i = 0; i < input.length;) {
    const size = 1 + Math.floor(random() * maxSize)
    chunks.push(input.slice(i, i + size) as value)
    i += size
  }
  return chunks
}

export type Body = {
  /** Chunks to send, each as text or bytes. */
  chunks?: readonly (string | Uint8Array)[]
  /** What happens after the last chunk: the body ends, fails with this error, or never ends. */
  end?: 'close' | 'hang' | Error
}

export type Reply = Body & {
  status?: number
  contentType?: string | null
}

export type MockFetch = {
  fetch: (request: Request) => Promise<Response>
  /** Every request sent, in order, with its body read as text. */
  requests: { request: Request; body: string }[]
  /** Resolves once this many requests have been sent. */
  calls(count: number): Promise<void>
  /** How many response bodies were cancelled or aborted before they ended. */
  cancelled: number
}

/**
 * A `fetch` that answers each request with the next reply. A reply can also be an error,
 * which `fetch` rejects with. After the last reply, every request gets a body that never ends.
 * Aborting a request's signal fails its pending response body, as a real `fetch` does.
 */
export function mockFetch(replies: readonly (Reply | Error)[]): MockFetch {
  const waiting = new Array<{ count: number; resolve: () => void }>()
  const mock: MockFetch = {
    requests: [],
    cancelled: 0,
    calls(count) {
      if (mock.requests.length >= count) return Promise.resolve()
      return new Promise((resolve) => waiting.push({ count, resolve }))
    },
    async fetch(request) {
      const body = await request.text()
      mock.requests.push({ request, body })
      for (const w of waiting.filter((w) => w.count <= mock.requests.length)) w.resolve()
      request.signal.throwIfAborted()
      const reply = replies[mock.requests.length - 1] ?? { end: 'hang' }
      if (reply instanceof Error) throw reply
      const { status = 200, contentType = 'text/event-stream' } = reply
      const headers = new Headers()
      if (contentType !== null) headers.set('content-type', contentType)
      const nullBody = status === 204 || status === 205 || status === 304
      return new Response(nullBody ? null : bodyStream(reply, request.signal, mock), {
        status,
        headers,
      })
    },
  }
  return mock
}

function bodyStream(body: Body, signal: AbortSignal, mock: MockFetch): ReadableStream<Uint8Array> {
  const { chunks = [], end = 'close' } = body
  let i = 0
  let finished = false
  return new ReadableStream<Uint8Array>({
    start(controller) {
      signal.addEventListener('abort', () => {
        if (finished) return
        finished = true
        mock.cancelled++
        controller.error(signal.reason)
      })
    },
    async pull(controller) {
      await new Promise((resolve) => setTimeout(resolve, 0))
      if (finished) return
      const chunk = chunks[i++]
      if (chunk !== undefined)
        return controller.enqueue(typeof chunk === 'string' ? utf8(chunk) : chunk)
      if (end === 'hang') return new Promise(() => {})
      finished = true
      if (end === 'close') controller.close()
      else controller.error(end)
    },
    cancel() {
      if (finished) return
      finished = true
      mock.cancelled++
    },
  })
}
