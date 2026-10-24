import {
  createJSONRPCNotification,
  createJSONRPCRequest,
  JSONRPCClient,
  JSONRPCErrorException,
  JSONRPCServer,
} from 'json-rpc-2.0'
import { describe, expect, onTestFinished, test } from 'vite-plus/test'
import * as Rpc from '@portable/rpc'
import { settle } from './utils.js'

const noop = () => {}

const api = {
  echo: (value: unknown) => value,
  add: (a: number, b: number) => a + b,
  subtract: ({ minuend, subtrahend }: { minuend: number; subtrahend: number }) =>
    minuend - subtrahend,
  nothing: () => undefined,
  async later(value: unknown) {
    await Promise.resolve()
    return value
  },
  log: (_message?: unknown) => {},
  fail(code: number, message: string, data?: unknown): never {
    throw new Rpc.RemoteError({ code, message, data })
  },
  crash(message: string): never {
    throw new Error(message)
  },
  throwString(message: string): never {
    // oxlint-disable-next-line no-throw-literal
    throw message
  },
  math: { add: (a: number, b: number) => a + b },
  'rpc.ping': () => 'pong',
}
type Api = typeof api

// json-rpc-2.0 passes `params` to a method as one argument. This adapter spreads positional params,
// as our server does, so both servers run the same functions.
function upstreamServer(): JSONRPCServer {
  const server = new JSONRPCServer({ errorListener: noop })
  const methods: Record<string, any> = {
    ...api,
    'math.add': api.math.add,
    fail(code: number, message: string, data?: unknown): never {
      throw new JSONRPCErrorException(message, code, data)
    },
  }
  for (const [name, fn] of Object.entries(methods)) {
    if (typeof fn !== 'function') continue
    server.addMethod(name, (params: unknown) =>
      Array.isArray(params) ? fn(...params) : params === undefined ? fn() : fn(params),
    )
  }
  return server
}

const upstream = upstreamServer()

/** The JSON text json-rpc-2.0 would send for `text`, or `undefined` when it sends nothing. */
async function viaUpstream(text: string): Promise<string | undefined> {
  const response = await upstream.receiveJSON(text)
  return response === null ? undefined : JSON.stringify(response)
}

/** Serves `api` over a transport that records the exact text each write carries. */
function wire(served: object) {
  const written = new Array<string>()
  let input!: ReadableStreamDefaultController<unknown>
  const readable = new ReadableStream<unknown>({ start: (c) => void (input = c) })
  const writable = new WritableStream<unknown>({
    write: (text) => void written.push(text as string),
  })
  const controller = new AbortController()
  onTestFinished(() => controller.abort())
  Rpc.provide({ readable, writable }, served, { signal: controller.signal })
  return async (text: string): Promise<string[]> => {
    const start = written.length
    input.enqueue(text)
    await settle()
    return written.slice(start)
  }
}

const handle = Rpc.handler(api)

/**
 * Posts `text` to `Rpc.handler` and returns the JSON body, or `undefined` for an empty 204. Any
 * other status or content type is returned as a description, so it fails the comparison.
 */
async function viaHandler(text: string): Promise<string | undefined> {
  const response = await handle(
    new Request('https://rpc.test/', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: text,
    }),
  )
  const body = await response.text()
  if (response.status === 204 && body === '') return undefined
  const type = response.headers.get('content-type') ?? ''
  if (response.status !== 200 || !type.startsWith('application/json'))
    return `${response.status} ${type} ${body}`
  return body
}

/** What our server sends for `text` over a transport and over HTTP. */
async function ours(send: (text: string) => Promise<string[]>, text: string) {
  return { transport: await send(text), http: await viaHandler(text) }
}

/** What `ours` returns when the server sends `expected`, or nothing. */
const sends = (expected: string | undefined) => ({
  transport: expected === undefined ? [] : [expected],
  http: expected,
})

const request = (method: string, params?: unknown, id: unknown = 1) =>
  JSON.stringify({ jsonrpc: '2.0', id, method, params })
const notification = (method: string, params?: unknown) =>
  JSON.stringify({ jsonrpc: '2.0', method, params })

const jsonValues = [
  ['null', null],
  ['true', true],
  ['false', false],
  ['zero', 0],
  ['a negative fraction', -1.5],
  ['a large number', 1e21],
  ['an empty string', ''],
  ['a string with escapes and non-ASCII', `line\n"quoted" é 😀 ${String.fromCharCode(0x2028)}`],
  ['an empty array', []],
  ['a nested array', [1, [2, [null, 'x']]]],
  ['an empty object', {}],
  ['a nested object', { a: { b: [true, { c: 'd' }] }, 'key with space': 1 }],
] satisfies readonly [string, unknown][]

describe('server sends the same bytes as JSONRPCServer', () => {
  const cases = [
    ['positional params', request('add', [1, 2])],
    ['params by name', request('subtract', { minuend: 42, subtrahend: 23 })],
    ['no params', request('nothing')],
    ['a nested method', request('math.add', [2, 3])],
    ['an async method', request('later', [{ a: 1 }])],
    ['a string id', request('add', [1, 2], 'abc-1')],
    ['a fractional id', request('add', [1, 2], 1.5)],
    ['a negative id', request('add', [1, 2], -7)],
    ['a null id', request('add', [1, 2], null)],
    ['an unknown method', request('missing', [1])],
    ['an Object.prototype name', request('toString')],
    ['__proto__', request('__proto__')],
    ['a RemoteError with code and data', request('fail', [-32000, 'Out of stock', { sku: 'a1' }])],
    ['a RemoteError without data', request('fail', [404, 'Not found'])],
    ['a RemoteError with falsy data', request('fail', [1, 'm', 0])],
    ['an empty object', '{}'],
    ['a message without a method', '{"jsonrpc":"2.0"}'],
    ['a wrong version without an id', '{"jsonrpc":"1.0","method":"echo"}'],
    ['a number', '1'],
    ['a string', '"x"'],
    ['true', 'true'],
    ['a parse error', '{"jsonrpc":"2.0","method":'],
    ['an unclosed batch', '['],
    ['an empty batch', '[]'],
    ['a batch of numbers', '[1,2,3]'],
    ['a batch with a nested array', `[[${request('add', [1, 2])}],${request('add', [1, 2], 2)}]`],
    [
      'the spec example batch',
      `[${request('add', [1, 2], '1')},${notification('log', [7])},${request('subtract', [42, 23], '2')},{"foo":"boo"},${request('missing', { name: 'myself' }, '5')},${request('echo', ['x'], '9')}]`,
    ],
    [
      'a batch of requests and notifications',
      `[${notification('echo', [1])},${request('later', [1], 1)},${request('add', [1, 2], 2)},${notification('missing')}]`,
    ],
    ['a batch with duplicate ids', `[${request('later', ['a'], 1)},${request('echo', ['b'], 1)}]`],
    ['a notification', notification('log', ['x'])],
    ['a notification to an unknown method', notification('missing')],
    ['a notification that throws', notification('crash', ['boom'])],
    ...jsonValues.map(([name, value]): [string, string] => [
      `a result of ${name}`,
      request('echo', [value]),
    ]),
  ] satisfies readonly [string, string][]
  for (const [name, text] of cases) {
    test(`${name}`, async () => {
      expect(await ours(wire(api), text)).toEqual(sends(await viaUpstream(text)))
    })
  }

  test('a method that returns undefined answers null', async () => {
    const text = request('nothing')
    const expected = '{"jsonrpc":"2.0","id":1,"result":null}'
    expect(await viaUpstream(text)).toBe(expected)
    expect(await ours(wire(api), text)).toEqual(sends(expected))
  })
})

describe('server follows the spec where JSONRPCServer does not', () => {
  const answer = (body: string, id = '1') => `{"jsonrpc":"2.0","id":${id},${body}}`
  const invalid = answer('"error":{"code":-32600,"message":"Invalid Request"}', 'null')
  const cases = [
    {
      name: 'a batch of one request answers an array',
      text: `[${request('add', [1, 2])}]`,
      upstream: answer('"result":3'),
      ours: `[${answer('"result":3')}]`,
    },
    {
      name: 'a batch with one request among notifications answers an array',
      text: `[${notification('log')},${request('add', [1, 2])},${notification('log')}]`,
      upstream: answer('"result":3'),
      ours: `[${answer('"result":3')}]`,
    },
    {
      name: 'a batch with one invalid message answers an array',
      text: '[1]',
      upstream: invalid,
      ours: `[${invalid}]`,
    },
    {
      name: 'a thrown Error is an internal error',
      text: request('crash', ['boom']),
      upstream: answer('"error":{"code":0,"message":"boom"}'),
      ours: answer('"error":{"code":-32603,"message":"boom"}'),
    },
    {
      name: 'a thrown string is an internal error with that message',
      text: request('throwString', ['boom']),
      upstream: answer('"error":{"code":0,"message":"An unexpected error occurred"}'),
      ours: answer('"error":{"code":-32603,"message":"boom"}'),
    },
    {
      name: 'a non-string method is an invalid request',
      text: '{"jsonrpc":"2.0","id":1,"method":5}',
      upstream: answer('"error":{"code":-32601,"message":"Method not found"}'),
      ours: invalid,
    },
    {
      name: 'a null method is an invalid request',
      text: '{"jsonrpc":"2.0","id":1,"method":null}',
      upstream: answer('"error":{"code":-32601,"message":"Method not found"}'),
      ours: invalid,
    },
    {
      name: 'an object id is an invalid request',
      text: request('echo', [1], { a: 1 }),
      upstream: answer('"result":1', '{"a":1}'),
      ours: invalid,
    },
    {
      name: 'a boolean id is an invalid request',
      text: request('echo', [1], true),
      upstream: answer('"result":1', 'true'),
      ours: invalid,
    },
    {
      name: 'string params are an invalid request',
      text: request('echo', 'str'),
      upstream: answer('"result":"str"'),
      ours: invalid,
    },
    {
      name: 'null params are an invalid request',
      text: request('echo', null),
      upstream: answer('"result":null'),
      ours: invalid,
    },
    {
      name: 'an invalid request answers a null id',
      text: '{"jsonrpc":"1.0","id":7,"method":"echo"}',
      upstream: answer('"error":{"code":-32600,"message":"Invalid Request"}', '7'),
      ours: invalid,
    },
    {
      name: 'the JSON text null is an invalid request',
      text: 'null',
      upstream: answer('"error":{"code":-32700,"message":"Parse error"}', 'null'),
      ours: invalid,
    },
    {
      name: 'the JSON text 0 is an invalid request',
      text: '0',
      upstream: answer('"error":{"code":-32700,"message":"Parse error"}', 'null'),
      ours: invalid,
    },
    {
      name: 'the JSON text false is an invalid request',
      text: 'false',
      upstream: answer('"error":{"code":-32700,"message":"Parse error"}', 'null'),
      ours: invalid,
    },
    {
      name: 'the JSON text "" is an invalid request',
      text: '""',
      upstream: answer('"error":{"code":-32700,"message":"Parse error"}', 'null'),
      ours: invalid,
    },
    {
      name: 'methods starting with rpc. are reserved',
      text: request('rpc.ping'),
      upstream: answer('"result":"pong"'),
      ours: answer('"error":{"code":-32601,"message":"Method not found"}'),
    },
    {
      name: 'null error data is sent as given',
      text: request('fail', [1, 'm', null]),
      upstream: answer('"error":{"code":1,"message":"m"}'),
      ours: answer('"error":{"code":1,"message":"m","data":null}'),
    },
    {
      name: 'a batch of notifications sends nothing',
      text: `[${notification('log', [1])},${notification('missing')}]`,
      upstream: undefined,
      ours: undefined,
    },
  ] satisfies readonly {
    name: string
    text: string
    upstream: string | undefined
    ours: string | undefined
  }[]
  for (const { name, text, upstream: expectedUpstream, ours: expected } of cases) {
    test(`${name}`, async () => {
      expect(await viaUpstream(text)).toBe(expectedUpstream)
      expect(await ours(wire(api), text)).toEqual(sends(expected))
    })
  }

  test('a batch of notifications is 204 over HTTP, where JSONRPCServer resolves null', async () => {
    const text = `[${notification('log', [1])},${notification('log', [2])}]`
    expect(await upstream.receiveJSON(text)).toBeNull()
    const response = await handle(new Request('https://rpc.test/', { method: 'POST', body: text }))
    expect(response.status).toBe(204)
  })

  test('a request with a result member is run, where JSONRPCServer answers Invalid Request', async () => {
    const text = '{"jsonrpc":"2.0","id":1,"method":"echo","params":[1],"result":5}'
    expect(await viaUpstream(text)).toBe(
      answer('"error":{"code":-32600,"message":"Invalid Request"}'),
    )
    expect(await ours(wire(api), text)).toEqual(sends(answer('"result":1')))
  })

  test('a null message in a batch is an invalid request, where JSONRPCServer rejects', async () => {
    const text = `[null,${request('add', [1, 2])}]`
    await expect(upstream.receiveJSON(text)).rejects.toThrow(TypeError)
    expect(await ours(wire(api), text)).toEqual(sends(`[${invalid},${answer('"result":3')}]`))
  })
})

function random(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function randomMessages(seed: number): string {
  const next = random(seed)
  const int = (n: number) => Math.floor(next() * n)
  const pick = <value>(values: readonly value[]): value => values[int(values.length)]!
  const string = () =>
    Array.from({ length: int(6) }, () => pick(['a', 'Z', ' ', 'é', '😀', '"', '\\', '\n'])).join('')
  const value = (depth: number): unknown => {
    switch (int(depth > 2 ? 4 : 6)) {
      case 0:
        return null
      case 1:
        return next() < 0.5
      case 2:
        return next() < 0.5 ? int(1000) - 500 : (next() - 0.5) * 1e6
      case 3:
        return string()
      case 4:
        return Array.from({ length: int(4) }, () => value(depth + 1))
      default:
        return Object.fromEntries(
          Array.from({ length: int(4) }, () => [string(), value(depth + 1)]),
        )
    }
  }
  const id = () =>
    pick([() => int(100), () => string(), () => int(100) + 0.25, () => -int(9), () => null])()
  const message = (): unknown => {
    switch (int(11)) {
      case 0:
        return { jsonrpc: '2.0', id: id(), method: 'add', params: [int(100), int(100)] }
      case 1:
        return {
          jsonrpc: '2.0',
          id: id(),
          method: 'subtract',
          params: { minuend: int(100), subtrahend: int(100) },
        }
      case 2:
        return { jsonrpc: '2.0', id: id(), method: 'echo', params: [value(0)] }
      case 3:
        return { jsonrpc: '2.0', id: id(), method: 'later', params: [value(0)] }
      case 4:
        return { jsonrpc: '2.0', method: pick(['echo', 'log', 'missing']), params: [value(0)] }
      case 5:
        return { jsonrpc: '2.0', id: id(), method: pick(['missing', 'toString', 'math.sub']) }
      case 6: {
        const params = Array.of<unknown>(int(1000), string())
        if (next() < 0.5) params.push(pick([0, false, 'd', { a: [1] }]))
        return { jsonrpc: '2.0', id: id(), method: 'fail', params }
      }
      case 7:
        return pick([{}, { jsonrpc: '2.0' }, { jsonrpc: '1.0', method: 'echo' }, 1, 'x', []])
      case 8:
        return { jsonrpc: '2.0', id: id(), method: 'math.add', params: [int(9), int(9)] }
      case 9:
        return { jsonrpc: '2.0', id: id(), method: 'nothing' }
      default:
        return { jsonrpc: '2.0', id: id(), method: 'echo', params: { value: value(0) } }
    }
  }
  if (next() < 0.25) return JSON.stringify(message())
  return JSON.stringify(Array.from({ length: int(9) }, message))
}

test('random messages and batches match JSONRPCServer, with one-response batches as arrays', async () => {
  const send = wire(api)
  for (let seed = 0; seed < 300; seed++) {
    const text = randomMessages(seed)
    let expected = await viaUpstream(text)
    const batch = text.startsWith('[') && text !== '[]'
    if (batch && expected?.startsWith('{')) expected = `[${expected}]`
    expect({ seed, text, ours: await send(text) }).toEqual({
      seed,
      text,
      ours: expected === undefined ? [] : [expected],
    })
    expect({ seed, text, ours: await viaHandler(text) }).toEqual({ seed, text, ours: expected })
  }
})

/** A transport that records what our client writes and lets the test write replies. */
function capture() {
  const written = new Array<string>()
  let input!: ReadableStreamDefaultController<unknown>
  const readable = new ReadableStream<unknown>({ start: (c) => void (input = c) })
  const writable = new WritableStream<unknown>({
    write: (text) => void written.push(text as string),
  })
  const controller = new AbortController()
  onTestFinished(() => controller.abort())
  const remote = Rpc.connect<Api>({ readable, writable }, { signal: controller.signal })
  return { remote, written, reply: (text: string) => input.enqueue(text) }
}

/** Replaces ids with 0, keeping key order, so ids from different counters compare equal. */
function withoutId(text: string): string {
  const parsed = JSON.parse(text)
  for (const message of Array.isArray(parsed) ? parsed : [parsed])
    if ('id' in message) message.id = 0
  return JSON.stringify(parsed)
}

function upstreamClient() {
  const sent = new Array<string>()
  const client = new JSONRPCClient((payload) => void sent.push(JSON.stringify(payload)))
  return { client, sent }
}

describe('client sends the same bytes as JSONRPCClient', () => {
  test('requests and notifications over a transport', async () => {
    const { remote, written } = capture()
    const calls = [
      remote.add(1, 2),
      Rpc.call(remote.subtract, [{ minuend: 3, subtrahend: 1 }]),
      Rpc.call((remote as any).echo, { value: 'by name' }),
      remote.nothing(),
      remote.math.add(1, 2),
      remote.echo('é😀\n'),
    ]
    for (const call of calls) Promise.resolve(call).catch(noop)
    await Rpc.notify(remote.log, ['x'])
    await Rpc.notify((remote as any).log, { level: 'info' })
    await settle()

    const { client, sent } = upstreamClient()
    for (const call of [
      client.request('add', [1, 2]),
      client.request('subtract', [{ minuend: 3, subtrahend: 1 }]),
      client.request('echo', { value: 'by name' }),
      client.request('nothing', undefined),
      client.request('math.add', [1, 2]),
      client.request('echo', ['é😀\n']),
    ])
      Promise.resolve(call).catch(noop)
    client.notify('log', ['x'])
    client.notify('log', { level: 'info' })

    expect(written.map(withoutId)).toEqual(sent.map(withoutId))
  })

  test('empty positional params are left out, where JSONRPCClient sends []', async () => {
    const { remote, written } = capture()
    Rpc.call(remote.nothing, []).catch(noop)
    await Rpc.notify(remote.log, [])
    await settle()
    const { client, sent } = upstreamClient()
    Promise.resolve(client.request('nothing', [])).catch(noop)
    client.notify('log', [])
    expect(sent).toEqual([
      '{"jsonrpc":"2.0","id":1,"method":"nothing","params":[]}',
      '{"jsonrpc":"2.0","method":"log","params":[]}',
    ])
    expect(written).toEqual([
      '{"jsonrpc":"2.0","id":1,"method":"nothing"}',
      '{"jsonrpc":"2.0","method":"log"}',
    ])
  })

  test('a batch over HTTP', async () => {
    const bodies = new Array<string>()
    const remote = Rpc.http<Api>('https://rpc.test/', {
      fetch: async (request) => {
        bodies.push(await request.text())
        return new Response(null, { status: 204 })
      },
    })
    const calls = [remote.add(1, 2), remote.echo({ a: [1] }), Rpc.notify(remote.log, ['x'])]
    for (const call of calls) call.catch(noop)
    await Promise.allSettled(calls)
    await remote.nothing().catch(noop)

    const { client, sent } = upstreamClient()
    Promise.resolve(
      client.requestAdvanced([
        createJSONRPCRequest(1, 'add', [1, 2]),
        createJSONRPCRequest(2, 'echo', [{ a: [1] }]),
        createJSONRPCNotification('log', ['x']),
      ]),
    ).catch(noop)
    Promise.resolve(client.request('nothing', undefined)).catch(noop)

    expect(bodies.map(withoutId)).toEqual(sent.map(withoutId))
  })
})

/** Connects our client to a JSONRPCServer over a transport. */
function toUpstream() {
  let input!: ReadableStreamDefaultController<unknown>
  const readable = new ReadableStream<unknown>({ start: (c) => void (input = c) })
  const writable = new WritableStream<unknown>({
    async write(text) {
      const response = await upstream.receiveJSON(text as string)
      if (response !== null) input.enqueue(JSON.stringify(response))
    },
  })
  const controller = new AbortController()
  onTestFinished(() => controller.abort())
  return Rpc.connect<Api>({ readable, writable }, { signal: controller.signal })
}

/** Connects our HTTP client to a JSONRPCServer. */
function httpToUpstream() {
  const bodies = new Array<string>()
  const remote = Rpc.http<Api>('https://rpc.test/', {
    fetch: async (request) => {
      const body = await request.text()
      bodies.push(body)
      const response = await upstream.receiveJSON(body)
      return response === null ? new Response(null, { status: 204 }) : Response.json(response)
    },
  })
  return { remote, bodies }
}

describe('client against JSONRPCServer', () => {
  for (const [name, connect] of [
    ['over a transport', toUpstream],
    ['over HTTP', () => httpToUpstream().remote],
  ] as const) {
    describe(`${name}`, () => {
      test('resolves results', async () => {
        const remote = connect()
        expect(await remote.add(1, 2)).toBe(3)
        expect(await Rpc.call(remote.subtract, [{ minuend: 5, subtrahend: 2 }])).toBe(3)
        expect(await remote.nothing()).toBeNull()
        expect(await remote.math.add(2, 2)).toBe(4)
        for (const [, value] of jsonValues) expect(await remote.echo(value)).toEqual(value)
      })

      test('matches concurrent responses to their calls', async () => {
        const remote = connect()
        const values = Array.from({ length: 20 }, (_, i) => `v${i}`)
        expect(await Promise.all(values.map((v) => remote.later(v)))).toEqual(values)
      })

      test('rejects with RemoteError carrying code and data', async () => {
        const remote = connect()
        const error = await remote
          .fail(-32000, 'Out of stock', { sku: 'a1' })
          .catch((e: unknown) => e)
        expect(error).toBeInstanceOf(Rpc.RemoteError)
        expect(error).toMatchObject({ code: -32000, message: 'Out of stock', data: { sku: 'a1' } })
      })

      test("rejects with json-rpc-2.0's code 0 for a thrown Error", async () => {
        const remote = connect()
        await expect(remote.crash('boom')).rejects.toMatchObject({
          name: 'Rpc.RemoteError',
          code: 0,
          message: 'boom',
        })
      })

      test('rejects an unknown method with -32601', async () => {
        const remote = connect()
        await expect(
          Rpc.call(remote.echo, ['x']).then(() => (remote as any).missing()),
        ).rejects.toMatchObject({
          code: -32601,
        })
      })

      test('a notification resolves without a reply', async () => {
        const remote = connect()
        await expect(Rpc.notify(remote.log, ['x'])).resolves.toBeUndefined()
        expect(await remote.add(1, 1)).toBe(2)
      })
    })
  }

  test('an aborted call rejects with the reason, and the cancel notification gets no reply', async () => {
    const remote = toUpstream()
    const controller = new AbortController()
    const reason = new Error('stop')
    const call = Rpc.call(remote.later, ['x'], { signal: controller.signal })
    controller.abort(reason)
    await expect(call).rejects.toBe(reason)
    expect(await remote.add(1, 2)).toBe(3)
  })

  test('over HTTP, reads the bare object JSONRPCServer sends for a one-response batch', async () => {
    const { remote, bodies } = httpToUpstream()
    const [sum] = await Promise.all([remote.add(1, 2), Rpc.notify(remote.log, ['x'])])
    expect(sum).toBe(3)
    expect(bodies).toHaveLength(1)
    expect(JSON.parse(bodies[0]!)).toHaveLength(2)
  })

  test('over HTTP, a batch resolves each call', async () => {
    const { remote, bodies } = httpToUpstream()
    const results = await Promise.allSettled([
      remote.add(1, 2),
      remote.fail(7, 'seven'),
      remote.echo('x'),
      remote.crash('boom'),
    ])
    expect(bodies).toHaveLength(1)
    expect(
      results.map((r) => (r.status === 'fulfilled' ? r.value : (r.reason as Rpc.RemoteError).code)),
    ).toEqual([3, 7, 'x', 0])
  })
})

describe('JSONRPCClient against our server', () => {
  function overTransport() {
    let input!: ReadableStreamDefaultController<unknown>
    const readable = new ReadableStream<unknown>({ start: (c) => void (input = c) })
    const client = new JSONRPCClient((payload) => {
      input.enqueue(JSON.stringify(payload))
    }) satisfies JSONRPCClient
    const writable = new WritableStream<unknown>({
      write: (text) => client.receive(JSON.parse(text as string)),
    })
    const controller = new AbortController()
    onTestFinished(() => controller.abort())
    Rpc.provide({ readable, writable }, api, { signal: controller.signal })
    return client
  }

  function overHttp() {
    const client = new JSONRPCClient(async (payload) => {
      const response = await handle(
        new Request('https://rpc.test/', { method: 'POST', body: JSON.stringify(payload) }),
      )
      if (response.status === 200) client.receive(await response.json())
    }) satisfies JSONRPCClient
    return client
  }

  for (const [name, connect] of [
    ['over a transport', overTransport],
    ['over HTTP', overHttp],
  ] as const) {
    describe(`${name}`, () => {
      test('resolves results', async () => {
        const client = connect()
        expect(await client.request('add', [1, 2])).toBe(3)
        expect(await client.request('subtract', { minuend: 5, subtrahend: 2 })).toBe(3)
        expect(await client.request('nothing', undefined)).toBeNull()
        expect(await client.request('math.add', [2, 2])).toBe(4)
        for (const [, value] of jsonValues)
          expect(await client.request('echo', [value])).toEqual(value)
      })

      test('rejects with JSONRPCErrorException carrying our code and data', async () => {
        const client = connect()
        const error = await Promise.resolve(
          client.request('fail', [-32000, 'Out of stock', { sku: 'a1' }]),
        ).catch((e: unknown) => e)
        expect(error).toBeInstanceOf(JSONRPCErrorException)
        expect(error).toMatchObject({ code: -32000, message: 'Out of stock', data: { sku: 'a1' } })
        await expect(client.request('crash', ['boom'])).rejects.toMatchObject({
          code: -32603,
          message: 'boom',
        })
        await expect(client.request('missing', undefined)).rejects.toMatchObject({ code: -32601 })
      })

      test('a batch resolves responses in request order', async () => {
        const client = connect()
        const responses = await client.requestAdvanced([
          createJSONRPCRequest(1, 'add', [1, 2]),
          createJSONRPCNotification('log', ['x']),
          createJSONRPCRequest(2, 'missing'),
          createJSONRPCRequest(3, 'later', ['x']),
        ])
        expect(responses).toEqual([
          { jsonrpc: '2.0', id: 1, result: 3 },
          { jsonrpc: '2.0', id: 2, error: { code: -32601, message: 'Method not found' } },
          { jsonrpc: '2.0', id: 3, result: 'x' },
        ])
      })

      test('a batch of one request resolves its response', async () => {
        const client = connect()
        expect(await client.requestAdvanced([createJSONRPCRequest(1, 'add', [1, 2])])).toEqual([
          { jsonrpc: '2.0', id: 1, result: 3 },
        ])
      })
    })
  }
})

function randomChunks(bytes: Uint8Array, seed: number): Uint8Array[] {
  const next = random(seed)
  const chunks = new Array<Uint8Array>()
  for (let i = 0; i < bytes.length;) {
    const size = 1 + Math.floor(next() * 40)
    chunks.push(bytes.subarray(i, i + size))
    i += size
  }
  return chunks
}

describe('Rpc.http reads a randomly chunked NDJSON stream', () => {
  const streaming = {
    async *count(n: number) {
      for (let i = 0; i < n; i++) yield { i, text: 'é😀'.repeat(i % 4), nested: [i, { n: i }] }
    },
    add: (a: number, b: number) => a + b,
  }
  const handleStreaming = Rpc.handler(streaming)
  const expected = (n: number) =>
    Array.from({ length: n }, (_, i) => ({ i, text: 'é😀'.repeat(i % 4), nested: [i, { n: i }] }))

  for (let seed = 0; seed < 40; seed++) {
    test(`seed ${seed}`, async () => {
      const remote = Rpc.http<typeof streaming>('https://rpc.test/', {
        fetch: async (request) => {
          const response = await handleStreaming(request)
          expect(response.headers.get('content-type')).toMatch(/^application\/x-ndjson/)
          const chunks = randomChunks(await response.bytes(), seed)
          const body = new ReadableStream<Uint8Array>({
            pull(controller) {
              const chunk = chunks.shift()
              if (chunk) controller.enqueue(chunk)
              else controller.close()
            },
          })
          return new Response(body, { headers: response.headers })
        },
      })
      const items = new Array<unknown>()
      const counted = (async () => {
        for await (const item of remote.count(25)) items.push(item)
      })()
      const [, sum] = await Promise.all([counted, remote.add(seed, 1)])
      expect(items).toEqual(expected(25))
      expect(sum).toBe(seed + 1)
    })
  }
})
