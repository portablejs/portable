import * as Rpc from '@portable/rpc'
import { describe, expect, onTestFinished, test, vi } from 'vite-plus/test'
import { communicationContract } from './contract.js'
import {
  type BridgeApi,
  codecOf,
  type Config,
  type Methods,
  type ParentApi,
} from './fixtures/methods.js'

type WorkerConfig = Config & { mode?: 'self' | 'broadcast' | 'ports'; broadcast?: string }

const otherHost = location.hostname === '127.0.0.1' ? 'localhost' : '127.0.0.1'
const otherOrigin = `${location.protocol}//${otherHost}:${location.port}`
const startUrl = new URL('./fixtures/start.ts', import.meta.url).href
const methodsUrl = new URL('./fixtures/methods.ts', import.meta.url).href

function childUrl(config: Config = {}, origin = location.origin): string {
  const url = new URL(new URL('./fixtures/child.html', import.meta.url).pathname, origin)
  url.searchParams.set('config', JSON.stringify(config))
  return url.href
}

/** A child page that runs `fixtures/start.ts` without loading `child.html`. */
const inlineChild = (config: Config, url = startUrl) =>
  `<!doctype html><script type="module">import { start } from ${JSON.stringify(url)}; start(${JSON.stringify(config)})</script>`

const inlined = new Map<string, Promise<string>>()

/**
 * A data URL of the module at `url` whose imports are data URLs too. The Vite server doesn't
 * answer CORS requests from the opaque origin `null`, so a child on an opaque origin can't load
 * `start.ts` from it.
 */
function inlineModule(url: string): Promise<string> {
  let module = inlined.get(url)
  if (!module) {
    module = (async () => {
      let code = await (await fetch(url)).text()
      const specifiers = new Set(
        [...code.matchAll(/(?:from|import)\s*"([^"]+)"/g)].map((match) => match[1]!),
      )
      for (const specifier of specifiers) {
        const inner = await inlineModule(new URL(specifier, url).href)
        code = code.replaceAll(`"${specifier}"`, JSON.stringify(inner))
      }
      return `data:text/javascript,${encodeURIComponent(code)}`
    })()
    inlined.set(url, module)
  }
  return module
}

const opaqueChild = async (config: Config) =>
  `data:text/html,${encodeURIComponent(inlineChild(config, await inlineModule(startUrl)))}`

function iframe(set: (iframe: HTMLIFrameElement) => void): HTMLIFrameElement {
  const element = globalThis.document.createElement('iframe')
  set(element)
  globalThis.document.body.append(element)
  onTestFinished(() => element.remove())
  return element
}

const child = (config: Config = {}, origin = location.origin) =>
  iframe((element) => void (element.src = childUrl(config, origin)))

const loaded = (element: HTMLIFrameElement) =>
  new Promise((resolve) => element.addEventListener('load', resolve, { once: true }))

function worker(config: WorkerConfig = {}): Worker {
  const url = new URL('./fixtures/worker.ts', import.meta.url)
  url.searchParams.set('config', JSON.stringify(config))
  const created = new Worker(url, { type: 'module' })
  onTestFinished(() => created.terminate())
  return created
}

function closer(): AbortController {
  const controller = new AbortController()
  onTestFinished(() => controller.abort())
  return controller
}

const parentApi = (channel = ''): ParentApi => ({ add: (a, b) => a + b, getChannel: () => channel })

function connect(
  target: Window,
  options: {
    origin: string
    channel?: string
    codec?: Config['codec']
    signal?: AbortSignal
  },
): Rpc.Remote<Methods> {
  const { origin, channel = '', codec, signal = closer().signal } = options
  return Rpc.connect<Methods>(Rpc.window(target, { origin, channel, signal }), {
    codec: codecOf({ codec }),
    serve: parentApi(channel),
    signal,
  })
}

/** Calls `multiply(2, 3)` and gives up after `ms`. */
const multiplyWithin = (remote: Rpc.Remote<Methods>, ms: number) =>
  Rpc.call(remote.multiply, [2, 3], { signal: AbortSignal.timeout(ms) })

const timeout = { name: 'TimeoutError' }

/**
 * Calls `multiply(2, 5)` until the worker answers. Chromium registers a new BroadcastChannel
 * asynchronously, so the worker's `ready` message can arrive before its channel receives
 * messages, and the first calls are lost.
 */
async function untilAnswered(remote: Rpc.Remote<Methods>): Promise<number> {
  for (;;) {
    try {
      return await Rpc.call(remote.multiply, [2, 5], { signal: AbortSignal.timeout(200) })
    } catch (error) {
      if ((error as Error).name !== 'TimeoutError') throw error
    }
  }
}

communicationContract('a cross-origin iframe', async ({ codec, serve, signal }) => {
  const element = child({ codec, origin: location.origin }, otherOrigin)
  return Rpc.connect<Methods>(Rpc.window(element.contentWindow!, { origin: otherOrigin, signal }), {
    codec: codecOf({ codec }),
    serve,
    signal,
  })
})

/**
 * Loads a cross-origin child that serves the general methods over a MessagePort, and transfers
 * the other end of the channel to it.
 */
async function portChild(config: Config = {}): Promise<MessagePort> {
  const element = child({ ...config, page: 'port', origin: location.origin }, otherOrigin)
  await loaded(element)
  const { port1, port2 } = new MessageChannel()
  element.contentWindow!.postMessage('port', otherOrigin, [port2])
  return port1
}

communicationContract(
  'a cross-origin iframe over a transferred MessagePort',
  async ({ codec, serve, signal }) =>
    Rpc.connect<Methods>(Rpc.port(await portChild({ codec }), { signal }), {
      codec: codecOf({ codec }),
      serve,
      signal,
    }),
)

communicationContract('a module Worker', async ({ codec, serve, signal }) => {
  return Rpc.connect<Methods>(Rpc.port(worker({ codec }), { signal }), {
    codec: codecOf({ codec }),
    serve,
    signal,
  })
})

communicationContract('a Worker over BroadcastChannel', async ({ codec, serve, signal }) => {
  const name = `rpc-${crypto.randomUUID()}`
  const created = worker({ codec, mode: 'broadcast', broadcast: name })
  await new Promise((resolve) => created.addEventListener('message', resolve, { once: true }))
  const channel = new BroadcastChannel(name)
  onTestFinished(() => channel.close())
  const remote = Rpc.connect<Methods>(Rpc.port(channel, { signal }), {
    codec: codecOf({ codec }),
    serve,
    signal,
  })
  await untilAnswered(remote)
  return remote
})

describe('handshake', () => {
  test('connects when the parent starts before the child page loads', async () => {
    const remote = connect(child().contentWindow!, { origin: location.origin })
    await expect(remote.multiply(2, 5)).resolves.toBe(10)
  })

  test('connects when the child page loaded before the parent starts', async () => {
    const element = child()
    await loaded(element)
    await new Promise((resolve) => setTimeout(resolve, 300))
    const remote = connect(element.contentWindow!, { origin: location.origin })
    await expect(remote.multiply(2, 5)).resolves.toBe(10)
  })

  test('connects when the child starts connecting after the parent', async () => {
    const remote = connect(child({ delay: 500 }).contentWindow!, { origin: location.origin })
    await expect(remote.multiply(2, 5)).resolves.toBe(10)
  })

  test('answers calls to a same-origin child made from a timer', async () => {
    const remote = connect(child().contentWindow!, { origin: location.origin })
    await remote.multiply(1, 1)
    const result = new Promise((resolve) => setTimeout(() => resolve(remote.multiply(2, 5))))
    await expect(result).resolves.toBe(10)
  })

  test('rejects calls with Rpc.TransportError when the child uses another protocol version', async () => {
    const remote = connect(child({ page: 'version' }).contentWindow!, { origin: location.origin })
    const error = await remote.multiply(2, 5).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(Rpc.TransportError)
    expect((error as Error).cause).toBeInstanceOf(Rpc.TransportError)
    expect(((error as Error).cause as Error).message).toBe(
      'The other window uses protocol version 2.',
    )
  })

  test('rejects calls with Rpc.TransportError when posting to the target throws', async () => {
    const failure = new Error('postMessage failed')
    const target = {
      postMessage() {
        throw failure
      },
    }
    const signal = closer().signal
    const remote = Rpc.connect<Methods>(Rpc.window(target, { origin: '*', signal }), { signal })
    const error = await remote.multiply(2, 5).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(Rpc.TransportError)
    expect((error as Error).cause).toBe(failure)
  })

  test('gives up on a child that never answers when the call signal times out', async () => {
    const remote = connect(child({ page: 'silent' }).contentWindow!, { origin: location.origin })
    await expect(multiplyWithin(remote, 100)).rejects.toMatchObject(timeout)
  })

  test('keeps an established connection open after the time a call signal allowed', async () => {
    const remote = connect(child().contentWindow!, { origin: location.origin })
    await expect(multiplyWithin(remote, 300)).resolves.toBe(6)
    await new Promise((resolve) => setTimeout(resolve, 400))
    await expect(remote.multiply(2, 4)).resolves.toBe(8)
  })

  test('closes an established connection when the transport signal aborts later', async () => {
    const remote = connect(child().contentWindow!, {
      origin: location.origin,
      signal: AbortSignal.timeout(500),
    })
    await expect(remote.multiply(2, 4)).resolves.toBe(8)
    await new Promise((resolve) => setTimeout(resolve, 600))
    await expect(remote.multiply(2, 4)).rejects.toMatchObject(timeout)
  })
})

describe('origins', () => {
  test('connects to a cross-origin child when origin is the child origin', async () => {
    const element = child({ origin: location.origin }, otherOrigin)
    const remote = connect(element.contentWindow!, { origin: otherOrigin })
    await expect(remote.origin()).resolves.toBe(otherOrigin)
  })

  test('connects to a cross-origin child when origin is *', async () => {
    const element = child({ origin: location.origin }, otherOrigin)
    const remote = connect(element.contentWindow!, { origin: '*' })
    await expect(remote.origin()).resolves.toBe(otherOrigin)
  })

  test("doesn't connect to a cross-origin child when origin is the parent's own origin", async () => {
    const element = child({ origin: '*' }, otherOrigin)
    const remote = connect(element.contentWindow!, { origin: location.origin })
    await expect(multiplyWithin(remote, 500)).rejects.toMatchObject(timeout)
  })

  test("doesn't connect when the parent's origin option doesn't match the child", async () => {
    const element = child({ origin: '*' }, otherOrigin)
    const remote = connect(element.contentWindow!, { origin: 'http://example.com' })
    await expect(multiplyWithin(remote, 500)).rejects.toMatchObject(timeout)
  })

  test("doesn't connect when the child's origin option doesn't match the parent", async () => {
    const element = child({ origin: 'http://example.com' }, otherOrigin)
    const remote = connect(element.contentWindow!, { origin: otherOrigin })
    await expect(multiplyWithin(remote, 500)).rejects.toMatchObject(timeout)
  })

  test('connects to a child that navigated to another origin when origin is *', async () => {
    const element = child({ redirect: childUrl({ origin: '*' }, otherOrigin) })
    const remote = connect(element.contentWindow!, { origin: '*' })
    await expect(remote.origin()).resolves.toBe(otherOrigin)
  })

  test("doesn't connect to a child that navigated away from the origin passed", async () => {
    const element = child({ redirect: childUrl({ origin: '*' }, otherOrigin) })
    const remote = connect(element.contentWindow!, { origin: location.origin })
    await expect(multiplyWithin(remote, 500)).rejects.toMatchObject(timeout)
  })

  test('ignores messages from a window other than the target', async () => {
    const silent = child({ page: 'silent' })
    child({ origin: '*' })
    const remote = connect(silent.contentWindow!, { origin: '*' })
    await expect(multiplyWithin(remote, 500)).rejects.toMatchObject(timeout)
  })

  test('connects to a sandboxed child, which has an opaque origin, when origin is *', async () => {
    const html = inlineChild({ origin: '*' }, await inlineModule(startUrl))
    const element = iframe((e) => {
      e.sandbox.add('allow-scripts')
      e.srcdoc = html
    })
    const remote = connect(element.contentWindow!, { origin: '*' })
    await expect(remote.multiply(2, 5)).resolves.toBe(10)
  })

  test('connects to a srcdoc child, which has the parent origin', async () => {
    const element = iframe((e) => void (e.srcdoc = inlineChild({ origin: location.origin })))
    const remote = connect(element.contentWindow!, { origin: location.origin })
    await expect(remote.multiply(2, 5)).resolves.toBe(10)
  })

  test('connects to a blob URL child, which has the parent origin', async () => {
    const blob = new Blob([inlineChild({ origin: location.origin })], { type: 'text/html' })
    const url = URL.createObjectURL(blob)
    onTestFinished(() => URL.revokeObjectURL(url))
    const element = iframe((e) => void (e.src = url))
    const remote = connect(element.contentWindow!, { origin: location.origin })
    await expect(remote.multiply(2, 5)).resolves.toBe(10)
  })

  test('connects to a data URL child, which has an opaque origin, when origin is *', async () => {
    const url = await opaqueChild({ origin: '*' })
    const element = iframe((e) => void (e.src = url))
    const remote = connect(element.contentWindow!, { origin: '*' })
    await expect(remote.multiply(2, 5)).resolves.toBe(10)
  })

  test("doesn't connect to a data URL child when origin is the parent's origin", async () => {
    const url = await opaqueChild({ origin: '*' })
    const element = iframe((e) => void (e.src = url))
    const remote = connect(element.contentWindow!, { origin: location.origin })
    await expect(multiplyWithin(remote, 500)).rejects.toMatchObject(timeout)
  })
})

describe('channels', () => {
  test('routes calls by channel both ways for two connections to one iframe', async () => {
    const target = child({ channels: ['B', 'A'] }).contentWindow!
    const a = connect(target, { origin: location.origin, channel: 'A' })
    const b = connect(target, { origin: location.origin, channel: 'B' })
    expect(
      await Promise.all([
        a.getChannel(),
        b.getChannel(),
        a.getChannelFromParent(),
        b.getChannelFromParent(),
      ]),
    ).toEqual(['A', 'B', 'A', 'B'])
  })

  test("doesn't connect when the channels differ", async () => {
    const target = child({ channels: ['A'] }).contentWindow!
    const remote = connect(target, { origin: location.origin, channel: 'B' })
    await expect(multiplyWithin(remote, 500)).rejects.toMatchObject(timeout)
  })

  test('routes calls both ways for two connections to one worker over MessagePorts', async () => {
    const created = worker({ mode: 'ports' })
    const signal = closer().signal
    const [a, b] = ['A', 'B'].map((channel) => {
      const { port1, port2 } = new MessageChannel()
      created.postMessage({ channel }, [port2])
      return Rpc.connect<Methods>(Rpc.port(port1, { signal }), {
        serve: parentApi(channel),
        signal,
      })
    })
    expect(
      await Promise.all([
        a!.getChannel(),
        b!.getChannel(),
        a!.getChannelFromParent(),
        b!.getChannelFromParent(),
      ]),
    ).toEqual(['A', 'B', 'A', 'B'])
  })
})

describe('a bridge on the main thread', () => {
  /**
   * Connects to a Worker and to a cross-origin child, and serves the child a `worker` API whose
   * methods call the Worker.
   */
  function bridge(): Rpc.Remote<Methods> {
    const signal = closer().signal
    const toWorker = Rpc.connect<Methods>(Rpc.port(worker(), { signal }), {
      serve: parentApi(),
      signal,
    })
    const api: BridgeApi = {
      ...parentApi(),
      worker: {
        multiply: (a, b) => toWorker.multiply(a, b),
        count: (n) => toWorker.count(n),
        forever: () => toWorker.forever(),
        wasCancelled: () => toWorker.wasCancelled(),
      },
    }
    const element = child({ origin: location.origin }, otherOrigin)
    return Rpc.connect<Methods>(
      Rpc.window(element.contentWindow!, { origin: otherOrigin, signal }),
      {
        serve: api,
        signal,
      },
    )
  }

  test('forwards a call from a cross-origin iframe to a Worker', async () => {
    expect(await bridge().relayMultiply(2, 3)).toBe(6)
  })

  test("forwards the Worker's streamed values to the iframe", async () => {
    expect(await bridge().relayCount(3)).toEqual([0, 1, 2])
  })

  test("stops the Worker's generator when the iframe stops reading", async () => {
    const remote = bridge()
    expect(await remote.relayUntilBreak(2)).toEqual([0, 1])
    await vi.waitFor(async () => expect(await remote.relayWasCancelled()).toBe(true))
  })
})

describe('BroadcastChannel', () => {
  test('loses calls posted before the other side opens its BroadcastChannel', async () => {
    const name = `rpc-${crypto.randomUUID()}`
    const channel = new BroadcastChannel(name)
    onTestFinished(() => channel.close())
    const remote = Rpc.connect<Methods>(Rpc.port(channel), { signal: closer().signal })
    const early = multiplyWithin(remote, 1000)
    worker({ mode: 'broadcast', broadcast: name })
    await expect(untilAnswered(remote)).resolves.toBe(10)
    await expect(early).rejects.toMatchObject(timeout)
  })
})

describe('reconnecting', () => {
  test('keeps working after the child reloads', async () => {
    const element = child()
    await loaded(element)
    const remote = connect(element.contentWindow!, { origin: location.origin })
    await remote.addUsingParent()
    await expect(remote.getParentReturnValue()).resolves.toBe(9)
    const reloaded = loaded(element)
    await remote.reload()
    await reloaded
    await expect(remote.getParentReturnValue()).resolves.toBe(null)
    await expect(remote.multiply(2, 4)).resolves.toBe(8)
    await remote.addUsingParent()
    await expect(remote.getParentReturnValue()).resolves.toBe(9)
  })

  test("calls the new page's methods after the child navigates", async () => {
    const element = child()
    await loaded(element)
    const remote = connect(element.contentWindow!, { origin: location.origin })
    await remote.multiply(1, 1)
    const navigated = loaded(element)
    await remote.navigate(childUrl({ page: 'other' }))
    await navigated
    const other = remote as unknown as Rpc.Remote<{ methodNotInGeneralPage(): string }>
    await expect(other.methodNotInGeneralPage()).resolves.toBe('success')
    await expect(remote.multiply(2, 4)).rejects.toMatchObject({ code: -32601 })
  })

  test('leaves a call pending when the child reloads before answering', async () => {
    const element = child()
    await loaded(element)
    const remote = connect(element.contentWindow!, { origin: location.origin })
    const signal = AbortSignal.timeout(1500)
    const pending = Rpc.call(remote.delay, [300, 'late'], { signal })
    const reloaded = loaded(element)
    await remote.reload()
    await reloaded
    await expect(remote.multiply(2, 4)).resolves.toBe(8)
    await expect(pending).rejects.toMatchObject(timeout)
  })

  test('runs a parent method once per call after the child reloads twice', async () => {
    const element = child()
    await loaded(element)
    let calls = 0
    const signal = closer().signal
    const remote = Rpc.connect<Methods>(
      Rpc.window(element.contentWindow!, { origin: location.origin, signal }),
      { serve: { ...parentApi(), add: (a: number, b: number) => (calls++, a + b) }, signal },
    )
    for (let i = 0; i < 2; i++) {
      const reloaded = loaded(element)
      await remote.reload()
      await reloaded
    }
    await remote.addUsingParent()
    expect(calls).toBe(1)
  })

  test('rejects a call with signal.reason after the child navigates to a page that never connects', async () => {
    const element = child()
    await loaded(element)
    const remote = connect(element.contentWindow!, { origin: location.origin })
    await remote.multiply(1, 1)
    const navigated = loaded(element)
    await remote.navigate(childUrl({ page: 'silent' }))
    await navigated
    await expect(multiplyWithin(remote, 300)).rejects.toMatchObject(timeout)
  })

  test('rejects a call with signal.reason after the iframe is removed', async () => {
    const element = child()
    const remote = connect(element.contentWindow!, { origin: location.origin })
    await remote.multiply(1, 1)
    element.remove()
    await expect(multiplyWithin(remote, 300)).rejects.toMatchObject(timeout)
  })

  test("leaves the child's calls unanswered after the parent's signal aborts", async () => {
    const target = child({ channels: ['main', 'probe'] }).contentWindow!
    const main = closer()
    connect(target, { origin: location.origin, channel: 'main', signal: main.signal })
    const probe = connect(target, { origin: location.origin, channel: 'probe' })
    await expect(probe.addUsingParentOn('main', 2000)).resolves.toBe(9)
    main.abort()
    await expect(probe.addUsingParentOn('main', 300)).resolves.toBe('TimeoutError')
  })
})

describe('closing', () => {
  test('rejects calls with signal.reason when the signal aborts during the handshake', async () => {
    const controller = closer()
    const remote = connect(child({ page: 'silent' }).contentWindow!, {
      origin: location.origin,
      signal: controller.signal,
    })
    const pending = remote.multiply(2, 3)
    const reason = new Error('destroyed')
    setTimeout(() => controller.abort(reason), 50)
    await expect(pending).rejects.toBe(reason)
  })

  test('rejects calls with signal.reason when the signal aborts before a worker answers', async () => {
    const controller = closer()
    const remote = Rpc.connect<Methods>(
      Rpc.port(worker({ page: 'silent' }), { signal: controller.signal }),
      { signal: controller.signal },
    )
    const pending = remote.multiply(2, 3)
    const reason = new Error('destroyed')
    setTimeout(() => controller.abort(reason), 50)
    await expect(pending).rejects.toBe(reason)
  })

  test('rejects calls to an iframe made after the signal aborted with signal.reason', async () => {
    const controller = closer()
    const remote = connect(child().contentWindow!, {
      origin: location.origin,
      signal: controller.signal,
    })
    await remote.multiply(1, 1)
    const reason = new Error('destroyed')
    controller.abort(reason)
    await expect(remote.multiply(2, 3)).rejects.toBe(reason)
  })

  test('rejects calls to a worker made after the signal aborted with signal.reason', async () => {
    const controller = closer()
    const remote = Rpc.connect<Methods>(Rpc.port(worker(), { signal: controller.signal }), {
      signal: controller.signal,
    })
    await remote.multiply(1, 1)
    const reason = new Error('destroyed')
    controller.abort(reason)
    await expect(remote.multiply(2, 3)).rejects.toBe(reason)
  })

  test('gives up on a worker that never answers when the call signal times out', async () => {
    const remote = Rpc.connect<Methods>(Rpc.port(worker({ page: 'silent' })), {
      signal: closer().signal,
    })
    await expect(multiplyWithin(remote, 100)).rejects.toMatchObject(timeout)
  })

  test('removes its message listener from window when the signal aborts', async () => {
    const add = vi.spyOn(globalThis, 'addEventListener')
    const remove = vi.spyOn(globalThis, 'removeEventListener')
    onTestFinished(() => {
      add.mockRestore()
      remove.mockRestore()
    })
    const controller = new AbortController()
    const remote = connect(child().contentWindow!, {
      origin: location.origin,
      signal: controller.signal,
    })
    await remote.multiply(1, 1)
    const added = add.mock.calls.filter(([type]) => type === 'message')
    expect(added).toHaveLength(1)
    controller.abort()
    expect(remove.mock.calls).toContainEqual(added[0])
  })

  test('removes its message listener from a Worker when the signal aborts', async () => {
    const created = worker()
    const add = vi.spyOn(created, 'addEventListener')
    const remove = vi.spyOn(created, 'removeEventListener')
    const controller = new AbortController()
    const remote = Rpc.connect<Methods>(Rpc.port(created, { signal: controller.signal }), {
      signal: controller.signal,
    })
    await remote.multiply(1, 1)
    expect(add.mock.calls).toHaveLength(1)
    controller.abort()
    expect(remove.mock.calls).toEqual(add.mock.calls)
  })
})

describe('targets', () => {
  test('connects to a window opened with window.open', async () => {
    const popup = globalThis.open(childUrl({ origin: location.origin }, otherOrigin))!
    onTestFinished(() => popup.close())
    const remote = connect(popup, { origin: otherOrigin })
    await expect(remote.origin()).resolves.toBe(otherOrigin)
  })

  test('connects to a SharedWorker', async () => {
    const shared = new SharedWorker(new URL('./fixtures/shared-worker.ts', import.meta.url), {
      type: 'module',
      name: crypto.randomUUID(),
    })
    const signal = closer().signal
    const remote = Rpc.connect<Methods>(Rpc.port(shared.port, { signal }), {
      serve: parentApi(),
      signal,
    })
    await expect(remote.multiply(3, 2)).resolves.toBe(6)
    await remote.addUsingParent()
    await expect(remote.getParentReturnValue()).resolves.toBe(9)
  })

  test('connects to a service worker over a transferred MessagePort', async () => {
    const url = new URL('./fixtures/service-worker.ts', import.meta.url)
    const registration = await globalThis.navigator.serviceWorker.register(url, { type: 'module' })
    onTestFinished(() => registration.unregister().then(() => {}))
    const sw = registration.installing ?? registration.waiting ?? registration.active!
    const { port1, port2 } = new MessageChannel()
    sw.postMessage(null, [port2])
    const signal = closer().signal
    const remote = Rpc.connect<Methods>(Rpc.port(port1, { signal }), {
      serve: parentApi(),
      signal,
    })
    await expect(remote.multiply(3, 2)).resolves.toBe(6)
    await remote.addUsingParent()
    await expect(remote.getParentReturnValue()).resolves.toBe(9)
  })

  test('connects to a Worker created from a blob URL', async () => {
    const methods = await inlineModule(methodsUrl)
    const code = `import { servePort } from ${JSON.stringify(methods)}; servePort(self)`
    const url = URL.createObjectURL(new Blob([code], { type: 'text/javascript' }))
    onTestFinished(() => URL.revokeObjectURL(url))
    const created = new Worker(url, { type: 'module' })
    onTestFinished(() => created.terminate())
    const remote = Rpc.connect<Methods>(Rpc.port(created), { signal: closer().signal })
    await expect(remote.multiply(2, 5)).resolves.toBe(10)
  })

  test('connects to a Worker created from a data URL', async () => {
    const methods = await inlineModule(methodsUrl)
    const code = `import { servePort } from ${JSON.stringify(methods)}; servePort(self)`
    const created = new Worker(`data:text/javascript,${encodeURIComponent(code)}`, {
      type: 'module',
    })
    onTestFinished(() => created.terminate())
    const remote = Rpc.connect<Methods>(Rpc.port(created), { signal: closer().signal })
    await expect(remote.multiply(2, 5)).resolves.toBe(10)
  })
})
