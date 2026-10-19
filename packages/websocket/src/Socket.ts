import * as Timers from '@portable/timers'
/** A received message: text as a `string`, binary data as a `Uint8Array`. */
export type Message = string | Uint8Array<ArrayBuffer>

/** The readable and writable sides of a WebSocket. */
export type Duplex = {
  /** Received messages. */
  readable: ReadableStream<Message>
  /** Messages to send. */
  writable: WritableStream<string | Uint8Array<ArrayBuffer>>
}

/** The part of the platform `WebSocket` this package uses. Any object with this shape works. */
export type Socket = {
  readonly readyState: number
  readonly bufferedAmount: number
  binaryType: string
  send(data: string | Uint8Array<ArrayBuffer>): void
  close(code?: number, reason?: string): void
  addEventListener(type: string, listener: (event: SocketEvent) => void): void
  removeEventListener(type: string, listener: (event: SocketEvent) => void): void
}

/** The fields this package reads from `message` and `close` events. */
export type SocketEvent = Event & { data?: unknown; code?: number; reason?: string }

/** Thrown when the other side closes the connection, or when it closes for good. */
export class CloseError extends Error {
  override name = 'WebSockets.CloseError'
  /** The close code, such as 1006 for a dropped connection. */
  readonly code: number
  /** The close reason the other side sent, or `''`. */
  readonly reason: string
  constructor(code: number, reason: string) {
    super(`The WebSocket closed with code ${code}${reason ? ` (${reason})` : ''}.`)
    this.code = code
    this.reason = reason
  }
}

/** Thrown when received messages waiting to be read exceed `maxBuffered`. */
export class MaxBufferedError extends Error {
  override name = 'WebSockets.MaxBufferedError'
  /** The limit that was exceeded. */
  readonly maxBuffered: number
  constructor(maxBuffered: number) {
    super(`Received messages exceeded maxBuffered of ${maxBuffered}.`)
    this.maxBuffered = maxBuffered
  }
}

export const OPEN = 1
export const CONNECTING = 0

const maxTimeout = 2 ** 31 - 1

export function timeout(fn: () => void, ms: number): ReturnType<typeof setTimeout> | undefined {
  return ms === Infinity ? undefined : setTimeout(fn, Math.min(ms, maxTimeout))
}

export function toMessage(data: unknown): Message {
  if (typeof data === 'string') return data
  if (data instanceof ArrayBuffer) return new Uint8Array(data)
  if (ArrayBuffer.isView(data)) {
    const { buffer, byteOffset, byteLength } = data
    if (buffer instanceof ArrayBuffer) return new Uint8Array(buffer, byteOffset, byteLength)
    return new Uint8Array(new Uint8Array(buffer, byteOffset, byteLength))
  }
  throw new TypeError('Expected a string or ArrayBuffer message. Set binaryType to "arraybuffer".')
}

export const messageSize = (message: Message): number =>
  typeof message === 'string' ? message.length : message.byteLength

export async function drained(socket: Socket, highWaterMark: number): Promise<void> {
  for (let wait = 1; socket.bufferedAmount > highWaterMark && socket.readyState === OPEN;) {
    await Timers.sleep(wait)
    wait = Math.min(wait * 2, 32)
  }
}

export function isNormalClose(code: number): boolean {
  return code === 1000 || code === 1001 || code === 1005
}

export function checkSize(name: string, value: number, min = 0): void {
  if (!(value >= min)) throw new RangeError(`Expected \`${name}\` to be a number >= ${min}.`)
}

export const closedError = (): DOMException =>
  new DOMException('The WebSocket is closed.', 'InvalidStateError')

export const cancelledError = (): DOMException =>
  new DOMException('The WebSocket streams were cancelled.', 'AbortError')
