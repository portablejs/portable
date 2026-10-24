import { describe, expect, test, vi } from 'vite-plus/test'
import * as Sse from '@portable/sse'
import * as Streams from '@portable/streams'
import { datas, mockFetch } from './utils.js'

// Firefox has no `Request.prototype.body` and sends a ReadableStream request body as text.
const streamBodies = 'body' in Request.prototype

const url = 'https://example.com/events'

async function take(stream: ReadableStream<Sse.Event>, count: number): Promise<Sse.Event[]> {
  const reader = stream.getReader()
  const events: Sse.Event[] = []
  while (events.length < count) {
    const { done, value } = await reader.read()
    if (done) {
      break
    }
    events.push(value)
  }
  await reader.cancel()
  return events
}

describe('connect', () => {
  test('reads events from the response', async () => {
    const mock = mockFetch([{ chunks: ['event: welcome\ndata: Hello, world!\n\n'] }])
    const [event] = await take(Sse.connect(url, { fetch: mock.fetch }), 1)
    expect(event).toEqual({
      event: 'welcome',
      data: 'Hello, world!',
      id: undefined,
      retry: undefined,
    })
  })

  test('accepts a URL string, a URL and a Request', async () => {
    for (const input of [url, new URL(url), new Request(url)]) {
      const mock = mockFetch([{ chunks: ['data: x\n\n'] }])
      expect(await take(Sse.connect(input, { fetch: mock.fetch }), 1)).toHaveLength(1)
      expect(mock.requests[0]!.request.url).toBe(url)
    }
  })

  test('uses globalThis.fetch by default', async () => {
    const mock = mockFetch([{ chunks: ['data: x\n\n'] }])
    vi.stubGlobal('fetch', mock.fetch)
    try {
      expect(datas(await take(Sse.connect(url), 1))).toEqual(['x'])
    } finally {
      vi.unstubAllGlobals()
    }
  })

  test('sends Accept: text/event-stream unless the request sets Accept', async () => {
    const mock = mockFetch([{ chunks: ['data: x\n\n'] }, { chunks: ['data: x\n\n'] }])
    await take(Sse.connect(url, { fetch: mock.fetch }), 1)
    await take(
      Sse.connect(
        new Request(url, { headers: { accept: 'application/x-ndjson, text/event-stream' } }),
        {
          fetch: mock.fetch,
        },
      ),
      1,
    )
    expect(mock.requests.map((r) => r.request.headers.get('accept'))).toEqual([
      'text/event-stream',
      'application/x-ndjson, text/event-stream',
    ])
  })

  test('sends the method, headers and body of the request on every attempt', async () => {
    const mock = mockFetch([{ chunks: ['id: 1\ndata: a\n\n'] }, { chunks: ['data: b\n\n'] }])
    const request = new Request(url, {
      method: 'POST',
      headers: { authorization: 'Bearer foo', 'content-type': 'application/json' },
      body: JSON.stringify({ prompt: 'hi' }),
    })
    const events = await take(Sse.connect(request, { fetch: mock.fetch, delay: 0 }), 2)
    expect(datas(events)).toEqual(['a', 'b'])
    for (const { request, body } of mock.requests) {
      expect(request.method).toBe('POST')
      expect(request.headers.get('authorization')).toBe('Bearer foo')
      expect(body).toBe('{"prompt":"hi"}')
    }
    expect(mock.requests[1]!.request.headers.get('last-event-id')).toBe('1')
  })

  test.runIf(streamBodies)('sends a stream body again on every attempt', async () => {
    const mock = mockFetch([{ chunks: ['data: a\n\n'] }, { chunks: ['data: b\n\n'] }])
    const body = Streams.fromIterable(['{"prompt":', '"hi"}']).pipeThrough(new TextEncoderStream())
    const request = new Request(url, { method: 'POST', body, duplex: 'half' } as RequestInit)
    await take(Sse.connect(request, { fetch: mock.fetch, delay: 0 }), 2)
    expect(mock.requests.map((r) => r.body)).toEqual(['{"prompt":"hi"}', '{"prompt":"hi"}'])
  })

  test('leaves the caller’s request unread', async () => {
    const mock = mockFetch([{ chunks: ['data: a\n\n'] }])
    const request = new Request(url, { method: 'POST', body: 'payload' })
    await take(Sse.connect(request, { fetch: mock.fetch }), 1)
    expect(request.bodyUsed).toBe(false)
    expect(await request.text()).toBe('payload')
  })

  test('throws a TypeError for a request whose body was already read', async () => {
    const request = new Request(url, { method: 'POST', body: 'payload' })
    await request.text()
    expect(() => Sse.connect(request)).toThrow(TypeError)
  })

  test('a fetch wrapper can change each request', async () => {
    const mock = mockFetch([{ chunks: ['data: a\n\n'] }, { chunks: ['data: b\n\n'] }])
    let token = 0
    const events = await take(
      Sse.connect(url, {
        delay: 0,
        fetch: (request) => {
          request.headers.set('authorization', `Bearer ${++token}`)
          return mock.fetch(request)
        },
      }),
      2,
    )
    expect(datas(events)).toEqual(['a', 'b'])
    expect(mock.requests.map((r) => r.request.headers.get('authorization'))).toEqual([
      'Bearer 1',
      'Bearer 2',
    ])
  })
})

describe('reconnecting', () => {
  test('reconnects when the response ends, with the last event ID', async () => {
    const mock = mockFetch([
      {
        chunks: [
          'retry: 1\nid: 1\nevent: counter\ndata: 1\n\n',
          'id: 2\nevent: counter\ndata: 2\n\n',
        ],
      },
      { chunks: ['id: 3\nevent: counter\ndata: 3\n\n'] },
    ])
    const events = await take(Sse.connect(url, { fetch: mock.fetch }), 3)
    expect(events.map((e) => [e.data, e.id])).toEqual([
      ['1', '1'],
      ['2', '2'],
      ['3', '3'],
    ])
    expect(mock.requests[0]!.request.headers.has('last-event-id')).toBe(false)
    expect(mock.requests[1]!.request.headers.get('last-event-id')).toBe('2')
  })

  test('reconnects when the response fails mid-stream', async () => {
    const mock = mockFetch([
      {
        chunks: ['id: 1\ndata: a\n\nid: 2\ndata: never fini'],
        end: new TypeError('network error'),
      },
      { chunks: ['data: b\n\n'] },
    ])
    const events = await take(Sse.connect(url, { fetch: mock.fetch, delay: 0 }), 2)
    expect(datas(events)).toEqual(['a', 'b'])
    expect(mock.requests[1]!.request.headers.get('last-event-id')).toBe('1')
  })

  test('reconnects when fetch rejects', async () => {
    const mock = mockFetch([new TypeError('fetch failed'), { chunks: ['data: a\n\n'] }])
    expect(datas(await take(Sse.connect(url, { fetch: mock.fetch, delay: 0 }), 1))).toEqual(['a'])
  })

  test('reconnects when a 200 response has no body', async () => {
    const mock = mockFetch([{ status: 200 }, { chunks: ['data: a\n\n'] }])
    const fetch = async (request: Request) => {
      const response = await mock.fetch(request)
      return mock.requests.length === 1
        ? new Response(null, { status: 200, headers: response.headers })
        : response
    }
    expect(datas(await take(Sse.connect(url, { fetch, delay: 0 }), 1))).toEqual(['a'])
  })

  test('an ID from a block without data is used for reconnecting and later events', async () => {
    const mock = mockFetch([{ chunks: ['id: 42\n\n'] }, { chunks: ['data: Reconnected\n\n'] }])
    const [event] = await take(Sse.connect(url, { fetch: mock.fetch, delay: 0 }), 1)
    expect(event).toMatchObject({ data: 'Reconnected', id: '42' })
    expect(mock.requests[1]!.request.headers.get('last-event-id')).toBe('42')
  })

  test('the last event ID persists across connections', async () => {
    const mock = mockFetch([
      { chunks: ['id: …\ndata: hello\n\n'] },
      { chunks: ['data: again\n\n'] },
    ])
    const events = await take(Sse.connect(url, { fetch: mock.fetch, delay: 0 }), 2)
    expect(events.map((e) => e.id)).toEqual(['…', '…'])
  })

  test('an ID in an event without its blank line is not used', async () => {
    const mock = mockFetch([
      { chunks: ['retry: 1\ndata:test1\n\nid:test\ndata:test2\n'] },
      { chunks: ['data: test1\n\n'] },
    ])
    const events = await take(Sse.connect(url, { fetch: mock.fetch }), 2)
    expect(events.map((e) => [e.data, e.id])).toEqual([
      ['test1', undefined],
      ['test1', undefined],
    ])
    expect(mock.requests[1]!.request.headers.has('last-event-id')).toBe(false)
  })

  test('an empty id field stops sending Last-Event-ID', async () => {
    const mock = mockFetch([
      { chunks: ['id: 1\ndata: a\n\nid\ndata: b\n\n'] },
      { chunks: ['data: c\n\n'] },
    ])
    const request = new Request(url, { headers: { 'last-event-id': 'from-caller' } })
    await take(Sse.connect(request, { fetch: mock.fetch, delay: 0 }), 3)
    expect(mock.requests[0]!.request.headers.get('last-event-id')).toBe('from-caller')
    expect(mock.requests[1]!.request.headers.has('last-event-id')).toBe(false)
  })

  test('keeps the caller’s Last-Event-ID until the server sends an id', async () => {
    const mock = mockFetch([{ chunks: ['data: a\n\n'] }, { chunks: ['data: b\n\n'] }])
    const request = new Request(url, { headers: { 'last-event-id': '7' } })
    await take(Sse.connect(request, { fetch: mock.fetch, delay: 0 }), 2)
    expect(mock.requests.map((r) => r.request.headers.get('last-event-id'))).toEqual(['7', '7'])
  })

  test.each([
    ['Latin-1', 'café', 'caf\xc3\xa9'],
    ['beyond Latin-1', 'café-€1', 'caf\xc3\xa9-\xe2\x82\xac1'],
    ['outside the BMP', 'id-😀', 'id-\xf0\x9f\x98\x80'],
  ])('sends a %s ID as UTF-8 bytes', async (_name, id, header) => {
    const mock = mockFetch([{ chunks: [`id: ${id}\ndata: a\n\n`] }, { chunks: ['data: b\n\n'] }])
    const events = await take(Sse.connect(url, { fetch: mock.fetch, delay: 0 }), 2)
    expect(events[1]!.id).toBe(id)
    expect(mock.requests[1]!.request.headers.get('last-event-id')).toBe(header)
  })

  test('ignores an ID containing NUL', async () => {
    const mock = mockFetch([{ chunks: ['id: x\0\ndata: a\n\n'] }, { chunks: ['data: b\n\n'] }])
    await take(Sse.connect(url, { fetch: mock.fetch, delay: 0 }), 2)
    expect(mock.requests[1]!.request.headers.has('last-event-id')).toBe(false)
  })

  test('strips a BOM at the start of each response, and drops an unfinished event', async () => {
    const bom = String.fromCharCode(0xfeff)
    const mock = mockFetch([
      { chunks: [`${bom}data: a\n\ndata: unfinished`] },
      { chunks: [`${bom}data: b\n\n`] },
    ])
    expect(datas(await take(Sse.connect(url, { fetch: mock.fetch, delay: 0 }), 2))).toEqual([
      'a',
      'b',
    ])
  })

  test('a CR at the end of one response does not swallow an LF at the start of the next', async () => {
    const mock = mockFetch([{ chunks: ['data: a\r\r'] }, { chunks: ['\ndata: b\n\n'] }])
    expect(datas(await take(Sse.connect(url, { fetch: mock.fetch, delay: 0 }), 2))).toEqual([
      'a',
      'b',
    ])
  })
})

describe('delay', () => {
  test('waits for the server’s retry field instead of delay', async () => {
    const mock = mockFetch([{ chunks: ['retry: 1\ndata: a\n\n'] }, { chunks: ['data: b\n\n'] }])
    const events = await take(Sse.connect(url, { fetch: mock.fetch, delay: 60_000 }), 2)
    expect(datas(events)).toEqual(['a', 'b'])
  })

  test('reads retry digits in base 10 and ignores other values', async () => {
    const mock = mockFetch([
      { chunks: ['retry: 0001\nretry: 60000x\ndata: a\n\n'] },
      { chunks: ['data: b\n\n'] },
    ])
    const events = await take(Sse.connect(url, { fetch: mock.fetch, delay: 60_000 }), 2)
    expect(events[0]!.retry).toBe(1)
  })

  test('waits at least the retry time', async () => {
    const mock = mockFetch([{ chunks: ['retry: 50\ndata: a\n\n'] }, { chunks: ['data: b\n\n'] }])
    const reader = Sse.connect(url, { fetch: mock.fetch }).getReader()
    await reader.read()
    const start = performance.now()
    await reader.read()
    expect(performance.now() - start).toBeGreaterThanOrEqual(45)
    await reader.cancel()
  })

  test('calls a delay function with the attempt and the error', async () => {
    const network = new TypeError('network error')
    const mock = mockFetch([
      { chunks: ['data: a\n\n'] },
      network,
      network,
      { chunks: ['data: b\n\n'] },
      { chunks: ['data: c\n\n'] },
    ])
    const calls: [number, unknown][] = []
    const delay = ({ attempt, error }: { attempt: number; error?: unknown }) => {
      calls.push([attempt, error])
      return 0
    }
    await take(Sse.connect(url, { fetch: mock.fetch, delay }), 3)
    expect(calls).toEqual([
      [1, undefined],
      [2, network],
      [3, network],
      [1, undefined],
    ])
  })

  test('backs off within { initial, max }', async () => {
    const mock = mockFetch([new TypeError('a'), new TypeError('b'), { chunks: ['data: x\n\n'] }])
    const events = await take(
      Sse.connect(url, { fetch: mock.fetch, delay: { initial: 5, max: 10, jitter: false } }),
      1,
    )
    expect(datas(events)).toEqual(['x'])
  })
})

describe('when to stop', () => {
  test('a 204 response closes the stream without reconnecting', async () => {
    const mock = mockFetch([
      { chunks: ['retry: 1\nevent: progress\nid: prct-100\ndata: 100%\n\n'] },
      { status: 204 },
    ])
    const events = await Streams.toArray(Sse.connect(url, { fetch: mock.fetch }))
    expect(events).toEqual([{ event: 'progress', data: '100%', id: 'prct-100', retry: 1 }])
    expect(mock.requests).toHaveLength(2)
  })

  test.each([205, 210, 299, 403, 404, 410, 503])(
    'a %i response fails the stream with ResponseError, without reconnecting',
    async (status) => {
      const mock = mockFetch([{ status, chunks: ['{"error":"nope"}'] }])
      const error = await Streams.toArray(Sse.connect(url, { fetch: mock.fetch })).catch(
        (e: unknown) => e,
      )
      expect(error).toBeInstanceOf(Sse.ResponseError)
      expect((error as Sse.ResponseError).response.status).toBe(status)
      expect((error as Sse.ResponseError).name).toBe('Sse.ResponseError')
      expect(mock.requests).toHaveLength(1)
    },
  )

  test('the ResponseError keeps the body for the caller to read', async () => {
    const mock = mockFetch([
      { status: 429, contentType: 'application/json', chunks: ['{"error":"slow down"}'] },
    ])
    const error = await Streams.toArray(Sse.connect(url, { fetch: mock.fetch })).catch(
      (e: unknown) => e,
    )
    expect(await (error as Sse.ResponseError).response.json()).toEqual({ error: 'slow down' })
  })

  test.each([
    ['Text/Event-Stream', true],
    ['TEXT/EVENT-STREAM; charset=utf-8', true],
    ['text/event-stream;charset=utf-8', true],
    [' \ttext/event-stream\t ; charset=iso-8859-1', true],
    ['text/event-stream; note="a,b"', true],
    ['text/event-stream;', true],
    ['text/event-streaming', false],
    ['text/event-stream+json', false],
    ['text/event-stream/extra', false],
    ['text/event-stream garbage', false],
    ['text /event-stream', false],
    ['text/ event-stream', false],
    ['text/x-bogus', false],
    ['x bogus', false],
    [null, false],
  ])('checks the content type %j', async (contentType, valid) => {
    const mock = mockFetch([{ contentType, chunks: ['data: welcome\n\n'] }])
    const result = await take(Sse.connect(url, { fetch: mock.fetch }), 1).catch((e: unknown) => e)
    const outcome =
      result instanceof Sse.ResponseError ? 'rejected' : (result as Sse.Event[])[0]?.data
    expect(outcome).toBe(valid ? 'welcome' : 'rejected')
  })

  test('the content type with a non-breaking space is rejected', async () => {
    const mock = mockFetch([
      { contentType: `text/event-stream${String.fromCharCode(0xa0)}; charset=utf-8`, chunks: [] },
    ])
    await expect(Streams.toArray(Sse.connect(url, { fetch: mock.fetch }))).rejects.toThrow(
      Sse.ResponseError,
    )
  })

  test('reconnectIf can stop after the response ends', async () => {
    const mock = mockFetch([{ chunks: ['data: token 1\n\ndata: [DONE]\n\n'] }])
    const events = await Streams.toArray(
      Sse.connect(new Request(url, { method: 'POST', body: '{}' }), {
        fetch: mock.fetch,
        reconnectIf: () => false,
      }),
    )
    expect(datas(events)).toEqual(['token 1', '[DONE]'])
    expect(mock.requests).toHaveLength(1)
  })

  test('reconnectIf can stop on an error, which fails the stream', async () => {
    const network = new TypeError('network error')
    const mock = mockFetch([network])
    await expect(
      Streams.toArray(Sse.connect(url, { fetch: mock.fetch, reconnectIf: () => false })),
    ).rejects.toBe(network)
  })

  test('reconnectIf can retry a 503, and the rejected body is cancelled', async () => {
    const mock = mockFetch([
      { status: 503, chunks: ['busy'], end: 'hang' },
      { chunks: ['data: a\n\n'] },
    ])
    const reconnectIf = vi.fn<(error: unknown, retry: { attempt: number }) => boolean>(
      (error: unknown) => !(error instanceof Sse.ResponseError) || error.response.status >= 500,
    )
    const events = await take(Sse.connect(url, { fetch: mock.fetch, delay: 0, reconnectIf }), 1)
    expect(datas(events)).toEqual(['a'])
    expect(reconnectIf).toHaveBeenCalledWith(expect.any(Sse.ResponseError), { attempt: 1 })
    expect(mock.cancelled).toBeGreaterThanOrEqual(1)
  })

  test('maxLength fails the stream without reconnecting', async () => {
    const mock = mockFetch([{ chunks: ['retry: 1\n', `data: ${'x'.repeat(32)}\n`] }])
    await expect(
      Streams.toArray(Sse.connect(url, { fetch: mock.fetch, maxLength: 16 })),
    ).rejects.toThrow(Sse.MaxLengthError)
    expect(mock.requests).toHaveLength(1)
    expect(mock.cancelled).toBe(1)
  })
})

describe('idleTimeout', () => {
  test('reconnects when the body sends nothing for idleTimeout ms', async () => {
    const mock = mockFetch([
      { chunks: ['id: 1\ndata: a\n\n'], end: 'hang' },
      { chunks: ['data: b\n\n'] },
    ])
    const reconnectIf = vi.fn<(error: unknown, retry: { attempt: number }) => boolean>(() => true)
    const events = await take(
      Sse.connect(url, { fetch: mock.fetch, delay: 0, idleTimeout: 30, reconnectIf }),
      2,
    )
    expect(datas(events)).toEqual(['a', 'b'])
    expect(mock.requests[0]!.request.signal.aborted).toBe(true)
    expect(mock.requests[1]!.request.headers.get('last-event-id')).toBe('1')
    expect(reconnectIf).toHaveBeenCalledWith(expect.objectContaining({ name: 'TimeoutError' }), {
      attempt: 1,
    })
  })

  test('reconnects when fetch does not respond within idleTimeout ms', async () => {
    const mock = mockFetch([{ chunks: ['data: b\n\n'] }])
    let first = true
    const fetch = (request: Request) => {
      if (first) {
        first = false
        return new Promise<Response>((_, reject) => {
          request.signal.addEventListener('abort', () => reject(request.signal.reason))
        })
      }
      return mock.fetch(request)
    }
    const events = await take(Sse.connect(url, { fetch, delay: 0, idleTimeout: 30 }), 1)
    expect(datas(events)).toEqual(['b'])
  })

  test('comment lines keep the connection open', async () => {
    const chunks = [': ping\n', ': ping\n', ': ping\n', ': ping\n', 'data: a\n\n']
    const mock = mockFetch([{ chunks }])
    const slow = async (request: Request) => {
      const response = await mock.fetch(request)
      const body = response.body!.pipeThrough(
        new TransformStream({
          async transform(chunk, controller) {
            await new Promise((resolve) => setTimeout(resolve, 20))
            controller.enqueue(chunk)
          },
        }),
      )
      return new Response(body, { headers: response.headers })
    }
    const events = await take(Sse.connect(url, { fetch: slow, idleTimeout: 60 }), 1)
    expect(datas(events)).toEqual(['a'])
    expect(mock.requests).toHaveLength(1)
  })

  test('a timeout fails the stream when reconnectIf returns false', async () => {
    const mock = mockFetch([{ chunks: [], end: 'hang' }])
    await expect(
      Streams.toArray(
        Sse.connect(url, { fetch: mock.fetch, idleTimeout: 20, reconnectIf: () => false }),
      ),
    ).rejects.toMatchObject({ name: 'TimeoutError' })
  })

  test('throws a RangeError for an idleTimeout that is not positive', () => {
    for (const idleTimeout of [0, -1, Number.NaN]) {
      expect(() => Sse.connect(url, { idleTimeout })).toThrow(RangeError)
    }
  })
})

describe('cancelling', () => {
  test('cancelling the stream aborts the response in flight', async () => {
    const mock = mockFetch([{ chunks: ['data: a\n\n'], end: 'hang' }])
    const reader = Sse.connect(url, { fetch: mock.fetch }).getReader()
    await reader.read()
    await reader.cancel()
    expect(mock.requests[0]!.request.signal.aborted).toBe(true)
    expect(mock.cancelled).toBe(1)
  })

  test('cancelling the stream while it waits stops reconnecting', async () => {
    const mock = mockFetch([{ chunks: ['data: a\n\n'] }])
    const reader = Sse.connect(url, { fetch: mock.fetch, delay: 50 }).getReader()
    await reader.read()
    const next = reader.read()
    await new Promise((resolve) => setTimeout(resolve, 10))
    await reader.cancel()
    expect(await next).toEqual({ done: true, value: undefined })
    await new Promise((resolve) => setTimeout(resolve, 100))
    expect(mock.requests).toHaveLength(1)
  })

  test('the signal aborts the response in flight and fails the stream with its reason', async () => {
    const controller = new AbortController()
    const mock = mockFetch([{ chunks: ['data: a\n\n'], end: 'hang' }])
    const reader = Sse.connect(url, { fetch: mock.fetch, signal: controller.signal }).getReader()
    await reader.read()
    const next = reader.read()
    const reason = new Error('stop')
    controller.abort(reason)
    await expect(next).rejects.toBe(reason)
    expect(mock.requests[0]!.request.signal.aborted).toBe(true)
  })

  test('the signal stops a wait between attempts', async () => {
    const controller = new AbortController()
    const mock = mockFetch([{ chunks: ['data: a\n\n'] }])
    const reader = Sse.connect(url, {
      fetch: mock.fetch,
      signal: controller.signal,
      delay: 60_000,
    }).getReader()
    await reader.read()
    const next = reader.read()
    await new Promise((resolve) => setTimeout(resolve, 10))
    controller.abort()
    await expect(next).rejects.toMatchObject({ name: 'AbortError' })
    expect(mock.requests).toHaveLength(1)
  })

  test('an aborted signal fails the stream before any request', async () => {
    const mock = mockFetch([{ chunks: ['data: a\n\n'] }])
    const reason = new Error('already')
    await expect(
      Streams.toArray(Sse.connect(url, { fetch: mock.fetch, signal: AbortSignal.abort(reason) })),
    ).rejects.toBe(reason)
  })

  test('the request’s own signal also aborts', async () => {
    const controller = new AbortController()
    const mock = mockFetch([{ chunks: ['data: a\n\n'], end: 'hang' }])
    const reader = Sse.connect(new Request(url, { signal: controller.signal }), {
      fetch: mock.fetch,
    }).getReader()
    await reader.read()
    const next = reader.read()
    controller.abort()
    await expect(next).rejects.toMatchObject({ name: 'AbortError' })
  })
})
