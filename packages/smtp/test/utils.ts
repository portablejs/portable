import * as Smtp from '@portable/smtp'
import { expect } from 'vite-plus/test'

/** The server side of one fake connection. */
export type Connection = {
  /** True after STARTTLS, or for a socket opened with `secureTransport: 'on'`. */
  readonly secure: boolean
  write(reply: string | Uint8Array): void
  /** Writes the reply, if any, then closes the connection. */
  end(reply?: string): void
  /** Fails the client's reads, as a reset connection does. */
  destroy(): void
}

/** A reply: the text to send, `false` to stay silent, or a function of the command line. */
export type Handler =
  | string
  | false
  | ((line: string, connection: Connection) => string | false | void)

/**
 * Replies keyed by the first word of each command. `greeting` is sent on connect, `DATA_END` answers
 * the end of a message and `DEFAULT` answers anything else, such as AUTH LOGIN continuation lines.
 */
export type Script = { [command: string]: Handler | undefined }

export type FakeServer = {
  connect: Smtp.Connect
  /** Every command line received, in order. */
  commands: string[]
  /** Message bodies with dot-stuffing removed and lines joined with CRLF. */
  messages: string[]
  /** Each chunk the client wrote, decoded as UTF-8. */
  writes: string[]
  /** The address and options of each socket opened. */
  sockets: ({ hostname: string; port: number } & Smtp.SocketOptions)[]
  /** How many sockets the client closed. */
  closed: number
}

const defaults: Record<string, Handler> = {
  greeting: '220 test ESMTP\r\n',
  EHLO: '250 test\r\n',
  HELO: '250 test\r\n',
  LHLO: '250 test\r\n',
  STARTTLS: '454 4.7.0 TLS not available\r\n',
  AUTH: '235 2.7.0 Authentication successful\r\n',
  MAIL: '250 2.1.0 Sender OK\r\n',
  RCPT: '250 2.1.5 Recipient OK\r\n',
  DATA: '354 End data with <CR><LF>.<CR><LF>\r\n',
  DATA_END: '250 2.0.0 OK queued\r\n',
  RSET: '250 2.0.0 OK\r\n',
  QUIT: '221 2.0.0 Bye\r\n',
  DEFAULT: '500 5.5.1 Command unrecognized\r\n',
}

const encoder = new TextEncoder()
const decoder = new TextDecoder()

export type FakeOptions = {
  /** Make `opened` reject, as a refused connection does. */
  refuse?: boolean | undefined
  /** Make `opened` of the TLS socket reject, as a failed handshake does. */
  failTls?: boolean | undefined
}

/** A scripted SMTP server behind a fake `connect`, so tests run in every runtime. */
export function fakeServer(script: Script = {}, options: FakeOptions = {}): FakeServer {
  const server: FakeServer = {
    connect,
    commands: [],
    messages: [],
    writes: [],
    sockets: [],
    closed: 0,
  }

  function connect(address: { hostname: string; port: number }, socketOptions: Smtp.SocketOptions) {
    server.sockets.push({ ...address, ...socketOptions })
    let buffered = ''
    let inData = false
    let body: string[] = []
    let current: { controller: ReadableStreamDefaultController<Uint8Array>; done: boolean }

    const connection = {
      secure: socketOptions.secureTransport === 'on',
      write(reply) {
        if (current.done) return
        current.controller.enqueue(typeof reply === 'string' ? encoder.encode(reply) : reply)
      },
      end(reply?: string) {
        if (reply) connection.write(reply)
        if (current.done) return
        current.done = true
        current.controller.close()
      },
      destroy() {
        if (current.done) return
        current.done = true
        current.controller.error(new Error('Connection reset'))
      },
    } satisfies Connection

    const answer = (key: string, line: string): string | false | void => {
      const handler = script[key] ?? defaults[key] ?? script.DEFAULT ?? defaults.DEFAULT!
      const reply = typeof handler === 'function' ? handler(line, connection) : handler
      if (reply) connection.write(reply)
      return reply
    }

    const receive = (chunk: Uint8Array) => {
      server.writes.push(decoder.decode(chunk))
      buffered += decoder.decode(chunk)
      let index: number
      while ((index = buffered.indexOf('\r\n')) !== -1) {
        const line = buffered.slice(0, index)
        buffered = buffered.slice(index + 2)
        if (inData) {
          if (line === '.') {
            inData = false
            server.messages.push(body.join('\r\n'))
            body = []
            answer('DATA_END', line)
          } else body.push(line.startsWith('.') ? line.slice(1) : line)
          continue
        }
        server.commands.push(line)
        const key = (line.split(/\s/)[0] ?? '').toUpperCase()
        const reply = answer(key, line)
        if (key === 'DATA' && reply && /(^|\n)3\d\d [^\n]*\r\n$/.test(reply)) inData = true
        else if (key === 'QUIT') connection.end()
      }
    }

    const createSocket = (secure: boolean, open: Promise<unknown>): Smtp.Socket => {
      let controller!: ReadableStreamDefaultController<Uint8Array>
      const readable = new ReadableStream<Uint8Array>({
        start(c) {
          controller = c
        },
      })
      const state = { controller, done: false, closedByClient: false }
      current = state
      let resolveClosed = () => {}
      const closed = new Promise<void>((resolve) => {
        resolveClosed = resolve
      })
      const writable = new WritableStream<Uint8Array>({
        write(chunk) {
          if (state.closedByClient || current !== state) throw new Error('Socket is closed')
          if (state.done) throw new Error('Connection reset')
          receive(chunk)
        },
      })
      open.catch(() => {})
      return {
        readable,
        writable,
        opened: open,
        closed,
        close() {
          if (state.closedByClient) return
          state.closedByClient = true
          server.closed++
          if (!state.done) {
            state.done = true
            controller.close()
          }
          resolveClosed()
        },
        startTls() {
          if (socketOptions.secureTransport !== 'starttls' || secure) {
            throw new Error('startTls() needs a socket opened with secureTransport: starttls')
          }
          if (!state.done) {
            state.done = true
            controller.close()
          }
          buffered = ''
          Object.assign(connection, { secure: true })
          return createSocket(
            true,
            options.failTls ? Promise.reject(new Error('Handshake failed')) : Promise.resolve(),
          )
        },
      }
    }

    const socket = createSocket(
      connection.secure,
      options.refuse ? Promise.reject(new Error('Connection refused')) : Promise.resolve(),
    )
    if (!options.refuse) queueMicrotask(() => answer('greeting', ''))
    return socket
  }

  return server
}

export const encode = (text: string): Uint8Array => new TextEncoder().encode(text)

export function chunked(bytes: Uint8Array, size: number): Uint8Array[] {
  const chunks: Uint8Array[] = []
  for (let i = 0; i < bytes.length; i += size) chunks.push(bytes.subarray(i, i + size))
  return chunks
}

/** Connects to a fake server without TLS, as most protocol tests need. */
export function plain(
  server: FakeServer,
  options: Partial<Smtp.connect.Options> = {},
): Promise<Smtp.Client> {
  return Smtp.connect({
    connect: server.connect,
    host: 'mx.example.com',
    secure: 'off',
    ...options,
  })
}

/** Awaits a promise that must reject with `Smtp.CommandError`, and returns the error. */
export async function failure(promise: Promise<unknown>): Promise<Smtp.CommandError> {
  const error = await promise.then(
    () => {
      throw new Error('Expected a rejection')
    },
    (error: unknown) => error,
  )
  expect(error).toBeInstanceOf(Smtp.CommandError)
  return error as Smtp.CommandError
}
