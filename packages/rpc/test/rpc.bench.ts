import { createBirpc } from 'birpc'
import * as Comlink from 'comlink'
import { createJSONRPCRequest, JSONRPCClient, JSONRPCServer } from 'json-rpc-2.0'
import { connect as penpalConnect, PortMessenger } from 'penpal'
import { afterAll, expect, test } from 'vite-plus/test'
import * as Rpc from '@portable/rpc'

const item = (i: number) => ({ id: i, name: `item ${i}`, price: i * 1.25, tags: ['a', 'b'] })

const record = {
  id: 'f3b1c2d4-5e6f-4a7b-8c9d-0e1f2a3b4c5d',
  name: 'Ada Lovelace',
  email: 'ada@example.com',
  roles: ['admin', 'editor'],
  created: '2026-10-18T12:00:00.000Z',
  settings: { theme: 'dark', locale: 'en-GB', notifications: { email: true, push: false } },
  orders: Array.from({ length: 20 }, (_, i) => item(i)),
}

const api = {
  add: (a: number, b: number) => a + b,
  echo: (value: unknown) => value,
  log: (_message: string) => {},
  search: Rpc.withContext((_context, query: string) => query.length),
  async *items(n: number) {
    for (let i = 0; i < n; i++) yield item(i)
  },
}
type Api = typeof api

const channels: MessageChannel[] = []
function channel(): MessageChannel {
  const created = new MessageChannel()
  channels.push(created)
  return created
}
afterAll(() => {
  for (const { port1, port2 } of channels) {
    port1.close()
    port2.close()
  }
})

const identity: Rpc.Codec = { encode: (message) => message, decode: (data) => data }

function ours(codec?: Rpc.Codec) {
  const { port1, port2 } = channel()
  Rpc.serve(api, Rpc.port(port1), codec ? { codec } : {})
  return Rpc.connect<Api>(Rpc.port(port2), codec ? { codec } : {})
}
const remote = ours()
const remoteIdentity = ours(identity)

type BirpcClient = { item(value: ReturnType<typeof item>): void }
type BirpcServer = Omit<Api, 'items' | 'search'> & { items(n: number): void }
let birpcReceived: (value: ReturnType<typeof item>) => void = () => {}
const birpc = (() => {
  const { port1, port2 } = channel()
  const listen = (port: MessagePort) => (fn: (data: any) => void) => {
    port.addEventListener('message', (event) => fn(event.data))
    port.start()
  }
  const server = createBirpc<BirpcClient, BirpcServer>(
    {
      add: api.add,
      echo: api.echo,
      log: api.log,
      async items(n) {
        for (let i = 0; i < n; i++) void server.item.asEvent(item(i))
      },
    },
    { post: (data) => port1.postMessage(data), on: listen(port1) },
  )
  return createBirpc<BirpcServer, BirpcClient>(
    { item: (value) => birpcReceived(value) },
    { post: (data) => port2.postMessage(data), on: listen(port2), eventNames: ['log'] },
  )
})()

type ComlinkApi = Omit<Api, 'items' | 'search'> & {
  items(n: number, callback: (value: ReturnType<typeof item>) => void): void
}
let comlinkReceived: (value: ReturnType<typeof item>) => void = () => {}
const comlinkCallback = Comlink.proxy((value: ReturnType<typeof item>) => comlinkReceived(value))
const comlink = (() => {
  const { port1, port2 } = channel()
  const served: ComlinkApi = {
    add: api.add,
    echo: api.echo,
    log: api.log,
    items(n, callback) {
      for (let i = 0; i < n; i++) callback(item(i))
    },
  }
  Comlink.expose(served, port1)
  return Comlink.wrap<ComlinkApi>(port2)
})()

type PenpalApi = { add(a: number, b: number): number; echo(value: unknown): unknown }
const penpal = await (() => {
  const { port1, port2 } = channel()
  penpalConnect({
    messenger: new PortMessenger({ port: port1 }),
    methods: { add: api.add, echo: api.echo },
  })
  return penpalConnect<PenpalApi>({ messenger: new PortMessenger({ port: port2 }) }).promise
})()

test('sequential round trips over a MessageChannel within 25% of birpc, comlink and penpal', async ({
  bench,
}) => {
  const result = await bench.compare(
    bench('@portable/rpc', async () => {
      await remote.add(1, 2)
    }),
    bench('@portable/rpc, Rpc.call with a signal', async () => {
      await Rpc.call(remote.add, [1, 2], { signal: AbortSignal.timeout(1000) })
    }),
    bench('@portable/rpc, withContext', async () => {
      await remote.search('query')
    }),
    bench('birpc', async () => {
      await birpc.add(1, 2)
    }),
    bench('comlink', async () => {
      await comlink.add(1, 2)
    }),
    bench('penpal', async () => {
      await penpal.add(1, 2)
    }),
  )
  expect(result.get('birpc')).not.toBeFasterThan(result.get('@portable/rpc'), { delta: 0.25 })
  expect(result.get('comlink')).not.toBeFasterThan(result.get('@portable/rpc'), { delta: 0.25 })
  expect(result.get('penpal')).not.toBeFasterThan(result.get('@portable/rpc'), { delta: 0.25 })
})

const concurrent = Array.from({ length: 100 }, (_, i) => i)

test('100 concurrent calls over a MessageChannel within 25% of birpc, comlink and penpal', async ({
  bench,
}) => {
  const result = await bench.compare(
    bench('@portable/rpc', async () => {
      await Promise.all(concurrent.map((i) => remote.add(i, 1)))
    }),
    bench('birpc', async () => {
      await Promise.all(concurrent.map((i) => birpc.add(i, 1)))
    }),
    bench('comlink', async () => {
      await Promise.all(concurrent.map((i) => comlink.add(i, 1)))
    }),
    bench('penpal', async () => {
      await Promise.all(concurrent.map((i) => penpal.add(i, 1)))
    }),
  )
  expect(result.get('birpc')).not.toBeFasterThan(result.get('@portable/rpc'), { delta: 0.25 })
  expect(result.get('comlink')).not.toBeFasterThan(result.get('@portable/rpc'), { delta: 0.25 })
  expect(result.get('penpal')).not.toBeFasterThan(result.get('@portable/rpc'), { delta: 0.25 })
})

test('100 notifications and a call within 25% of birpc events', async ({ bench }) => {
  const result = await bench.compare(
    bench('@portable/rpc', async () => {
      for (const i of concurrent) void Rpc.notify(remote.log, [`message ${i}`])
      await remote.add(1, 2)
    }),
    bench('birpc', async () => {
      for (const i of concurrent) void birpc.log(`message ${i}`)
      await birpc.add(1, 2)
    }),
  )
  expect(result.get('birpc')).not.toBeFasterThan(result.get('@portable/rpc'), { delta: 0.25 })
})

// birpc and comlink have no streamed results. The closest equivalent is the server pushing each item
// to a client callback without waiting for it, and the client waiting until it has all of them. Our
// stream adds backpressure (credit messages from the client every 64 items), which they lack.
const streamed = 1000

function received(n: number, set: (fn: () => void) => void): Promise<void> {
  return new Promise((resolve) => {
    let count = 0
    set(() => {
      if (++count === n) resolve()
    })
  })
}

test('a stream of 1000 items within 25% of birpc and comlink callbacks', async ({ bench }) => {
  const result = await bench.compare(
    bench('@portable/rpc', async () => {
      let count = 0
      for await (const _ of remote.items(streamed)) count++
      if (count !== streamed) throw new Error(`Received ${count} items.`)
    }),
    bench('birpc, an event per item', async () => {
      const done = received(streamed, (fn) => (birpcReceived = fn))
      await birpc.items(streamed)
      await done
    }),
    bench('comlink, a proxy callback per item', async () => {
      const done = received(streamed, (fn) => (comlinkReceived = fn))
      await comlink.items(streamed, comlinkCallback)
      await done
    }),
  )
  expect(result.get('birpc, an event per item')).not.toBeFasterThan(result.get('@portable/rpc'), {
    delta: 0.25,
  })
  expect(result.get('comlink, a proxy callback per item')).not.toBeFasterThan(
    result.get('@portable/rpc'),
    { delta: 0.25 },
  )
})

const url = 'https://rpc.test/'
const handle = Rpc.handler(api)
const http = Rpc.http<Api>(url, { fetch: async (input, init) => handle(new Request(input, init)) })

const jsonRpcServer = new JSONRPCServer()
for (const name of ['add', 'echo', 'log'] as const) {
  const fn = api[name] as (...args: any[]) => unknown
  jsonRpcServer.addMethod(name, (params: unknown[]) => fn(...params))
}
const handleJsonRpc = async (request: Request) => {
  const response = await jsonRpcServer.receiveJSON(await request.text())
  return response === null ? new Response(null, { status: 204 }) : Response.json(response)
}
const jsonRpcClient: JSONRPCClient = new JSONRPCClient(async (payload) => {
  const response = await handleJsonRpc(
    new Request(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    }),
  )
  if (response.status === 200) jsonRpcClient.receive(await response.json())
})

test('Rpc.http and Rpc.handler with an in-process fetch within 25% of json-rpc-2.0', async ({
  bench,
}) => {
  const result = await bench.compare(
    bench('@portable/rpc', async () => {
      await http.echo(record)
    }),
    bench('json-rpc-2.0', async () => {
      await jsonRpcClient.request('echo', [record])
    }),
  )
  expect(result.get('json-rpc-2.0')).not.toBeFasterThan(result.get('@portable/rpc'), {
    delta: 0.25,
  })
})

const batch = Array.from({ length: 10 }, (_, i) => i)

test('a batch of 10 calls over HTTP within 25% of json-rpc-2.0', async ({ bench }) => {
  const result = await bench.compare(
    bench('@portable/rpc', async () => {
      await Promise.all(batch.map((i) => http.add(i, 1)))
    }),
    bench('json-rpc-2.0, requestAdvanced', async () => {
      await jsonRpcClient.requestAdvanced(
        batch.map((i) => createJSONRPCRequest(i + 1, 'add', [i, 1])),
      )
    }),
  )
  expect(result.get('json-rpc-2.0, requestAdvanced')).not.toBeFasterThan(
    result.get('@portable/rpc'),
    { delta: 0.25 },
  )
})

test('a 2 KB record over a MessageChannel with the json and identity codecs, within 25% of birpc', async ({
  bench,
}) => {
  const result = await bench.compare(
    bench('@portable/rpc', async () => {
      await remote.echo(record)
    }),
    bench('@portable/rpc, identity codec', async () => {
      await remoteIdentity.echo(record)
    }),
    bench('birpc', async () => {
      await birpc.echo(record)
    }),
    bench('comlink', async () => {
      await comlink.echo(record)
    }),
    bench('penpal', async () => {
      await penpal.echo(record)
    }),
  )
  expect(result.get('birpc')).not.toBeFasterThan(result.get('@portable/rpc'), { delta: 0.25 })
})
