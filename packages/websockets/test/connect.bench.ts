import * as WebSockets from '@portable/websockets'
import PartySocket from 'partysocket/ws'
import ReconnectingWebSocketModule from 'reconnecting-websocket'
import { afterAll, expect, test } from 'vite-plus/test'
import { Websocket, WebsocketEvent } from 'websocket-ts'
import { listen } from './server.js'

// The package's types describe its CommonJS build, where the class is `.default`. Vite loads the ES module build.
const ReconnectingWebSocket =
  ReconnectingWebSocketModule as unknown as typeof ReconnectingWebSocketModule.default

const count = 1000
const message = 'x'.repeat(100)
const { url, close } = await listen()

function counter(target: { addEventListener(type: 'message', fn: () => void): void }) {
  let received = 0
  let wake: (() => void) | undefined
  target.addEventListener('message', () => {
    received++
    wake?.()
  })
  return async (expected: number) => {
    while (received < expected) {
      await new Promise<void>((resolve) => (wake = resolve))
    }
  }
}

const raw = new WebSocket(url)
await new Promise((resolve) => raw.addEventListener('open', resolve))
const rawReceived = counter(raw)
let rawTotal = 0

const upstream = new ReconnectingWebSocket(url)
await new Promise((resolve) => upstream.addEventListener('open', resolve))
const upstreamReceived = counter(upstream)
let upstreamTotal = 0

const party = new PartySocket(url)
await new Promise((resolve) => party.addEventListener('open', resolve))
const partyReceived = counter(party)
let partyTotal = 0

const websocketTs = new Websocket(url)
await new Promise((resolve) => websocketTs.addEventListener(WebsocketEvent.open, resolve))
const websocketTsReceived = counter({
  addEventListener: (_type, fn) => websocketTs.addEventListener(WebsocketEvent.message, fn),
})
let websocketTsTotal = 0

const piped = await listen((socket) => {
  const { readable, writable } = WebSockets.fromSocket(socket as unknown as WebSockets.Socket)
  void readable.pipeTo(writable).catch(() => {})
})
const viaPipe = new WebSocket(piped.url)
await new Promise((resolve) => viaPipe.addEventListener('open', resolve))
const pipeReceived = counter(viaPipe)
let pipeTotal = 0

const ours = WebSockets.connect(url)
const writer = ours.writable.getWriter()
const reader = ours.readable.getReader()

afterAll(async () => {
  raw.close()
  upstream.close()
  party.close()
  websocketTs.close()
  viaPipe.close()
  await writer.close()
  await close()
  await piped.close()
})

test(`echoes ${count} messages through a local server within 25% of reconnecting-websocket, partysocket and websocket-ts`, async ({
  bench,
}) => {
  const result = await bench.compare(
    bench('@portable/websockets', async () => {
      for (let i = 0; i < count; i++) {
        void writer.write(message)
      }
      for (let i = 0; i < count; i++) {
        await reader.read()
      }
    }),
    bench('reconnecting-websocket', async () => {
      for (let i = 0; i < count; i++) {
        upstream.send(message)
      }
      await upstreamReceived((upstreamTotal += count))
    }),
    bench('partysocket', async () => {
      for (let i = 0; i < count; i++) {
        party.send(message)
      }
      await partyReceived((partyTotal += count))
    }),
    bench('websocket-ts', async () => {
      for (let i = 0; i < count; i++) {
        websocketTs.send(message)
      }
      await websocketTsReceived((websocketTsTotal += count))
    }),
    bench('WebSocket', async () => {
      for (let i = 0; i < count; i++) {
        raw.send(message)
      }
      await rawReceived((rawTotal += count))
    }),
  )
  expect(result.get('reconnecting-websocket')).not.toBeFasterThan(
    result.get('@portable/websockets'),
    { delta: 0.25 },
  )
  expect(result.get('partysocket')).not.toBeFasterThan(result.get('@portable/websockets'), {
    delta: 0.25,
  })
  expect(result.get('websocket-ts')).not.toBeFasterThan(result.get('@portable/websockets'), {
    delta: 0.25,
  })
})

test(`a server echoing ${count} messages through fromSocket is within 25% of ws listeners`, async ({
  bench,
}) => {
  const result = await bench.compare(
    bench('fromSocket', async () => {
      for (let i = 0; i < count; i++) {
        viaPipe.send(message)
      }
      await pipeReceived((pipeTotal += count))
    }),
    bench('ws listeners', async () => {
      for (let i = 0; i < count; i++) {
        raw.send(message)
      }
      await rawReceived((rawTotal += count))
    }),
  )
  expect(result.get('ws listeners')).not.toBeFasterThan(result.get('fromSocket'), { delta: 0.25 })
})
