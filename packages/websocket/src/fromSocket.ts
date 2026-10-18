import {
  CONNECTING,
  CloseError,
  type Duplex,
  MaxBufferedError,
  type Message,
  OPEN,
  type Socket,
  type SocketEvent,
  cancelledError,
  checkSize,
  closedError,
  drained,
  isNormalClose,
  messageSize,
  toMessage,
} from './Socket.js'

export declare namespace fromSocket {
  type Options = {
    /** Writes wait while the socket's `bufferedAmount` is above this many bytes. @default 1048576 */
    highWaterMark?: number | undefined
    /**
     * Most bytes (characters for text) of received messages to hold while the reader is behind. Past it,
     * both streams fail with `MaxBufferedError` and the socket closes. @default Infinity
     */
    maxBuffered?: number | undefined
  }
}

/**
 * Wraps an existing WebSocket, such as one a server accepted, in a readable and a writable stream. It
 * never reconnects. Writes wait until the socket opens.
 *
 * The readable closes when the socket closes with code 1000, 1001 or 1005, and fails with a
 * `CloseError` for any other code. The writable fails with a `CloseError` once the socket closes.
 *
 * @example
 * ```ts
 * import * as WebSockets from '@portable/websocket'
 *
 * export default {
 *   fetch(request: Request) {
 *     const [client, server] = Object.values(new WebSocketPair())
 *     server.accept()
 *     const { readable, writable } = WebSockets.fromSocket(server)
 *     readable.pipeTo(writable) // echo
 *     return new Response(null, { status: 101, webSocket: client })
 *   },
 * }
 * ```
 */
export function fromSocket(socket: Socket, options: fromSocket.Options = {}): Duplex {
  const { highWaterMark = 1 << 20, maxBuffered = Infinity } = options
  checkSize('highWaterMark', highWaterMark)
  checkSize('maxBuffered', maxBuffered, 1)
  socket.binaryType = 'arraybuffer'

  let readableController!: ReadableStreamDefaultController<Message>
  let writableController!: WritableStreamDefaultController
  let done = false
  let failure: unknown

  const opened = new Promise<void>((resolve, reject) => {
    if (socket.readyState !== CONNECTING) return resolve()
    socket.addEventListener('open', () => resolve())
    socket.addEventListener('close', () => reject(closedError()))
  })
  opened.catch(() => {})

  const finish = (error: unknown, closeReadable: boolean) => {
    if (done) return
    done = true
    failure = error
    socket.removeEventListener('message', onMessage)
    socket.removeEventListener('close', onClose)
    try {
      if (closeReadable) readableController.close()
      else readableController.error(error)
    } catch {}
    writableController.error(error)
  }

  const shutdown = (error: unknown) => {
    finish(error, false)
    socket.close(1000)
  }

  const onMessage = (event: SocketEvent) => {
    let message: Message
    try {
      message = toMessage(event.data)
    } catch (error) {
      return shutdown(error)
    }
    readableController.enqueue(message)
    if (readableController.desiredSize! < 0) shutdown(new MaxBufferedError(maxBuffered))
  }

  const onClose = (event: SocketEvent) => {
    const code = event.code ?? 1005
    finish(new CloseError(code, event.reason ?? ''), isNormalClose(code))
  }

  socket.addEventListener('message', onMessage)
  socket.addEventListener('close', onClose)
  socket.addEventListener('error', () => {})

  const readable = new ReadableStream<Message>(
    {
      start(controller) {
        readableController = controller
      },
      cancel(reason) {
        shutdown(reason ?? cancelledError())
      },
    },
    { highWaterMark: maxBuffered, size: messageSize },
  )

  const writable = new WritableStream<string | Uint8Array<ArrayBuffer>>({
    start(controller) {
      writableController = controller
    },
    async write(chunk) {
      await opened
      await drained(socket, highWaterMark)
      if (done) throw failure
      if (socket.readyState !== OPEN) throw closedError()
      socket.send(chunk)
    },
    close() {
      socket.close(1000)
    },
    abort(reason) {
      shutdown(reason)
    },
  })

  return { readable, writable }
}
