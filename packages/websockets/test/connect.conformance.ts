import * as WebSockets from '@portable/websockets'
import { describe, expect, test } from 'vite-plus/test'
import { FakeServer, bytes, errorOf, read, sleep, until } from './utils.js'

const url = 'wss://example.com/socket'

function setup(options: WebSockets.connect.Options = {}) {
  const server = new FakeServer()
  const socket = WebSockets.connect(url, { WebSocket: server.WebSocket, delay: 0, ...options })
  return { server, ...socket }
}

describe('connecting', () => {
  test('opens the first socket without waiting for the delay', () => {
    const { server } = setup({ delay: 60_000 })
    expect(server.sockets).toHaveLength(1)
  })

  test('passes the URL and protocols to the WebSocket class', async () => {
    const one = setup({ protocols: 'chat' })
    expect(one.server.sockets[0]!.url).toBe(url)
    expect(one.server.sockets[0]!.protocols).toBe('chat')
    const list = setup({ protocols: ['a', 'b'] })
    expect(list.server.sockets[0]!.protocols).toEqual(['a', 'b'])
    const none = setup()
    expect(none.server.sockets[0]!.protocols).toBeUndefined()
  })

  test('accepts a URL object', () => {
    const server = new FakeServer()
    WebSockets.connect(new URL(url), { WebSocket: server.WebSocket })
    expect(server.sockets[0]!.url).toBe(url)
  })

  test('throws a TypeError when there is no WebSocket class', () => {
    const notAClass = 123 as unknown as WebSockets.connect.Constructor
    expect(() => WebSockets.connect(url, { WebSocket: notAClass })).toThrow(TypeError)
  })

  test('throws a RangeError for invalid options', () => {
    const { WebSocket } = new FakeServer()
    expect(() => WebSockets.connect(url, { WebSocket, attempts: 0 })).toThrow(RangeError)
    expect(() => WebSockets.connect(url, { WebSocket, maxQueued: Number.NaN })).toThrow(RangeError)
    expect(() => WebSockets.connect(url, { WebSocket, delay: -5 })).toThrow(RangeError)
    expect(() => WebSockets.connect(url, { WebSocket, timeout: 0 })).toThrow(RangeError)
  })

  test('calls a URL function on every attempt', async () => {
    const server = new FakeServer()
    let calls = 0
    WebSockets.connect(
      async () => {
        calls++
        return `${url}?token=${calls}`
      },
      { WebSocket: server.WebSocket, delay: 0 },
    )
    ;(await server.accept(0)).drop()
    await server.accept(1)
    expect(server.sockets.map((socket) => socket.url)).toEqual([`${url}?token=1`, `${url}?token=2`])
  })

  test('retries when the URL function throws', async () => {
    const server = new FakeServer()
    let calls = 0
    WebSockets.connect(
      () => {
        if (++calls === 2) throw new Error('token fetch failed')
        return url
      },
      { WebSocket: server.WebSocket, delay: 0 },
    )
    ;(await server.accept(0)).drop()
    await server.accept(1)
    expect(calls).toBe(3)
  })

  test('fails without retrying when the WebSocket class rejects a fixed URL', async () => {
    let attempts = 0
    class Rejecting {
      constructor() {
        attempts++
        throw new DOMException('Invalid URL', 'SyntaxError')
      }
    }
    const { readable } = WebSockets.connect('not a url', {
      WebSocket: Rejecting as unknown as WebSockets.connect.Constructor,
      delay: 0,
    })
    const error = await errorOf(readable.getReader().read())
    expect(error).toMatchObject({ name: 'SyntaxError' })
    expect(attempts).toBe(1)
  })

  test('sets binaryType to arraybuffer on every socket', async () => {
    const { server } = setup()
    const first = await server.accept(0)
    expect(first.binaryType).toBe('arraybuffer')
    first.drop()
    expect((await server.accept(1)).binaryType).toBe('arraybuffer')
  })
})

describe('sending and receiving', () => {
  test('sends and receives text', async () => {
    const { server, readable, writable } = setup()
    const socket = await server.accept()
    await writable.getWriter().write('hello')
    expect(socket.sent).toEqual(['hello'])
    socket.receive('world')
    expect(await read(readable.getReader())).toEqual(['world'])
  })

  test('receives binary messages as Uint8Array', async () => {
    const { server, readable } = setup()
    const socket = await server.accept()
    socket.receive(bytes(1, 2, 3).buffer)
    const [message] = await read(readable.getReader())
    expect(message).toBeInstanceOf(Uint8Array)
    expect(message).toEqual(bytes(1, 2, 3))
  })

  test('sends Uint8Array writes as binary', async () => {
    const { server, writable } = setup()
    const socket = await server.accept()
    await writable.getWriter().write(bytes(9, 8))
    expect(socket.sent).toEqual([bytes(9, 8)])
  })

  test('keeps the same streams across reconnects', async () => {
    const { server, readable, writable } = setup()
    const reader = readable.getReader()
    const writer = writable.getWriter()
    const first = await server.accept(0)
    first.receive('one')
    await writer.write('a')
    first.drop()
    const second = await server.accept(1)
    second.receive('two')
    await writer.write('b')
    expect(await read(reader, 2)).toEqual(['one', 'two'])
    expect(first.sent).toEqual(['a'])
    expect(second.sent).toEqual(['b'])
  })

  test('ignores events from a replaced socket', async () => {
    const { server, readable } = setup()
    const reader = readable.getReader()
    const first = await server.accept(0)
    first.drop()
    const second = await server.accept(1)
    first.receive('stale')
    first.dispatchEvent(Object.assign(new Event('close'), { code: 1000, reason: '' }))
    second.receive('fresh')
    expect(await read(reader)).toEqual(['fresh'])
    expect(second.readyState).toBe(1)
  })
})

describe('writes while disconnected', () => {
  test('are queued and sent in order once connected', async () => {
    const { server, writable } = setup()
    const writer = writable.getWriter()
    await writer.write('m1')
    await writer.write('m2')
    await writer.write('m3')
    const socket = await server.accept()
    expect(socket.sent).toEqual(['m1', 'm2', 'm3'])
  })

  test('wait once maxQueued writes are queued', async () => {
    const { server, writable } = setup({ maxQueued: 2 })
    const writer = writable.getWriter()
    await writer.write('m1')
    await writer.write('m2')
    let done = false
    const third = writer.write('m3').then(() => (done = true))
    await sleep(10)
    expect(done).toBe(false)
    const socket = await server.accept()
    await third
    expect(socket.sent).toEqual(['m1', 'm2', 'm3'])
  })

  test('with maxQueued 0 wait for a connection', async () => {
    const { server, writable } = setup({ maxQueued: 0 })
    let done = false
    const write = writable
      .getWriter()
      .write('now')
      .then(() => (done = true))
    await sleep(10)
    expect(done).toBe(false)
    const socket = await server.accept()
    await write
    expect(socket.sent).toEqual(['now'])
  })

  test('made after a drop are sent on the next connection', async () => {
    const { server, writable } = setup()
    const writer = writable.getWriter()
    const first = await server.accept(0)
    first.drop()
    await writer.write('later')
    const second = await server.accept(1)
    expect(first.sent).toEqual([])
    expect(second.sent).toEqual(['later'])
  })

  test('are not sent on a socket that is closing', async () => {
    const { server, writable } = setup()
    const writer = writable.getWriter()
    const first = await server.accept(0)
    first.readyState = 2
    await writer.write('m')
    first.drop()
    const second = await server.accept(1)
    expect(second.sent).toEqual(['m'])
  })
})

describe('open', () => {
  test('runs on every connection before queued writes are sent', async () => {
    const order = new Array<string>()
    const { server, writable } = setup({
      open({ send }) {
        order.push('open')
        send('auth')
      },
    })
    await writable.getWriter().write('queued')
    const first = await server.accept(0)
    await until(() => first.sent.length === 2)
    expect(first.sent).toEqual(['auth', 'queued'])
    first.drop()
    const second = await server.accept(1)
    await until(() => second.sent.length === 1)
    expect(second.sent).toEqual(['auth'])
    expect(order).toEqual(['open', 'open'])
  })

  test('holds queued writes until it resolves', async () => {
    let finish!: () => void
    const { server, writable } = setup({ open: () => new Promise<void>((r) => (finish = r)) })
    await writable.getWriter().write('queued')
    const socket = await server.accept()
    await sleep(5)
    expect(socket.sent).toEqual([])
    finish()
    await until(() => socket.sent.length === 1)
  })

  test('reads messages and leaves the rest for readable', async () => {
    const { server, readable } = setup({
      async open({ send, messages }) {
        send('login')
        const reader = messages.getReader()
        const { value } = await reader.read()
        if (value !== 'welcome') throw new Error('rejected')
        reader.releaseLock()
      },
    })
    const socket = await server.accept()
    socket.receive('welcome')
    socket.receive('first update')
    expect(await read(readable.getReader())).toEqual(['first update'])
  })

  test('messages it never reads go to readable in order', async () => {
    let finish!: () => void
    const { server, readable } = setup({ open: () => new Promise<void>((r) => (finish = r)) })
    const socket = await server.accept()
    socket.receive('a')
    socket.receive('b')
    finish()
    socket.receive('c')
    expect(await read(readable.getReader(), 3)).toEqual(['a', 'b', 'c'])
  })

  test('closes the socket and reconnects when it throws, keeping queued writes', async () => {
    let calls = 0
    const { server, writable } = setup({
      open() {
        if (++calls === 1) throw new Error('auth failed')
      },
    })
    await writable.getWriter().write('queued')
    const first = await server.accept(0)
    const second = await server.accept(1)
    await until(() => second.sent.length === 1)
    expect(first.closedWith).toBeDefined()
    expect(first.sent).toEqual([])
    expect(second.sent).toEqual(['queued'])
  })

  test('times out and reconnects when it never finishes', async () => {
    let calls = 0
    const { server } = setup({
      timeout: 20,
      open: () => (++calls === 1 ? new Promise<void>(() => {}) : undefined),
    })
    const first = await server.accept(0)
    await server.accept(1)
    expect(first.closedWith).toBeDefined()
  })

  test('gets a signal that aborts when the connection closes', async () => {
    let signal: AbortSignal | undefined
    const { server } = setup({ open: (context) => void (signal = context.signal) })
    const socket = await server.accept()
    await until(() => signal !== undefined)
    expect(signal!.aborted).toBe(false)
    socket.drop()
    expect(signal!.aborted).toBe(true)
  })

  test('send throws once the connection has closed', async () => {
    let send: ((message: string) => void) | undefined
    const { server } = setup({ open: (context) => void (send = context.send) })
    const socket = await server.accept()
    await until(() => send !== undefined)
    socket.drop()
    expect(() => send!('late')).toThrow(DOMException)
  })
})

describe('reconnecting', () => {
  test('reconnects after a dropped connection', async () => {
    const { server } = setup()
    ;(await server.accept(0)).drop(1006)
    ;(await server.accept(1)).drop(1001)
    ;(await server.accept(2)).drop(4000, 'try later')
    await server.accept(3)
    expect(server.sockets).toHaveLength(4)
  })

  test('reconnects after a failed attempt', async () => {
    const { server } = setup()
    ;(await server.socket(0)).fail()
    expect((await server.accept(1)).readyState).toBe(1)
  })

  test('closes readable when the server closes with 1000', async () => {
    const { server, readable, writable } = setup()
    const socket = await server.accept()
    socket.receive('last')
    socket.drop(1000, 'bye')
    expect(await read(readable.getReader(), 2)).toEqual(['last'])
    const error = await errorOf(writable.getWriter().write('x'))
    expect(error).toBeInstanceOf(WebSockets.CloseError)
    await sleep(10)
    expect(server.sockets).toHaveLength(1)
  })

  test('fails with a CloseError for a final close code', async () => {
    const { server, readable } = setup()
    ;(await server.accept()).drop(1008, 'policy')
    const error = await errorOf(readable.getReader().read())
    expect(error).toBeInstanceOf(WebSockets.CloseError)
    expect(error).toMatchObject({ code: 1008, reason: 'policy', name: 'WebSockets.CloseError' })
    await sleep(10)
    expect(server.sockets).toHaveLength(1)
  })

  test('reconnectIf decides which closes are final', async () => {
    const seen = new Array<number>()
    const { server, readable } = setup({
      reconnectIf: ({ code }) => {
        seen.push(code)
        return code !== 4001
      },
    })
    ;(await server.accept(0)).drop(1000)
    ;(await server.accept(1)).drop(4001, 'unauthorized')
    expect(await errorOf(readable.getReader().read())).toMatchObject({ code: 4001 })
    expect(seen).toEqual([1000, 4001])
  })

  test.each([1, 2, 6])('gives up with the last error when attempts is %i', async (attempts) => {
    const { server, readable } = setup({ attempts })
    const reader = readable.getReader()
    for (let i = 0; i < attempts; i++) (await server.socket(i)).fail()
    expect(await errorOf(reader.read())).toMatchObject({ code: 1006 })
    await sleep(10)
    expect(server.sockets).toHaveLength(attempts)
  })

  test('a successful connection resets the attempt count', async () => {
    const { server, readable } = setup({ attempts: 2 })
    ;(await server.socket(0)).fail()
    ;(await server.accept(1)).drop()
    await server.accept(2)
    let failed = false
    readable.getReader().closed.catch(() => (failed = true))
    await sleep(10)
    expect(failed).toBe(false)
  })

  test('times out an attempt that never opens', async () => {
    const { server, readable } = setup({ timeout: 20, attempts: 2 })
    const error = await errorOf(readable.getReader().read())
    expect(error).toMatchObject({ name: 'TimeoutError' })
    expect(server.sockets).toHaveLength(2)
    expect(server.sockets[0]!.closedWith).toBeDefined()
  })

  test('passes the failure count and error to a delay function', async () => {
    const calls = new Array<[number, unknown]>()
    const { server } = setup({
      delay: (attempt, error) => {
        calls.push([attempt, error])
        return 0
      },
    })
    ;(await server.socket(0)).fail()
    ;(await server.socket(1)).fail()
    ;(await server.accept(2)).drop()
    await server.socket(3)
    expect(calls.map(([attempt]) => attempt)).toEqual([1, 2, 1])
    expect(calls[0]![1]).toBeInstanceOf(WebSockets.CloseError)
  })

  test('waits the delay before reconnecting', async () => {
    const { server } = setup({ delay: 40 })
    const start = Date.now()
    ;(await server.socket(0)).fail()
    await server.socket(1)
    expect(Date.now() - start).toBeGreaterThanOrEqual(35)
  })

  test('waits the backoff cap when jitter is off', async () => {
    const { server } = setup({ delay: { initial: 20, max: 30, jitter: false } })
    ;(await server.socket(0)).fail()
    let start = Date.now()
    ;(await server.socket(1)).fail()
    expect(Date.now() - start).toBeGreaterThanOrEqual(15)
    start = Date.now()
    await server.socket(2)
    expect(Date.now() - start).toBeGreaterThanOrEqual(25)
  })

  test('caps a delay longer than the timer limit instead of retrying at once', async () => {
    const { server } = setup({ delay: 2 ** 31 + 10 })
    ;(await server.socket(0)).fail()
    await sleep(20)
    expect(server.sockets).toHaveLength(1)
  })
})

describe('closing', () => {
  test('writable.close() sends queued writes, then closes with 1000 for good', async () => {
    const { server, readable, writable } = setup()
    const writer = writable.getWriter()
    await writer.write('last')
    const closed = writer.close()
    const socket = await server.accept()
    await closed
    expect(socket.sent).toEqual(['last'])
    expect(socket.closedWith).toEqual({ code: 1000, reason: undefined })
    expect(await read(readable.getReader())).toEqual([])
    await sleep(10)
    expect(server.sockets).toHaveLength(1)
  })

  test('writable.close() before the socket opens opens nothing', async () => {
    const { server, readable, writable } = setup()
    await writable.close()
    expect(await read(readable.getReader())).toEqual([])
    expect(server.sockets[0]!.closedWith).toEqual({ code: 1000, reason: undefined })
  })

  test('closing twice closes the socket once', async () => {
    const { server, writable } = setup()
    const socket = await server.accept()
    const writer = writable.getWriter()
    await writer.close()
    await expect(writer.close()).rejects.toThrow(TypeError)
    expect(socket.closedWith).toEqual({ code: 1000, reason: undefined })
  })

  test('the signal closes the socket with 1000 and fails both streams', async () => {
    const controller = new AbortController()
    const { server, readable, writable } = setup({ signal: controller.signal })
    const socket = await server.accept()
    controller.abort(new Error('done'))
    expect(socket.closedWith).toEqual({ code: 1000, reason: undefined })
    expect(await errorOf(readable.getReader().read())).toMatchObject({ message: 'done' })
    expect(await errorOf(writable.getWriter().write('x'))).toMatchObject({ message: 'done' })
    await sleep(10)
    expect(server.sockets).toHaveLength(1)
  })

  test('an aborted signal opens no socket', async () => {
    const server = new FakeServer()
    const { readable } = WebSockets.connect(url, {
      WebSocket: server.WebSocket,
      signal: AbortSignal.abort(),
    })
    expect(await errorOf(readable.getReader().read())).toMatchObject({ name: 'AbortError' })
    expect(server.sockets).toHaveLength(0)
  })

  test('cancelling readable closes the socket and stops reconnecting', async () => {
    const { server, readable, writable } = setup()
    const socket = await server.accept()
    await readable.cancel()
    expect(socket.closedWith).toEqual({ code: 1000, reason: undefined })
    await expect(writable.getWriter().write('x')).rejects.toMatchObject({ name: 'AbortError' })
    await sleep(10)
    expect(server.sockets).toHaveLength(1)
  })

  test('aborting writable closes the socket and fails readable', async () => {
    const { server, readable, writable } = setup()
    const socket = await server.accept()
    await writable.abort(new Error('stop'))
    expect(socket.closedWith).toEqual({ code: 1000, reason: undefined })
    expect(await errorOf(readable.getReader().read())).toMatchObject({ message: 'stop' })
  })

  test('closing a socket that is still connecting does not throw', async () => {
    const controller = new AbortController()
    const { server } = setup({ signal: controller.signal })
    const socket = await server.socket(0)
    controller.abort()
    expect(socket.closedWith).toEqual({ code: 1000, reason: undefined })
  })
})

describe('backpressure', () => {
  test('writes wait while bufferedAmount is above highWaterMark', async () => {
    const { server, writable } = setup({ highWaterMark: 10 })
    const socket = await server.accept()
    const writer = writable.getWriter()
    socket.bufferedAmount = 11
    let done = false
    const write = writer.write('x').then(() => (done = true))
    await sleep(15)
    expect(done).toBe(false)
    expect(socket.sent).toEqual([])
    socket.bufferedAmount = 0
    await write
    expect(socket.sent).toEqual(['x'])
  })

  test('readable queues messages while the reader is behind', async () => {
    const { server, readable } = setup()
    const socket = await server.accept()
    for (let i = 0; i < 100; i++) socket.receive(`m${i}`)
    const messages = await read(readable.getReader(), 100)
    expect(messages).toHaveLength(100)
    expect(messages[99]).toBe('m99')
  })

  test('maxBuffered fails both streams and closes the socket', async () => {
    const { server, readable, writable } = setup({ maxBuffered: 5 })
    const socket = await server.accept()
    socket.receive('abc')
    socket.receive('def')
    const error = await errorOf(readable.getReader().read())
    expect(error).toBeInstanceOf(WebSockets.MaxBufferedError)
    expect(error).toMatchObject({ maxBuffered: 5, name: 'WebSockets.MaxBufferedError' })
    expect(socket.closedWith).toBeDefined()
    await expect(writable.getWriter().write('x')).rejects.toBe(error)
  })
})

describe('heartbeat', () => {
  test('sends the ping and hides the pong from readable', async () => {
    const { server, readable } = setup({
      heartbeat: { ping: 'ping', pong: (message) => message === 'pong', interval: 10 },
    })
    const socket = await server.accept()
    await until(() => socket.sent.length > 0)
    expect(socket.sent[0]).toBe('ping')
    socket.receive('pong')
    socket.receive('data')
    expect(await read(readable.getReader())).toEqual(['data'])
  })

  test('reconnects when no pong arrives in time', async () => {
    const { server } = setup({
      heartbeat: { ping: 'ping', pong: (message) => message === 'pong', interval: 10, timeout: 10 },
    })
    const first = await server.accept(0)
    await server.socket(1)
    expect(first.closedWith).toBeDefined()
  })

  test('keeps the connection while pongs arrive', async () => {
    const { server } = setup({
      heartbeat: {
        ping: 'ping',
        pong: (message) => message === 'pong',
        interval: 50,
        timeout: 300,
      },
    })
    const socket = await server.accept()
    const answer = setInterval(() => {
      if (socket.sent.at(-1) === 'ping') socket.receive('pong')
    }, 1)
    await sleep(800)
    clearInterval(answer)
    expect(server.sockets).toHaveLength(1)
  })
})
