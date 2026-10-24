import * as Rpc from '@portable/rpc'
import { describe, expect, onTestFinished, test } from 'vite-plus/test'
import { communicationContract } from './contract.js'
import { codecOf, createMethods, servePort, type Methods } from './fixtures/methods.js'
import { settle } from './utils.js'

function channel() {
  const { port1, port2 } = new MessageChannel()
  onTestFinished(() => {
    port1.close()
    port2.close()
  })
  return { port1, port2 }
}

function broadcastChannels() {
  const name = `rpc-${crypto.randomUUID()}`
  const a = new BroadcastChannel(name)
  const b = new BroadcastChannel(name)
  onTestFinished(() => {
    a.close()
    b.close()
  })
  return [a, b] as const
}

function closer() {
  const controller = new AbortController()
  onTestFinished(() => controller.abort())
  return controller
}

/** Collects what arrives on `port` within a few turns of the event loop. */
async function received(port: MessagePort, send: () => void): Promise<unknown[]> {
  const messages = new Array<unknown>()
  const listener = (event: MessageEvent) => void messages.push(event.data)
  port.addEventListener('message', listener)
  port.start()
  send()
  await settle()
  port.removeEventListener('message', listener)
  return messages
}

communicationContract('a MessagePort', async ({ codec, methods, signal }) => {
  const { port1, port2 } = channel()
  servePort(port1, { codec })
  return Rpc.connect<Methods>(Rpc.port(port2, { signal }), {
    codec: codecOf({ codec }),
    methods,
    signal,
  })
})

communicationContract('a BroadcastChannel', async ({ codec, methods, signal }) => {
  const [a, b] = broadcastChannels()
  servePort(a, { codec })
  return Rpc.connect<Methods>(Rpc.port(b, { signal }), {
    codec: codecOf({ codec }),
    methods,
    signal,
  })
})

describe('connecting', () => {
  test('throws when one transport is connected twice', () => {
    const { port2 } = channel()
    const transport = Rpc.port(port2, { signal: closer().signal })
    Rpc.connect(transport)
    expect(() => Rpc.connect(transport)).toThrow(TypeError)
  })

  test('rejects calls with signal.reason when the signal aborted before connecting', async () => {
    const { port1, port2 } = channel()
    servePort(port1)
    const reason = new Error('destroyed')
    const signal = AbortSignal.abort(reason)
    const remote = Rpc.connect<Methods>(Rpc.port(port2, { signal }), { signal })
    await expect(remote.multiply(2, 3)).rejects.toBe(reason)
  })

  test('rejects a call with signal.reason when nothing listens on the other port', async () => {
    const { port2 } = channel()
    const remote = Rpc.connect<Methods>(Rpc.port(port2), { signal: closer().signal })
    const signal = AbortSignal.timeout(100)
    await expect(Rpc.call(remote.multiply, [2, 3], { signal })).rejects.toMatchObject({
      name: 'TimeoutError',
    })
  })

  test('serves separate connections over separate MessageChannels', async () => {
    const signal = closer().signal
    const remotes = ['A', 'B'].map((name) => {
      const { port1, port2 } = channel()
      Rpc.provide(Rpc.port(port1), createMethods({ channel: name }), { signal })
      return Rpc.connect<Methods>(Rpc.port(port2), { signal })
    })
    expect(await Promise.all(remotes.map((remote) => remote.getChannel()))).toEqual(['A', 'B'])
  })

  test('keeps working after the call timeout of an earlier call has passed', async () => {
    const { port1, port2 } = channel()
    servePort(port1)
    const remote = Rpc.connect<Methods>(Rpc.port(port2), { signal: closer().signal })
    const signal = AbortSignal.timeout(20)
    await expect(Rpc.call(remote.multiply, [2, 4], { signal })).resolves.toBe(8)
    await new Promise((resolve) => setTimeout(resolve, 50))
    await expect(remote.multiply(2, 4)).resolves.toBe(8)
  })
})

describe('sending calls', () => {
  test('rejects a call whose arguments the codec cannot encode, and keeps working', async () => {
    const { port1, port2 } = channel()
    servePort(port1)
    const remote = Rpc.connect<Methods>(Rpc.port(port2), { signal: closer().signal })
    await expect(remote.nested.oneLevel(10n as never)).rejects.toThrow(TypeError)
    await expect(remote.multiply(2, 4)).resolves.toBe(8)
  })

  test('drops function properties of an argument with the JSON codec', async () => {
    const { port1, port2 } = channel()
    servePort(port1)
    const remote = Rpc.connect<Methods>(Rpc.port(port2), { signal: closer().signal })
    const argument = { a: 1, f: () => {} } as unknown as string
    await expect(remote.nested.oneLevel(argument)).resolves.toEqual({ a: 1 })
  })

  test('rejects a call whose arguments cannot be cloned, and keeps working', async () => {
    const { port1, port2 } = channel()
    servePort(port1, { codec: 'identity' })
    const remote = Rpc.connect<Methods>(Rpc.port(port2), {
      codec: codecOf({ codec: 'identity' }),
      signal: closer().signal,
    })
    await expect(remote.nested.oneLevel((() => {}) as never)).rejects.toMatchObject({
      name: 'DataCloneError',
    })
    await expect(remote.multiply(2, 4)).resolves.toBe(8)
  })

  test('sends a nested method as one dotted JSON-RPC method name', async () => {
    const { port1, port2 } = channel()
    const remote = Rpc.connect<Methods>(Rpc.port(port2), { signal: closer().signal })
    const messages = await received(port1, () => {
      remote.nested.by.twoLevels('x').catch(() => {})
    })
    expect(messages.map((m) => JSON.parse(m as string))).toEqual([
      { jsonrpc: '2.0', id: 1, method: 'nested.by.twoLevels', params: ['x'] },
    ])
  })
})

describe('serving methods', () => {
  const request = (method: string) => JSON.stringify({ jsonrpc: '2.0', id: 1, method })

  function serveOn(api: object) {
    const { port1, port2 } = channel()
    const controller = closer()
    Rpc.provide(Rpc.port(port1), api, { signal: controller.signal })
    return { port: port2, controller }
  }

  test('calls methods inherited from a class prototype', async () => {
    class Api {
      inheritedMethod() {
        return 'inherited'
      }
    }
    const { port } = serveOn(new Api())
    const messages = await received(port, () => port.postMessage(request('inheritedMethod')))
    expect(messages.map((m) => JSON.parse(m as string))).toEqual([
      { jsonrpc: '2.0', id: 1, result: 'inherited' },
    ])
  })

  test('calls methods a nested object inherits', async () => {
    const { port } = serveOn({ nested: Object.create({ inheritedMethod: () => 'inherited' }) })
    const messages = await received(port, () => port.postMessage(request('nested.inheritedMethod')))
    expect(messages.map((m) => JSON.parse(m as string))).toEqual([
      { jsonrpc: '2.0', id: 1, result: 'inherited' },
    ])
  })

  test.each([
    'toString',
    'hasOwnProperty',
    'constructor',
    'valueOf',
    '__proto__.toString',
    'nested.toString',
    'nested.constructor',
    'multiply.call',
  ])("doesn't call %s", async (method) => {
    const { port } = serveOn(createMethods())
    const messages = await received(port, () => port.postMessage(request(method)))
    expect(messages.map((m) => JSON.parse(m as string))).toEqual([
      { jsonrpc: '2.0', id: 1, error: { code: -32601, message: 'Method not found' } },
    ])
  })

  test('answers a message that is not JSON with a parse error, and keeps working', async () => {
    const { port } = serveOn(createMethods())
    const messages = await received(port, () => {
      port.postMessage({ random: 'payload' })
      port.postMessage(request('apply'))
    })
    expect(messages.map((m) => JSON.parse(m as string))).toEqual([
      { jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } },
      { jsonrpc: '2.0', id: 1, result: 'apply result' },
    ])
  })

  test('sends nothing back for a response to an unknown call', async () => {
    const { port } = serveOn(createMethods())
    const response = JSON.stringify({ jsonrpc: '2.0', id: 99, result: 1 })
    expect(await received(port, () => port.postMessage(response))).toEqual([])
  })

  test('stops answering once its signal aborts', async () => {
    const { port, controller } = serveOn(createMethods())
    controller.abort()
    expect(await received(port, () => port.postMessage(request('apply')))).toEqual([])
  })

  test('removes its message listener from the port when its signal aborts', () => {
    const { port1 } = channel()
    const added = new Array<unknown>()
    const removed = new Array<unknown>()
    const target = {
      postMessage: (message) => port1.postMessage(message),
      addEventListener(type, listener) {
        added.push(listener)
        port1.addEventListener(type, listener)
      },
      removeEventListener(type, listener) {
        removed.push(listener)
        port1.removeEventListener(type, listener)
      },
    } satisfies Rpc.port.Target
    const controller = new AbortController()
    Rpc.provide(Rpc.port(target), createMethods(), { signal: controller.signal })
    expect(added).toHaveLength(1)
    controller.abort()
    expect(removed).toEqual(added)
  })
})
