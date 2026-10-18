import * as Rpc from '@portable/rpc'
import * as Streams from '@portable/streams'
import { describe, expect, test } from 'vite-plus/test'
import { deferred, fetcher } from './utils.js'

const api = {
  add: (a: number, b: number) => a + b,
  fail() {
    throw new Rpc.RemoteError({ code: 1, message: 'nope' })
  },
  async *count(n: number) {
    for (let i = 0; i < n; i++) yield i
  },
}

const url = 'https://example.com/rpc'
const post = (body: string) => new Request(url, { method: 'POST', body })

describe('handler', () => {
  test('answers a request with a JSON response', async () => {
    const response = await Rpc.handler(api)(
      post('{"jsonrpc":"2.0","id":1,"method":"add","params":[1,2]}'),
    )
    expect(response.headers.get('content-type')).toMatch(/^application\/json/)
    expect(await response.json()).toEqual({ jsonrpc: '2.0', id: 1, result: 3 })
  })

  test('answers a batch with an array', async () => {
    const response = await Rpc.handler(api)(
      post(
        '[{"jsonrpc":"2.0","id":1,"method":"add","params":[1,2]},{"jsonrpc":"2.0","id":2,"method":"fail"}]',
      ),
    )
    expect(await response.json()).toEqual([
      { jsonrpc: '2.0', id: 1, result: 3 },
      { jsonrpc: '2.0', id: 2, error: { code: 1, message: 'nope' } },
    ])
  })

  test('answers notifications with 204 No Content', async () => {
    const response = await Rpc.handler(api)(post('{"jsonrpc":"2.0","method":"add","params":[1,2]}'))
    expect(response.status).toBe(204)
    expect(await response.text()).toBe('')
  })

  test('answers invalid JSON with a parse error', async () => {
    const response = await Rpc.handler(api)(post('{'))
    expect(await response.json()).toEqual({
      jsonrpc: '2.0',
      id: null,
      error: { code: -32700, message: 'Parse error' },
    })
  })

  test('answers other HTTP methods with 405 and Allow: POST', async () => {
    const response = await Rpc.handler(api)(new Request(url))
    expect(response.status).toBe(405)
    expect(response.headers.get('allow')).toBe('POST')
  })

  test('streams values as newline-delimited messages', async () => {
    const response = await Rpc.handler(api)(
      post('{"jsonrpc":"2.0","id":1,"method":"count","params":[2]}'),
    )
    expect(response.headers.get('content-type')).toBe('application/x-ndjson')
    expect(await Streams.toText(response.body!)).toBe(
      [
        '{"jsonrpc":"2.0","method":"$/stream","params":{"id":1}}',
        '{"jsonrpc":"2.0","method":"$/stream/next","params":{"id":1,"value":0}}',
        '{"jsonrpc":"2.0","method":"$/stream/next","params":{"id":1,"value":1}}',
        '{"jsonrpc":"2.0","id":1,"result":null}',
        '',
      ].join('\n'),
    )
  })

  test('gives withContext methods the request', async () => {
    const handle = Rpc.handler({
      whoami: Rpc.withContext(({ request }) => request?.headers.get('authorization')),
    })
    const response = await handle(
      new Request(url, {
        method: 'POST',
        headers: { authorization: 'Bearer x' },
        body: '{"jsonrpc":"2.0","id":1,"method":"whoami"}',
      }),
    )
    expect(await response.json()).toEqual({ jsonrpc: '2.0', id: 1, result: 'Bearer x' })
  })
})

describe('http', () => {
  test('sends calls made in the same tick as one batch request', async () => {
    const { fetch, requests } = fetcher(api)
    const remote = Rpc.http<typeof api>(url, { fetch })
    expect(
      await Promise.all([remote.add(1, 2), remote.add(3, 4), remote.fail().catch((e) => e.code)]),
    ).toEqual([3, 7, 1])
    expect(requests).toHaveLength(1)
    expect(await requests[0]!.json()).toHaveLength(3)
  })

  test('sends a single call as one request object', async () => {
    const { fetch, requests } = fetcher(api)
    const remote = Rpc.http<typeof api>(url, { fetch })
    await remote.add(1, 2)
    expect(requests[0]!.method).toBe('POST')
    expect(requests[0]!.headers.get('content-type')).toBe('application/json')
    expect(await requests[0]!.text()).toBe('{"jsonrpc":"2.0","id":1,"method":"add","params":[1,2]}')
  })

  test('rejects with RemoteError for an error response', async () => {
    const remote = Rpc.http<typeof api>(url, fetcher(api))
    await expect(remote.fail()).rejects.toMatchObject({
      name: 'Rpc.RemoteError',
      code: 1,
      message: 'nope',
    })
  })

  test('iterates a streamed result', async () => {
    const remote = Rpc.http<typeof api>(url, fetcher(api))
    const values: number[] = []
    for await (const value of remote.count(50)) values.push(value)
    expect(values).toEqual(Array.from({ length: 50 }, (_, i) => i))
  })

  test('streams one result and answers another call in the same batch', async () => {
    const remote = Rpc.http<typeof api>(url, fetcher(api))
    const [stream, sum] = await Promise.all([remote.count(3), remote.add(1, 1)])
    expect(sum).toBe(2)
    expect(await Streams.toArray(stream)).toEqual([0, 1, 2])
  })

  test('breaking out of a streamed result aborts the request and stops the generator', async () => {
    const stopped = deferred()
    let requestSignal: AbortSignal | undefined
    const handle = Rpc.handler({
      async *forever() {
        try {
          for (let i = 0; ; i++) {
            await new Promise((r) => setTimeout(r, 1))
            yield i
          }
        } finally {
          stopped.resolve()
        }
      },
    })
    const remote = Rpc.http<{ forever(): AsyncGenerator<number> }>(url, {
      fetch: async (input, init) => {
        requestSignal = init?.signal ?? undefined
        return handle(new Request(input, init))
      },
    })
    for await (const value of remote.forever()) if (value === 2) break
    expect(requestSignal?.aborted).toBe(true)
    await stopped.promise
  })

  test('resolves a notification once the server accepted it', async () => {
    let bumped = 0
    const { fetch, requests } = fetcher({ bump: () => void bumped++ })
    const remote = Rpc.http<{ bump(): void }>(url, { fetch })
    await Rpc.notify(remote.bump, [])
    expect(bumped).toBe(1)
    expect(await requests[0]!.text()).toBe('{"jsonrpc":"2.0","method":"bump"}')
  })

  test('rejects with TransportError and the response when the server answers an HTTP error', async () => {
    const remote = Rpc.http<typeof api>(url, {
      fetch: async () => new Response('down', { status: 503 }),
    })
    const error = await remote.add(1, 2).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(Rpc.TransportError)
    expect((error as Rpc.TransportError).cause).toMatchObject({ status: 503 })
  })

  test('rejects with the fetch error when the request fails', async () => {
    const failure = new TypeError('fetch failed')
    const remote = Rpc.http<typeof api>(url, { fetch: () => Promise.reject(failure) })
    await expect(remote.add(1, 2)).rejects.toBe(failure)
  })

  test('rejects every call of a batch with the error a server sent with a null id', async () => {
    const remote = Rpc.http<typeof api>(url, {
      fetch: async () =>
        Response.json({
          jsonrpc: '2.0',
          id: null,
          error: { code: -32600, message: 'Invalid Request' },
        }),
    })
    const results = await Promise.allSettled([remote.add(1, 2), remote.add(3, 4)])
    for (const result of results)
      expect(result).toMatchObject({ status: 'rejected', reason: { code: -32600 } })
  })

  test('rejects a call the response has no result for with TransportError', async () => {
    const remote = Rpc.http<typeof api>(url, { fetch: async () => Response.json([]) })
    await expect(remote.add(1, 2)).rejects.toBeInstanceOf(Rpc.TransportError)
  })

  test('aborting the signal rejects waiting and later calls with its reason', async () => {
    const controller = new AbortController()
    const remote = Rpc.http<typeof api>(url, {
      fetch: (_, init) =>
        new Promise((_, reject) =>
          init?.signal?.addEventListener('abort', () => reject(init.signal!.reason)),
        ),
      signal: controller.signal,
    })
    const call = remote.add(1, 2)
    const reason = new Error('leaving')
    controller.abort(reason)
    await expect(call).rejects.toBe(reason)
    await expect(remote.add(1, 2)).rejects.toBe(reason)
  })

  test('aborting one call of a batch leaves the others running', async () => {
    const { fetch } = fetcher({
      slow: () => new Promise((r) => setTimeout(() => r('slow'), 20)),
      add: api.add,
    })
    const remote = Rpc.http<{ slow(): string; add(a: number, b: number): number }>(url, { fetch })
    const controller = new AbortController()
    const slow = Rpc.call(remote.slow, [], { signal: controller.signal })
    const sum = remote.add(1, 2)
    controller.abort(new Error('stop'))
    await expect(slow).rejects.toThrow('stop')
    expect(await sum).toBe(3)
  })
})
