import * as WebSockets from '@portable/websocket'
import ReconnectingWebSocketModule from 'reconnecting-websocket'
import { afterAll, expect, test } from 'vite-plus/test'
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
    while (received < expected) await new Promise<void>((resolve) => (wake = resolve))
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

const ours = WebSockets.connect(url)
const writer = ours.writable.getWriter()
const reader = ours.readable.getReader()

afterAll(async () => {
  raw.close()
  upstream.close()
  await writer.close()
  await close()
})

test(`echoes ${count} messages through a local server within 25% of reconnecting-websocket`, async ({
  bench,
}) => {
  const result = await bench.compare(
    bench('@portable/websocket', async () => {
      for (let i = 0; i < count; i++) void writer.write(message)
      for (let i = 0; i < count; i++) await reader.read()
    }),
    bench('reconnecting-websocket', async () => {
      for (let i = 0; i < count; i++) upstream.send(message)
      await upstreamReceived((upstreamTotal += count))
    }),
    bench('WebSocket', async () => {
      for (let i = 0; i < count; i++) raw.send(message)
      await rawReceived((rawTotal += count))
    }),
  )
  expect(result.get('reconnecting-websocket')).not.toBeFasterThan(
    result.get('@portable/websocket'),
    { delta: 0.25 },
  )
})
