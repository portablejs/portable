import type * as Bytes from '@portable/bytes'
import * as Timers from '@portable/timers'
import {
  type Duplex,
  type Message,
  OPEN,
  type Socket,
  type SocketEvent,
  cancelledError,
  checkSize,
  queueLimit,
  drained,
  isNormalClose,
  messageSize,
  timeout as startTimer,
  toMessage,
  toOutgoing,
} from './Socket.js'
import { CloseError, MaxBufferedError } from './errors.js'

export declare namespace connect {
  type Options = {
    /** Subprotocols to request, as for `new WebSocket(url, protocols)`. */
    protocols?: string | readonly string[] | undefined
    /** Closes the socket with code 1000 and fails both streams with `signal.reason`. */
    signal?: AbortSignal | undefined
    /** Wait before each reconnect. @default { initial: 1000, max: 30000 } */
    delay?: Timers.Delay | undefined
    /**
     * The number of consecutive failed attempts, counting the first, after which `connect` stops
     * reconnecting and fails the streams with the last error. A connection that finishes `open` resets the count.
     * @default Infinity
     */
    attempts?: number | undefined
    /** Time limit for each attempt to open and finish `open`, in ms. @default 10000 */
    timeout?: number | undefined
    /**
     * Runs on every connection, after the socket opens and before queued writes are sent. Use it to
     * authenticate or resubscribe. If it throws, the socket closes and reconnects after `delay`.
     */
    open?: ((context: Context) => void | PromiseLike<void>) | undefined
    /**
     * Called when the connection closes without the client calling `close`, with the close and
     * `{ attempt }`, the number of failures in a row including this one. It returns whether
     * `connect` reconnects. By default, codes
     * 1000, 1002, 1003, 1007, 1008, 1009 and 1010 are final and every other code reconnects. If it
     * throws, both streams fail with that error.
     */
    reconnectIf?:
      | ((close: Close, retry: { attempt: number }) => boolean | PromiseLike<boolean>)
      | undefined
    /** Writes to hold while disconnected. Further writes wait. @default 1000 */
    maxQueued?: number | undefined
    /** Writes wait while the socket's `bufferedAmount` is above this many bytes. @default 1048576 */
    highWaterMark?: number | undefined
    /**
     * Most bytes (characters for text) of received messages to hold while the reader is behind. Past it,
     * both streams fail with `MaxBufferedError` and the socket closes. @default Infinity
     */
    maxBuffered?: number | undefined
    /** Sends `ping` every `interval` ms and reconnects when no `pong` arrives within `timeout` ms. */
    heartbeat?: Heartbeat | undefined
    /** The WebSocket class to use. @default globalThis.WebSocket */
    WebSocket?: Constructor | undefined
  }

  /** What `open` receives. */
  type Context = {
    /**
     * Sends a message on this connection now, ahead of queued writes. Throws once the connection
     * has closed.
     */
    send: (message: string | Bytes.Input) => void
    /**
     * Messages received while `open` runs. Messages that `open` doesn't read go to `readable` once
     * `open` returns or cancels this stream.
     */
    messages: ReadableStream<Message>
    /** Aborts when this connection closes or the attempt times out. */
    signal: AbortSignal
  }

  /** A close the client didn't start. */
  type Close = {
    code: number
    reason: string
  }

  /** An application-level ping, for servers that close idle connections or drop them silently. */
  type Heartbeat = {
    /** The message to send. */
    ping: string | Bytes.Input
    /** Returns `true` for the reply. Replies are not passed to `readable`. */
    pong: (message: Message) => boolean
    /** Time between pings, in ms. */
    interval: number
    /** Time to wait for the reply, in ms. @default interval */
    timeout?: number | undefined
  }

  type Constructor = new (url: string, protocols?: string | string[]) => Socket

  type Url = string | URL | (() => string | URL | PromiseLike<string | URL>)
}

type Outcome = { ready: boolean } & (
  | { kind: 'close'; close: connect.Close }
  | { kind: 'error'; error: unknown; final?: boolean | undefined }
)

const finalCodes = new Set([1000, 1002, 1003, 1007, 1008, 1009, 1010])
const defaultReconnectIf = (event: connect.Close) => !finalCodes.has(event.code)

/**
 * Opens a WebSocket that reconnects when the connection drops, and returns its readable and writable
 * sides. Both streams stay the same across reconnects.
 *
 * Writes made while disconnected are queued and sent after the next connection's `open` finishes.
 * Messages the server sent while the connection dropped, and writes the old socket accepted but
 * never delivered, are lost. Add acknowledgements or sequence numbers to your protocol if that matters.
 *
 * @example
 * ```ts
 * import * as WebSockets from '@portable/websockets'
 *
 * const { readable, writable } = WebSockets.connect('wss://example.com/feed', {
 *   async open({ send }) {
 *     send(JSON.stringify({ subscribe: 'prices' }))
 *   },
 * })
 * const writer = writable.getWriter()
 * await writer.write('hello')
 * for await (const message of readable) console.log(message)
 * ```
 */
export function connect(url: connect.Url, options: connect.Options = {}): Duplex {
  const {
    protocols,
    signal,
    delay = { initial: 1000, max: 30_000 },
    attempts = Infinity,
    timeout = 10_000,
    open,
    reconnectIf = defaultReconnectIf,
    maxQueued = 1000,
    highWaterMark = 1 << 20,
    maxBuffered = Infinity,
    heartbeat,
    WebSocket: Impl = globalThis.WebSocket,
  } = options
  if (typeof Impl !== 'function')
    throw new TypeError('No WebSocket class found. Pass one as the `WebSocket` option.')
  const next = Timers.backoff(delay)
  checkSize('attempts', attempts, 1)
  checkSize('timeout', timeout, 1)
  checkSize('maxQueued', maxQueued)
  checkSize('highWaterMark', highWaterMark)
  checkSize('maxBuffered', maxBuffered, 1)
  if (heartbeat) {
    checkSize('heartbeat.interval', heartbeat.interval, 1)
    checkSize('heartbeat.timeout', heartbeat.timeout ?? heartbeat.interval, 1)
  }
  const protocolList = typeof protocols === 'string' ? protocols : protocols && [...protocols]

  let readableController!: ReadableStreamDefaultController<Message>
  let writableController!: WritableStreamDefaultController
  const stop = new AbortController()
  let failure: unknown
  let closing = false
  let current: Socket | undefined
  const queue: (string | Uint8Array<ArrayBuffer>)[] = []
  let waiters: (() => void)[] = []

  const notify = () => {
    const waiting = waiters
    waiters = []
    for (const resolve of waiting) resolve()
  }
  const changed = () => new Promise<void>((resolve) => waiters.push(resolve))

  const finish = (error: unknown, closeReadable: boolean) => {
    if (stop.signal.aborted) return
    failure = error
    stop.abort(error)
    signal?.removeEventListener('abort', onAbort)
    try {
      if (closeReadable) readableController.close()
      else readableController.error(error)
    } catch {}
    if (!closing) writableController.error(error)
    queue.length = 0
    notify()
  }

  const push = (message: Message) => {
    if (stop.signal.aborted) return
    readableController.enqueue(message)
    if (readableController.desiredSize! < 0) finish(new MaxBufferedError({ maxBuffered }), false)
  }

  const onAbort = () => finish(signal!.reason, false)

  async function session(): Promise<Outcome> {
    let socket: Socket
    try {
      const target = typeof url === 'function' ? await url() : url
      if (stop.signal.aborted) return { ready: false, kind: 'error', error: failure }
      socket = new Impl(String(target), protocolList)
    } catch (error) {
      return { ready: false, kind: 'error', error, final: typeof url !== 'function' }
    }
    socket.binaryType = 'arraybuffer'

    const attempt = new AbortController()
    let ready = false
    let outcome: Outcome | undefined
    let ended!: (outcome: Outcome) => void
    const result = new Promise<Outcome>((resolve) => (ended = resolve))

    let handshake = !!open
    const inbox: Message[] = []
    let wakeHandshake: (() => void) | undefined
    const release = () => {
      handshake = false
      for (const message of inbox) push(message)
      inbox.length = 0
      wakeHandshake?.()
    }

    let pingTimer: ReturnType<typeof setInterval> | undefined
    let pongTimer: ReturnType<typeof setTimeout> | undefined
    const openTimer = startTimer(
      () =>
        attempt.abort(
          new DOMException(`The WebSocket did not open within ${timeout} ms.`, 'TimeoutError'),
        ),
      timeout,
    )

    const end = (next: Outcome) => {
      if (outcome) return
      outcome = next
      socket.removeEventListener('message', onMessage)
      socket.removeEventListener('close', onClose)
      stop.signal.removeEventListener('abort', onStop)
      clearTimeout(openTimer)
      clearInterval(pingTimer)
      clearTimeout(pongTimer)
      if (current === socket) current = undefined
      release()
      attempt.abort()
      notify()
      ended(next)
    }

    const onMessage = (event: SocketEvent) => {
      let message: Message
      try {
        message = toMessage(event.data)
      } catch (error) {
        return finish(error, false)
      }
      if (heartbeat?.pong(message)) {
        clearTimeout(pongTimer)
        pongTimer = undefined
      } else if (handshake) {
        inbox.push(message)
        wakeHandshake?.()
      } else push(message)
    }
    const onClose = (event: SocketEvent) =>
      end({ ready, kind: 'close', close: { code: event.code ?? 1005, reason: event.reason ?? '' } })
    const onStop = () => attempt.abort(stop.signal.reason)

    socket.addEventListener('message', onMessage)
    socket.addEventListener('close', onClose)
    // Keep an error listener after teardown: the `ws` package throws an error event with no listener.
    socket.addEventListener('error', () => {})
    stop.signal.addEventListener('abort', onStop)
    attempt.signal.addEventListener('abort', () => {
      if (outcome) return
      socket.close(stop.signal.aborted ? 1000 : undefined)
      end({ ready, kind: 'error', error: attempt.signal.reason })
    })
    if (stop.signal.aborted) onStop()

    const opened = await Promise.race([
      new Promise<boolean>((resolve) => socket.addEventListener('open', () => resolve(true))),
      result.then(() => false),
    ])
    if (!opened) return result

    if (open) {
      const messages = new ReadableStream<Message>(
        {
          async pull(controller) {
            while (handshake && inbox.length === 0)
              await new Promise<void>((resolve) => (wakeHandshake = resolve))
            if (inbox.length > 0) controller.enqueue(inbox.shift()!)
            else controller.close()
          },
          cancel: release,
        },
        { highWaterMark: 0 },
      )
      const send = (message: string | Bytes.Input) => {
        if (outcome || socket.readyState !== OPEN)
          throw new DOMException('The WebSocket is not open.', 'InvalidStateError')
        socket.send(toOutgoing(message))
      }
      const handshakeDone = Promise.resolve().then(() =>
        open({ send, messages, signal: attempt.signal }),
      )
      handshakeDone.catch(() => {})
      try {
        await Promise.race([handshakeDone, result])
      } catch (error) {
        attempt.abort(error)
      }
      if (outcome) return result
    }

    clearTimeout(openTimer)
    release()
    let sent = 0
    while (sent < queue.length && socket.readyState === OPEN) socket.send(queue[sent++]!)
    queue.splice(0, sent)
    if (socket.readyState !== OPEN) return result
    ready = true
    current = socket
    notify()

    if (heartbeat) {
      const { interval, timeout: wait = interval } = heartbeat
      const ping = toOutgoing(heartbeat.ping)
      pingTimer = setInterval(() => {
        if (socket.readyState !== OPEN) return
        socket.send(ping)
        pongTimer ??= startTimer(
          () =>
            attempt.abort(
              new DOMException(`No heartbeat reply within ${wait} ms.`, 'TimeoutError'),
            ),
          wait,
        )
      }, interval)
    }
    return result
  }

  async function run() {
    for (let failures = 0; !stop.signal.aborted;) {
      const outcome = await session()
      if (stop.signal.aborted) return
      if (closing && queue.length === 0) return finish(undefined, true)
      if (outcome.ready) failures = 0
      if (outcome.kind === 'close') {
        let reconnect: boolean
        try {
          reconnect = await reconnectIf(outcome.close, { attempt: failures + 1 })
        } catch (error) {
          return finish(error, false)
        }
        if (stop.signal.aborted) return
        if (!reconnect) {
          const { code, reason } = outcome.close
          return finish(new CloseError({ code, reason }), isNormalClose(code))
        }
      }
      const error =
        outcome.kind === 'error'
          ? outcome.error
          : new CloseError({ code: outcome.close.code, reason: outcome.close.reason })
      if (outcome.kind === 'error' && outcome.final) return finish(error, false)
      if (++failures >= attempts) return finish(error, false)
      await Timers.sleep(next({ attempt: failures, error }), { signal: stop.signal }).catch(
        () => {},
      )
    }
  }

  const write = (chunk: string | Uint8Array<ArrayBuffer>): Promise<void> | undefined => {
    if (stop.signal.aborted) throw failure
    if (current?.readyState === OPEN && queue.length === 0) {
      if (current.bufferedAmount > highWaterMark)
        return drained(current, highWaterMark).then(() => write(chunk))
      current.send(chunk)
      return
    }
    if (queue.length < maxQueued) {
      queue.push(chunk)
      return
    }
    return changed().then(() => write(chunk))
  }

  const readable = new ReadableStream<Message>(
    {
      start(controller) {
        readableController = controller
      },
      cancel(reason) {
        finish(reason ?? cancelledError(), false)
      },
    },
    { highWaterMark: queueLimit(maxBuffered), size: messageSize },
  )

  const writable = new WritableStream<string | Bytes.Input>({
    start(controller) {
      writableController = controller
    },
    write(chunk) {
      return write(toOutgoing(chunk))
    },
    async close() {
      while (queue.length > 0 && !stop.signal.aborted) await changed()
      if (stop.signal.aborted) throw failure
      closing = true
      if (current) current.close(1000)
      else finish(undefined, true)
    },
    abort(reason) {
      finish(reason, false)
    },
  })

  if (signal?.aborted) finish(signal.reason, false)
  else {
    signal?.addEventListener('abort', onAbort)
    void run()
  }
  return { readable, writable }
}
