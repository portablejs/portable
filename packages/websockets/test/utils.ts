import type * as WebSockets from '@portable/websockets'

type Data = string | Uint8Array<ArrayBuffer>

const event = <value extends object>(type: string, fields: value): Event & value =>
  Object.assign(new Event(type), fields)

/** A WebSocket whose other side the test drives: `accept`, `receive`, `drop` and `fail`. */
export class FakeWebSocket extends EventTarget {
  readyState = 0
  bufferedAmount = 0
  binaryType = 'blob'
  readonly sent: Data[] = []
  closedWith: { code: number | undefined; reason: string | undefined } | undefined
  readonly url: string
  readonly protocols: string | string[] | undefined

  constructor(url: string, protocols?: string | string[]) {
    super()
    this.url = url
    this.protocols = protocols
  }

  send(data: Data): void {
    if (this.readyState === 0) throw new DOMException('Still connecting.', 'InvalidStateError')
    if (this.readyState === 1) this.sent.push(data)
  }

  close(code?: number, reason?: string): void {
    if (this.readyState >= 2) return
    this.closedWith = { code, reason }
    this.readyState = 2
    setTimeout(() => this.finish(code ?? 1005, reason ?? '', true))
  }

  accept(): void {
    this.readyState = 1
    this.dispatchEvent(new Event('open'))
  }

  receive(data: string | ArrayBuffer): void {
    this.dispatchEvent(event('message', { data }))
  }

  /** The server closes the connection, or it drops (1006). */
  drop(code = 1006, reason = ''): void {
    if (code === 1006) this.dispatchEvent(new Event('error'))
    this.finish(code, reason, code !== 1006)
  }

  /** The connection attempt fails before opening. */
  fail(): void {
    this.drop(1006)
  }

  private finish(code: number, reason: string, wasClean: boolean) {
    if (this.readyState === 3) return
    this.readyState = 3
    this.dispatchEvent(event('close', { code, reason, wasClean }))
  }
}

/** Records every `FakeWebSocket` that `connect` creates. */
export class FakeServer {
  readonly sockets: FakeWebSocket[] = []
  private waiting: ((socket: FakeWebSocket) => void)[] = []
  readonly WebSocket: WebSockets.connect.Constructor

  constructor() {
    const created = (socket: FakeWebSocket) => {
      this.sockets.push(socket)
      for (const resolve of this.waiting.splice(0)) resolve(socket)
    }
    this.WebSocket = class extends FakeWebSocket {
      constructor(url: string, protocols?: string | string[]) {
        super(url, protocols)
        created(this)
      }
    }
  }

  /** Waits for the socket at `index`, by default the latest one. */
  socket(index = Math.max(0, this.sockets.length - 1)): Promise<FakeWebSocket> {
    const socket = this.sockets[index]
    if (socket) return Promise.resolve(socket)
    return new Promise((resolve) => this.waiting.push(() => resolve(this.socket(index))))
  }

  /** Waits for the socket at `index`, accepts it, and waits until `connect` has set it up. */
  async accept(index?: number): Promise<FakeWebSocket> {
    const socket = await this.socket(index)
    socket.accept()
    await sleep(1)
    return socket
  }
}

export const sleep = (ms = 0): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

export async function until(check: () => boolean, ms = 10_000): Promise<void> {
  const deadline = Date.now() + ms
  while (!check()) {
    if (Date.now() > deadline) throw new Error('Timed out waiting for a condition.')
    await sleep(1)
  }
}

export const bytes = (...values: number[]): Uint8Array<ArrayBuffer> => new Uint8Array(values)

/** Resolves with the stream's error, or rejects if it ends without one. */
export async function errorOf(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise
  } catch (error) {
    return error
  }
  throw new Error('Expected a rejection.')
}

/** Reads `count` messages. */
export async function read(
  reader: ReadableStreamDefaultReader<WebSockets.Message>,
  count = 1,
): Promise<WebSockets.Message[]> {
  const messages: WebSockets.Message[] = []
  while (messages.length < count) {
    const { done, value } = await reader.read()
    if (done) break
    messages.push(value)
  }
  return messages
}
