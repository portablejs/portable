import * as Rpc from '@portable/rpc'
import { onTestFinished } from 'vite-plus/test'

/** Serves `api` on one end of a `MessageChannel` and connects to it from the other end. */
export function pair<api extends object>(
  api: api,
  options: { provide?: Rpc.provide.Options; connect?: Rpc.connect.Options } = {},
): Rpc.Remote<api> {
  const { port1, port2 } = new MessageChannel()
  const controller = new AbortController()
  onTestFinished(() => {
    controller.abort()
    port1.close()
    port2.close()
  })
  Rpc.provide(Rpc.port(port1), api, { signal: controller.signal, ...options.provide })
  return Rpc.connect<api>(Rpc.port(port2), { signal: controller.signal, ...options.connect })
}

/**
 * Serves `api` over a transport the test writes raw JSON text into. `send` resolves with every
 * message the server wrote within a few turns of the event loop.
 */
export function raw(api: object, options: Rpc.provide.Options = {}) {
  const written: unknown[] = []
  let input!: ReadableStreamDefaultController<unknown>
  const readable = new ReadableStream<unknown>({ start: (c) => void (input = c) })
  const writable = new WritableStream<unknown>({
    write: (text) => void written.push(JSON.parse(text as string)),
  })
  const controller = new AbortController()
  onTestFinished(() => controller.abort())
  Rpc.provide({ readable, writable }, api, { signal: controller.signal, ...options })
  return {
    written,
    async send(text: string): Promise<unknown[]> {
      const start = written.length
      input.enqueue(text)
      await settle()
      return written.slice(start)
    },
  }
}

/** Waits for pending promise callbacks and a macrotask. */
export const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 10))

/** A `fetch` that answers with `handler`, counting requests. */
export function fetcher(api: object) {
  const handle = Rpc.handler(api)
  const requests: Request[] = []
  const fetch = async (request: Request) => {
    requests.push(request.clone())
    return handle(request)
  }
  return { fetch, requests }
}

export function deferred() {
  let resolve!: () => void
  const promise = new Promise<void>((r) => (resolve = r))
  return { promise, resolve }
}
