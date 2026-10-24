import * as Rpc from '@portable/rpc'
import { describe, expect, test, vi } from 'vite-plus/test'
import { deferred, pair, raw, settle } from './utils.js'

const alice = { hello: (name: string) => `Hello ${name}, my name is Alice` }

function bob() {
  let count = 0
  return {
    hi: (name: string) => `Hi ${name}, I am Bob`,
    bump() {
      count++
    },
    bumpWithReturn: () => ++count,
    getCount: () => count,
  }
}

/** A transport whose written messages the test reads back, and which never answers. */
function silent() {
  const written = new Array<unknown>()
  const readable = new ReadableStream<unknown>()
  const writable = new WritableStream<unknown>({ write: (m) => void written.push(m) })
  return { transport: { readable, writable }, written }
}

describe('calls', () => {
  test('resolves the result of a sync or async method', async () => {
    const remote = pair({ add: (a: number, b: number) => a + b, later: async () => 'done' })
    expect(await remote.add(1, 2)).toBe(3)
    expect(await remote.later()).toBe('done')
  })

  test('resolves undefined results as null', async () => {
    const remote = pair({ ack() {} })
    expect(await remote.ack()).toBe(null)
  })

  test('sends arguments as positional params and leaves params out when there are none', async () => {
    const { transport, written } = silent()
    const remote = Rpc.connect<any>(transport)
    void remote.add(1, 2)
    void remote.ping()
    await settle()
    expect(written).toEqual([
      '{"jsonrpc":"2.0","id":1,"method":"add","params":[1,2]}',
      '{"jsonrpc":"2.0","id":2,"method":"ping"}',
    ])
  })

  test('calls methods of nested objects by dotted name', async () => {
    const remote = pair({ math: { add: (a: number, b: number) => a + b, deep: { one: () => 1 } } })
    expect(await remote.math.add(2, 3)).toBe(5)
    expect(await remote.math.deep.one()).toBe(1)
  })

  test('calls a method whose name contains a slash, as LSP and MCP name them', async () => {
    const remote = pair({ 'tools/list': () => ({ tools: [] }) })
    expect(await remote['tools/list']()).toEqual({ tools: [] })
  })

  test('calls methods of a class instance with the instance as this', async () => {
    class Counter {
      count = 0
      increment() {
        return ++this.count
      }
    }
    const remote = pair(new Counter())
    await remote.increment()
    expect(await remote.increment()).toBe(2)
  })

  test('looks up the method on every call, so replacing or adding one takes effect', async () => {
    const api: Record<string, (name: string) => string> = { ...alice }
    const remote = pair(api) as any
    expect(await remote.hello('Bob')).toBe('Hello Bob, my name is Alice')
    api.hello = (name) => `Alice says hello to ${name}`
    api.foo = (name) => `A random function, called by ${name}`
    expect(await remote.hello('Bob')).toBe('Alice says hello to Bob')
    expect(await remote.foo('Bob')).toBe('A random function, called by Bob')
  })

  test('resolves concurrent calls in the order they finish', async () => {
    const remote = pair({ wait: (ms: number) => new Promise((r) => setTimeout(() => r(ms), ms)) })
    const order = new Array<number>()
    await Promise.all(
      [30, 10, 20].map((ms) => remote.wait(ms).then((v) => order.push(v as number))),
    )
    expect(order).toEqual([10, 20, 30])
  })

  test('a remote can be awaited without making a call', async () => {
    const remote = pair(alice)
    const awaited: unknown = await (remote as unknown)
    expect(awaited).toBe(remote)
  })
})

describe('errors', () => {
  test('rejects with RemoteError carrying the code, message and data the method threw', async () => {
    const remote = pair({
      find(id: string) {
        throw new Rpc.RemoteError({ code: 404, message: 'No such user', data: { id } })
      },
    })
    const error = await remote.find('x').catch((e: unknown) => e)
    expect(error).toBeInstanceOf(Rpc.RemoteError)
    expect(error).toMatchObject({
      name: 'Rpc.RemoteError',
      code: 404,
      message: 'No such user',
      data: { id: 'x' },
    })
  })

  test('sends any other thrown or rejected error as -32603 with its message', async () => {
    const remote = pair({
      throws() {
        throw new Error('Test throwing')
      },
      rejects: () => Promise.reject(new Error('Test rejecting')),
      throwsString() {
        // oxlint-disable-next-line no-throw-literal
        throw 'plain'
      },
    })
    await expect(remote.throws()).rejects.toMatchObject({
      code: -32603,
      message: 'Test throwing',
      data: undefined,
    })
    await expect(remote.rejects()).rejects.toMatchObject({
      code: -32603,
      message: 'Test rejecting',
    })
    await expect(remote.throwsString()).rejects.toMatchObject({ code: -32603, message: 'plain' })
  })

  test('rejects a call to an unknown method with -32601', async () => {
    const remote = pair(alice) as any
    await expect(remote.foo('Bob')).rejects.toMatchObject({
      code: -32601,
      message: 'Method not found',
    })
  })

  test('does not call rpc.* methods or names inherited from Object.prototype', async () => {
    const remote = pair({ rpc: { discover: () => 'secret' }, value: { x: 1 } }) as any
    for (const call of [
      remote.rpc.discover(),
      remote.toString(),
      remote.constructor(),
      remote.hasOwnProperty('x'),
      remote.value.__proto__.toString(),
      remote.__proto__(),
    ]) {
      await expect(call).rejects.toMatchObject({ code: -32601 })
    }
  })

  test('calls an own method that shadows an Object.prototype name', async () => {
    const remote = pair({ toString: () => 'mine' })
    expect(await remote.toString()).toBe('mine')
  })

  test('answers undecodable input with a parse error', async () => {
    const server = raw(alice)
    expect(await server.send('{')).toEqual([
      { jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } },
    ])
  })

  test('rejects a call whose arguments the codec cannot encode', async () => {
    const remote = pair({ echo: (v: unknown) => v })
    await expect(remote.echo(1n)).rejects.toBeInstanceOf(TypeError)
    expect(await remote.echo(1)).toBe(1)
  })

  test('answers a result the codec cannot encode with an error, and keeps serving', async () => {
    const server = raw({ big: () => 1n, ok: () => 1 })
    await server.send('{"jsonrpc":"2.0","id":1,"method":"big"}')
    expect(await server.send('{"jsonrpc":"2.0","id":2,"method":"ok"}')).toEqual([
      { jsonrpc: '2.0', id: 2, result: 1 },
    ])
  })

  test('rejects calls and notifications when the transport fails to write', async () => {
    const failure = new Error('Custom async post error')
    const transport = {
      readable: new ReadableStream(),
      writable: new WritableStream({ write: () => Promise.reject(failure) }),
    }
    const remote = Rpc.connect<ReturnType<typeof bob>>(transport)
    await expect(remote.hi('Bob')).rejects.toBe(failure)
    await expect(Rpc.notify(remote.bump, [])).rejects.toBe(failure)
  })
})

describe('notifications', () => {
  test('notify runs the method without waiting for a result', async () => {
    const api = bob()
    const remote = pair(api)
    await Rpc.notify(remote.bump, [])
    expect(api.getCount()).toBe(0)
    await vi.waitFor(() => expect(api.getCount()).toBe(1))
    expect(await remote.bumpWithReturn()).toBe(2)
    await Rpc.notify(remote.bumpWithReturn, [])
    await vi.waitFor(() => expect(api.getCount()).toBe(3))
  })

  test('writes a notification without an id, and nothing comes back', async () => {
    const { transport, written } = silent()
    const remote = Rpc.connect<any>(transport)
    await Rpc.notify(remote.log, ['hi'])
    await Rpc.notify(remote['notifications/initialized'], {})
    expect(written).toEqual([
      '{"jsonrpc":"2.0","method":"log","params":["hi"]}',
      '{"jsonrpc":"2.0","method":"notifications/initialized","params":{}}',
    ])
    const server = raw({ fail: () => Promise.reject(new Error('foo')) })
    expect(await server.send('{"jsonrpc":"2.0","method":"fail"}')).toEqual([])
  })

  test('notify rejects with the reason of an aborted signal', async () => {
    const remote = pair(bob())
    const controller = new AbortController()
    controller.abort(new Error('stop'))
    await expect(Rpc.notify(remote.bump, [], { signal: controller.signal })).rejects.toThrow('stop')
  })
})

describe('call', () => {
  test('passes params by name as one argument', async () => {
    const remote = pair({
      subtract: (p: { minuend: number; subtrahend: number }) => p.minuend - p.subtrahend,
    }) as any
    expect(await Rpc.call(remote.subtract, { minuend: 42, subtrahend: 23 })).toBe(19)
  })

  test('passes positional params as arguments', async () => {
    const remote = pair({ add: (a: number, b: number) => a + b })
    expect(await Rpc.call(remote.add, [1, 2])).toBe(3)
  })

  test('throws a TypeError for a function that is not a remote method', () => {
    expect(() => Rpc.call((() => 1) as any, [])).toThrow(TypeError)
    expect(() => Rpc.notify((() => 1) as any, [])).toThrow(TypeError)
  })
})

describe('both directions', () => {
  test('each side serves an API to the other over one transport', async () => {
    const { port1, port2 } = new MessageChannel()
    const controller = new AbortController()
    const bobApi = bob()
    const toBob = Rpc.connect<typeof bobApi>(Rpc.port(port1), {
      methods: alice,
      signal: controller.signal,
    })
    const toAlice = Rpc.connect<typeof alice>(Rpc.port(port2), {
      methods: bobApi,
      signal: controller.signal,
    })
    expect(await toAlice.hello('Bob')).toBe('Hello Bob, my name is Alice')
    expect(await toBob.hi('Alice')).toBe('Hi Alice, I am Bob')
    controller.abort()
    port1.close()
  })

  test('a method can call back into the side that called it', async () => {
    const { port1, port2 } = new MessageChannel()
    const controller = new AbortController()
    const main = { progress: vi.fn<(percent: number) => void>() }
    const worker = Rpc.connect<{ ready(): string }>(Rpc.port(port2), {
      methods: main,
      signal: controller.signal,
    })
    const toMain = Rpc.connect<typeof main>(Rpc.port(port1), {
      methods: {
        async ready() {
          await toMain.progress(50)
          await toMain.progress(100)
          return 'done'
        },
      },
      signal: controller.signal,
    })
    expect(await worker.ready()).toBe('done')
    expect(main.progress.mock.calls).toEqual([[50], [100]])
    controller.abort()
    port1.close()
  })
})

describe('codecs', () => {
  test('encodes with the given codec on both sides', async () => {
    const encoder = new TextEncoder()
    const decoder = new TextDecoder()
    const bytes = {
      encode: (message: Rpc.Message) => encoder.encode(JSON.stringify(message)),
      decode: (data: Uint8Array) => JSON.parse(decoder.decode(data)),
    }
    const remote = pair(
      { add: (a: number, b: number) => a + b },
      { provide: { codec: bytes }, connect: { codec: bytes } },
    )
    expect(await remote.add(1, 2)).toBe(3)
  })

  test('the identity codec over a port keeps structured-clone values', async () => {
    const identity = { encode: (m: Rpc.Message) => m, decode: (m: unknown) => m }
    const remote = pair(
      { inspect: (d: Date, b: Uint8Array) => ({ year: d.getUTCFullYear(), bytes: b }) },
      { provide: { codec: identity }, connect: { codec: identity } },
    )
    const result = await remote.inspect(new Date('2020-01-01T00:00:00Z'), new Uint8Array([1, 2]))
    expect(result).toEqual({ year: 2020, bytes: new Uint8Array([1, 2]) })
  })

  test('the json codec decodes UTF-8 bytes', () => {
    const message = { jsonrpc: '2.0', id: 1, result: 'é' }
    expect(Rpc.json.decode(new TextEncoder().encode(JSON.stringify(message)))).toEqual(message)
    expect(Rpc.json.encode(message as Rpc.Message)).toBe(JSON.stringify(message))
  })
})

describe('cancellation', () => {
  test('a call with an aborted signal rejects with its reason and sends nothing', async () => {
    const { transport, written } = silent()
    const remote = Rpc.connect<any>(transport)
    const reason = new Error('stop')
    await expect(Rpc.call(remote.slow, [], { signal: AbortSignal.abort(reason) })).rejects.toBe(
      reason,
    )
    await settle()
    expect(written).toEqual([])
  })

  test('aborting a call rejects it and aborts the signal the method received', async () => {
    let methodSignal: AbortSignal | undefined
    const finished = deferred()
    const remote = pair({
      slow: Rpc.withContext(({ signal }) => {
        methodSignal = signal
        return new Promise((_, reject) =>
          signal.addEventListener('abort', () => {
            reject(new Error('aborted'))
            finished.resolve()
          }),
        )
      }),
    })
    const controller = new AbortController()
    const call = Rpc.call(remote.slow, [], { signal: controller.signal })
    await vi.waitFor(() => expect(methodSignal).toBeDefined())
    const reason = new Error('user cancelled')
    controller.abort(reason)
    await expect(call).rejects.toBe(reason)
    await finished.promise
    expect(methodSignal!.aborted).toBe(true)
  })

  test('the server answers $/cancel with -32800', async () => {
    const server = raw({ slow: () => new Promise(() => {}) })
    await server.send('{"jsonrpc":"2.0","id":7,"method":"slow"}')
    expect(await server.send('{"jsonrpc":"2.0","method":"$/cancel","params":{"id":7}}')).toEqual([
      { jsonrpc: '2.0', id: 7, error: { code: -32800, message: 'Request cancelled' } },
    ])
  })

  test('a call times out with AbortSignal.timeout when nothing answers', async () => {
    const { transport } = silent()
    const remote = Rpc.connect<typeof alice>(transport)
    const error = await Rpc.call(remote.hello, ['Bob'], { signal: AbortSignal.timeout(50) }).catch(
      (e: unknown) => e,
    )
    expect(error).toMatchObject({ name: 'TimeoutError' })
  })

  test('aborting the connection rejects waiting and later calls with the reason', async () => {
    const { transport } = silent()
    const controller = new AbortController()
    const remote = Rpc.connect<typeof alice>(transport, { signal: controller.signal })
    const waiting = remote.hello('Bob')
    const reason = new Error('Custom error')
    controller.abort(reason)
    await expect(waiting).rejects.toBe(reason)
    await expect(remote.hello('Bob')).rejects.toBe(reason)
  })

  test('aborting the connection aborts the methods it is running', async () => {
    const { port1, port2 } = new MessageChannel()
    const server = new AbortController()
    let methodSignal: AbortSignal | undefined
    Rpc.provide(
      Rpc.port(port1),
      { slow: Rpc.withContext(({ signal }) => ((methodSignal = signal), new Promise(() => {}))) },
      { signal: server.signal },
    )
    const client = new AbortController()
    const remote = Rpc.connect<{ slow(): void }>(Rpc.port(port2), { signal: client.signal })
    void remote.slow().catch(() => {})
    await vi.waitFor(() => expect(methodSignal).toBeDefined())
    server.abort()
    expect(methodSignal!.aborted).toBe(true)
    client.abort()
    port1.close()
  })

  test('the transport closing rejects waiting calls with TransportError', async () => {
    let close!: () => void
    const readable = new ReadableStream({ start: (c) => void (close = () => c.close()) })
    const remote = Rpc.connect<typeof alice>({ readable, writable: new WritableStream() })
    const first = remote.hello('first')
    const second = remote.hello('second')
    close()
    await expect(first).rejects.toBeInstanceOf(Rpc.TransportError)
    await expect(second).rejects.toMatchObject({ name: 'Rpc.TransportError' })
    await expect(remote.hello('third')).rejects.toBeInstanceOf(Rpc.TransportError)
  })

  test('the transport failing rejects waiting calls with TransportError and the cause', async () => {
    const failure = new Error('socket reset')
    let fail!: () => void
    const readable = new ReadableStream({ start: (c) => void (fail = () => c.error(failure)) })
    const remote = Rpc.connect<typeof alice>({ readable, writable: new WritableStream() })
    const call = remote.hello('Bob')
    fail()
    await expect(call).rejects.toMatchObject({ name: 'Rpc.TransportError', cause: failure })
  })

  test('a method wrapped by another copy of the package still gets the context', async () => {
    let methodSignal: AbortSignal | undefined
    const method = (context: { signal: AbortSignal }) => {
      methodSignal = context.signal
      return 'ok'
    }
    const wrapped = Object.defineProperty(() => 'wrapper', Symbol.for('portable.rpc.context'), {
      value: method,
    })
    const remote = pair({ wrapped })
    expect(await remote.wrapped()).toBe('ok')
    expect(methodSignal).toBeInstanceOf(AbortSignal)
  })

  test('Rpc.call accepts a method of a remote from another copy of the package', async () => {
    const client = {
      request: async (method: string, params: unknown) => [method, params],
      notify: async () => {},
    }
    const method = Object.defineProperty(async () => {}, Symbol.for('portable.rpc.target'), {
      value: { client, method: 'add' },
    })
    expect(await Rpc.call(method, [1, 2])).toEqual(['add', [1, 2]])
  })

  test('a withContext method called locally gets a signal that is not aborted', () => {
    const fn = Rpc.withContext(({ signal }, a: number) => (signal.aborted ? -1 : a))
    expect(fn(5)).toBe(5)
  })
})

describe('streams', () => {
  test('iterates the values of an async generator', async () => {
    const remote = pair({
      async *count(n: number) {
        for (let i = 0; i < n; i++) yield i
      },
    })
    const values = new Array<number>()
    for await (const value of remote.count(100)) values.push(value)
    expect(values).toEqual(Array.from({ length: 100 }, (_, i) => i))
  })

  test('awaiting a streaming call gives a ReadableStream', async () => {
    const remote = pair({
      events: () =>
        new ReadableStream<string>({
          start(c) {
            c.enqueue('a')
            c.enqueue('b')
            c.close()
          },
        }),
    })
    const stream = await remote.events()
    expect(stream).toBeInstanceOf(ReadableStream)
    const reader = stream.getReader()
    expect([
      (await reader.read()).value,
      (await reader.read()).value,
      (await reader.read()).done,
    ]).toEqual(['a', 'b', true])
  })

  test('the server produces at most 256 values ahead of a slow consumer', async () => {
    let produced = 0
    const remote = pair({
      async *numbers() {
        for (;;) yield produced++
      },
    })
    const reader = (await remote.numbers()).getReader()
    await reader.read()
    await settle()
    expect(produced).toBeGreaterThan(1)
    expect(produced).toBeLessThanOrEqual(257)
    for (let i = 0; i < 300; i++) await reader.read()
    await settle()
    expect(produced).toBeLessThanOrEqual(301 + 257)
    await reader.cancel()
  })

  test('breaking out of the loop stops the generator on the server', async () => {
    const stopped = deferred()
    const remote = pair({
      async *forever() {
        try {
          for (let i = 0; ; i++) yield i
        } finally {
          stopped.resolve()
        }
      },
    })
    const values = new Array<number>()
    for await (const value of remote.forever()) {
      values.push(value)
      if (value === 3) break
    }
    await stopped.promise
    expect(values).toEqual([0, 1, 2, 3])
  })

  test('an error thrown by the generator rejects the loop with RemoteError', async () => {
    const remote = pair({
      async *failing() {
        yield 1
        throw new Rpc.RemoteError({ code: 1, message: 'broken' })
      },
    })
    const values = new Array<number>()
    const error = await (async () => {
      for await (const value of remote.failing()) values.push(value)
    })().catch((e: unknown) => e)
    expect(values).toEqual([1])
    expect(error).toMatchObject({ name: 'Rpc.RemoteError', code: 1, message: 'broken' })
  })

  test('iterating a result that is not a stream throws a TypeError', async () => {
    const remote = pair({ one: () => 1 }) as any
    await expect(
      (async () => {
        for await (const _ of remote.one());
      })(),
    ).rejects.toBeInstanceOf(TypeError)
  })

  test('aborting a streaming call errors the stream and stops the source', async () => {
    const stopped = deferred()
    let timer: ReturnType<typeof setInterval> | undefined
    const remote = pair({
      ticks: () =>
        new ReadableStream({
          start: (c) => void (timer = setInterval(() => c.enqueue('tick'), 5)),
          cancel() {
            clearInterval(timer)
            stopped.resolve()
          },
        }),
    })
    const controller = new AbortController()
    const reader = (await Rpc.call(remote.ticks, [], { signal: controller.signal })).getReader()
    expect((await reader.read()).value).toBe('tick')
    const reason = new Error('stop')
    controller.abort(reason)
    await expect(reader.read()).rejects.toBe(reason)
    await stopped.promise
  })

  test('sends the stream messages on the wire', async () => {
    const server = raw({
      async *two() {
        yield 'a'
        yield 'b'
      },
    })
    expect(await server.send('{"jsonrpc":"2.0","id":1,"method":"two"}')).toEqual([
      { jsonrpc: '2.0', method: '$/stream', params: { id: 1 } },
    ])
    expect(
      await server.send(
        '{"jsonrpc":"2.0","method":"$/stream/credit","params":{"id":1,"credit":1}}',
      ),
    ).toEqual([{ jsonrpc: '2.0', method: '$/stream/next', params: { id: 1, value: 'a' } }])
    expect(
      await server.send(
        '{"jsonrpc":"2.0","method":"$/stream/credit","params":{"id":1,"credit":5}}',
      ),
    ).toEqual([
      { jsonrpc: '2.0', method: '$/stream/next', params: { id: 1, value: 'b' } },
      { jsonrpc: '2.0', id: 1, result: null },
    ])
  })
})
