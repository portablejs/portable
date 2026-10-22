import * as WebSockets from '@portable/websockets'
import ReconnectingWebSocketModule from 'reconnecting-websocket'
import { afterEach, describe, expect, test } from 'vite-plus/test'
import type { WebSocket as ServerSocket } from 'ws'
import { listen, text } from './server.js'
import { read, until } from './utils.js'

// The package's types describe its CommonJS build, where the class is `.default`. Vite loads the ES module build.
const ReconnectingWebSocket =
  ReconnectingWebSocketModule as unknown as typeof ReconnectingWebSocketModule.default

const cleanup: (() => unknown)[] = []
afterEach(async () => {
  for (const fn of cleanup.splice(0)) await fn()
})

function random(seed: number) {
  let state = seed
  return () => {
    state = (state * 1103515245 + 12345) % 2 ** 31
    return state / 2 ** 31
  }
}

function messages(seed: number): WebSockets.Message[] {
  const next = random(seed)
  const alphabet = ['a', 'é', '🚀', ' ', '\n', '烫', '"']
  return Array.from({ length: 50 }, () => {
    const length = Math.floor(next() * 2000)
    if (next() < 0.5) {
      const bytes = new Uint8Array(length)
      for (let i = 0; i < length; i++) bytes[i] = Math.floor(next() * 256)
      return bytes
    }
    return Array.from({ length }, () => alphabet[Math.floor(next() * alphabet.length)]).join('')
  })
}

function viaUpstream(url: string, count: number, sent: WebSockets.Message[] = []) {
  const socket = new ReconnectingWebSocket(url, [], { minReconnectionDelay: 10 })
  socket.binaryType = 'arraybuffer'
  cleanup.push(() => socket.close())
  for (const message of sent) socket.send(message)
  const received: WebSockets.Message[] = []
  socket.addEventListener('message', (event: MessageEvent) => {
    const data: unknown = event.data
    received.push(data instanceof ArrayBuffer ? new Uint8Array(data) : String(data))
  })
  return until(() => received.length >= count, 10_000).then(() => received)
}

async function viaOurs(url: string, count: number, sent: WebSockets.Message[] = []) {
  const controller = new AbortController()
  cleanup.push(() => controller.abort())
  const { readable, writable } = WebSockets.connect(url, { delay: 10, signal: controller.signal })
  const writer = writable.getWriter()
  for (const message of sent) await writer.write(message)
  return read(readable.getReader(), count)
}

describe('matches reconnecting-websocket', () => {
  for (const seed of [1, 2, 3]) {
    test(`echoes random text and binary messages sent before the socket opens, seed ${seed}`, async () => {
      const { url, close } = await listen()
      cleanup.push(close)
      const sent = messages(seed)
      const ours = await viaOurs(url, sent.length, sent)
      expect(ours).toEqual(await viaUpstream(url, sent.length, sent))
      expect(ours).toEqual(sent)
    })
  }

  test('receives the messages of each connection in order across server-side closes', async () => {
    const counts = new Map<string, number>()
    const { url, close } = await listen(
      (socket: ServerSocket, request: { url?: string | undefined }) => {
        const client = new URL(request.url!, 'ws://x').searchParams.get('client')!
        const n = (counts.get(client) ?? 0) + 1
        counts.set(client, n)
        for (let i = 0; i < 3; i++) socket.send(`connection ${n} message ${i}`)
        socket.close(n < 3 ? 4000 : 1001)
      },
    )
    cleanup.push(close)
    const ours = await viaOurs(`${url}/?client=ours`, 9)
    const upstream = await viaUpstream(`${url}/?client=upstream`, 9)
    expect(ours).toEqual(upstream)
    expect(ours.at(-1)).toBe('connection 3 message 2')
  })

  test('sends queued messages in order once connected', async () => {
    const received = new Map<string, string[]>()
    const { url, close } = await listen(
      (socket: ServerSocket, request: { url?: string | undefined }) => {
        const client = new URL(request.url!, 'ws://x').searchParams.get('client')!
        socket.on('message', (data) => {
          received.set(client, [...(received.get(client) ?? []), text(data)])
          socket.send('ack')
        })
      },
    )
    cleanup.push(close)
    const sent = ['message1', 'message2', 'message3']
    await viaOurs(`${url}/?client=ours`, 3, sent)
    await viaUpstream(`${url}/?client=upstream`, 3, sent)
    expect(received.get('ours')).toEqual(received.get('upstream'))
    expect(received.get('ours')).toEqual(sent)
  })
})
