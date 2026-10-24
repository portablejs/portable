import { byteForms, toByteForm } from '@portable/fuzz'
import * as WebSockets from '@portable/websockets'
import { describe, expect, test } from 'vite-plus/test'
import { FakeServer, FakeWebSocket, until } from './utils.js'

const data = new Uint8Array([1, 2, 3])

describe('byte inputs', () => {
  for (const form of byteForms) {
    test(`fromSocket sends a ${form} as the bytes in its range`, async () => {
      const socket = new FakeWebSocket('wss://example.com')
      socket.accept()
      const { writable } = WebSockets.fromSocket(socket)
      await writable.getWriter().write(toByteForm(data, form))
      expect(socket.sent).toEqual([data])
      expect((socket.sent[0] as Uint8Array).buffer).toBeInstanceOf(ArrayBuffer)
    })

    test(`connect sends a ${form} from writable, open and the heartbeat`, async () => {
      const server = new FakeServer()
      const { writable } = WebSockets.connect('wss://example.com', {
        WebSocket: server.WebSocket,
        delay: 0,
        open: ({ send }) => send(toByteForm(data, form)),
        heartbeat: { ping: toByteForm(data, form), pong: () => true, interval: 10 },
      })
      const socket = await server.accept()
      const writer = writable.getWriter()
      await writer.write(toByteForm(data, form))
      await until(() => socket.sent.length >= 3)
      expect(socket.sent.slice(0, 3)).toEqual([data, data, data])
      await writer.abort()
    })
  }
})
