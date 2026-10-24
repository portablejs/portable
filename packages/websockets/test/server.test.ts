import * as WebSockets from '@portable/websockets'
import { afterEach, describe, expect, test } from 'vite-plus/test'
import { WebSocket as WsClient, type WebSocket as ServerSocket } from 'ws'
import { echo, listen, text } from './server.js'
import { bytes, errorOf, read, sleep, until } from './utils.js'

const cleanup: (() => unknown)[] = []
afterEach(async () => {
  for (const fn of cleanup.splice(0)) await fn()
})

async function start(onConnection?: (socket: ServerSocket) => void) {
  const server = await listen(onConnection)
  cleanup.push(server.close)
  return server
}

function open(url: string, options: WebSockets.connect.Options = {}) {
  const controller = new AbortController()
  cleanup.push(() => controller.abort())
  return WebSockets.connect(url, { delay: 10, signal: controller.signal, ...options })
}

describe('connect against a ws server', () => {
  test('echoes text and binary messages', async () => {
    const { url } = await start()
    const { readable, writable } = open(url)
    const writer = writable.getWriter()
    await writer.write('héllo 🚀')
    await writer.write(bytes(0, 1, 255))
    expect(await read(readable.getReader(), 2)).toEqual(['héllo 🚀', bytes(0, 1, 255)])
  })

  test('reconnects after the server terminates the connection and sends queued writes', async () => {
    const connections: ServerSocket[] = []
    const { url } = await start((socket) => {
      connections.push(socket)
      echo(socket)
    })
    const signals: AbortSignal[] = []
    const { readable, writable } = open(url, {
      async open({ signal }) {
        signals.push(signal)
        if (signals.length === 2) await sleep(50)
      },
    })
    const reader = readable.getReader()
    const writer = writable.getWriter()
    await writer.write('before')
    expect(await read(reader)).toEqual(['before'])

    connections[0]!.terminate()
    await until(() => signals[0]!.aborted)
    await writer.write('during')
    expect(await read(reader)).toEqual(['during'])
    expect(connections).toHaveLength(2)
  })

  test('reconnects after the server restarts on the same port', async () => {
    const first = await listen()
    const signals: AbortSignal[] = []
    const { readable, writable } = open(first.url, {
      open: ({ signal }) => void signals.push(signal),
    })
    const reader = readable.getReader()
    const writer = writable.getWriter()
    await writer.write('one')
    expect(await read(reader)).toEqual(['one'])

    await first.close()
    await until(() => signals[0]!.aborted)
    await writer.write('two')
    const second = await listen(echo, { port: first.port })
    cleanup.push(second.close)
    expect(await read(reader)).toEqual(['two'])
  })

  test('runs open on each connection before queued writes', async () => {
    const received: string[] = []
    const connections: ServerSocket[] = []
    const { url } = await start((socket) => {
      connections.push(socket)
      socket.on('message', (data) => {
        received.push(text(data))
        if (text(data) === 'auth') socket.send('ok')
      })
    })
    const signals: AbortSignal[] = []
    const { writable } = open(url, {
      async open({ send, messages, signal }) {
        signals.push(signal)
        send('auth')
        const { value } = await messages.getReader().read()
        if (value !== 'ok') throw new Error('not authorized')
      },
    })
    const writer = writable.getWriter()
    await writer.write('a')
    await until(() => received.length === 2)
    connections[0]!.terminate()
    await until(() => signals[0]!.aborted)
    await writer.write('b')
    await until(() => received.length === 4)
    expect(received).toEqual(['auth', 'a', 'auth', 'b'])
  })

  test('the server closing with 1000 ends readable', async () => {
    const { url } = await start((socket) => socket.close(1000, 'done'))
    const { readable } = open(url)
    expect(await read(readable.getReader())).toEqual([])
  })

  test('the server closing with 1008 fails readable without reconnecting', async () => {
    let connections = 0
    const { url } = await start((socket) => {
      connections++
      socket.close(1008, 'policy')
    })
    const { readable } = open(url)
    expect(await errorOf(readable.getReader().read())).toMatchObject({
      code: 1008,
      reason: 'policy',
    })
    await sleep(50)
    expect(connections).toBe(1)
  })

  test('the heartbeat replaces a connection whose server stopped answering', async () => {
    let connections = 0
    const { url } = await start((socket) => {
      connections++
      if (connections > 1) socket.on('message', () => socket.send('pong'))
    })
    open(url, { heartbeat: { ping: 'ping', pong: (m) => m === 'pong', interval: 20 } })
    await until(() => connections === 2)
    await sleep(100)
    expect(connections).toBe(2)
  })

  test('writable.close() closes the connection with 1000', async () => {
    let code: number | undefined
    const { url } = await start((socket) => socket.on('close', (c) => (code = c)))
    const { readable, writable } = open(url)
    const writer = writable.getWriter()
    await writer.write('x')
    await writer.close()
    expect(await read(readable.getReader())).toEqual([])
    await until(() => code !== undefined)
    expect(code).toBe(1000)
  })

  test('aborting while the ws client is still connecting does not crash', async () => {
    const { url } = await listen(echo, { verifyClient: (_info, _done) => {} })
    cleanup.push(() => controller.abort())
    const controller = new AbortController()
    const { readable } = WebSockets.connect(url, {
      WebSocket: WsClient as unknown as WebSockets.connect.Constructor,
      signal: controller.signal,
    })
    await sleep(50)
    controller.abort()
    expect(await errorOf(readable.getReader().read())).toMatchObject({ name: 'AbortError' })
    await sleep(50)
  })
})

describe('fromSocket on the server side', () => {
  test('echoes through a pipe', async () => {
    const { url } = await start((socket) => {
      const { readable, writable } = WebSockets.fromSocket(socket as unknown as WebSockets.Socket)
      void readable.pipeTo(writable).catch(() => {})
    })
    const { readable, writable } = open(url)
    const writer = writable.getWriter()
    await writer.write('ping')
    await writer.write(bytes(7))
    expect(await read(readable.getReader(), 2)).toEqual(['ping', bytes(7)])
  })
})
