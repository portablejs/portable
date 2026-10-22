import * as Base64 from '@portable/base64'
import { CommandError, type Rejection } from './CommandError.js'
import { DataStream, encodeData } from './DataStream.js'
import { createReader, type Reader, type Reply } from './reader.js'
import type { Connect, Socket } from './Socket.js'

/** Credentials for AUTH PLAIN or LOGIN, or an OAuth 2.0 access token for XOAUTH2. */
export type Auth =
  | {
      user: string
      pass: string
      /** The SASL mechanism. By default PLAIN, or LOGIN when the server offers only LOGIN. */
      method?: 'PLAIN' | 'LOGIN' | undefined
    }
  | { user: string; accessToken: string }

/**
 * RFC 3461 delivery status notification parameters. They are sent only when the server offers
 * DSN.
 */
export type Dsn = {
  /** Whether a bounce returns the whole message or only its headers. */
  ret?: 'FULL' | 'HDRS' | undefined
  /** An envelope id, returned in every notification. */
  envid?: string | undefined
  /** When to notify the sender, for every recipient. */
  notify?: 'NEVER' | readonly ('SUCCESS' | 'FAILURE' | 'DELAY')[] | undefined
}

/** A message and its envelope. */
export type Mail = {
  /** The envelope sender (MAIL FROM). `''` sends the null sender `<>`, as bounces do. */
  from: string
  /** The envelope recipients (RCPT TO). */
  to: string | readonly string[]
  /** The raw RFC 5322 message. Line breaks are converted to CRLF and dot-stuffing is applied. */
  message: ReadableStream<Uint8Array> | Uint8Array | string
  /**
   * The message size in bytes, declared with SIZE and checked against the server's limit. For
   * bytes and strings, `send` computes the size and ignores this value.
   */
  size?: number | undefined
  dsn?: Dsn | undefined
  /** Ask the server to relay only over TLS (RFC 8689 REQUIRETLS). The send fails if the server doesn't offer it. */
  requireTls?: boolean | undefined
}

/** The outcome of a send that reached at least one recipient. */
export type Result = {
  /** Recipients the server accepted, in the order given. */
  accepted: string[]
  /** Recipients the server refused, with their replies. */
  rejected: Rejection[]
  /** The server's reply to the end of the message, such as `'250 2.0.0 Ok: queued as 4F3C2'`. */
  response: string
}

/** An open SMTP session, from `Smtp.connect`. Calls run one at a time, in the order they are made. */
export type Client = {
  /** Whether the connection is encrypted. */
  readonly secure: boolean
  /** The extension lines of the EHLO reply, such as `'SIZE 35882577'`. Empty after a HELO fallback. */
  readonly extensions: readonly string[]
  /** Sends one message. Rejects if the sender, every recipient or the message is refused. */
  send(mail: Mail, options?: Client.SendOptions): Promise<Result>
  /** Sends QUIT and closes the socket. Never rejects. */
  close(options?: Client.CloseOptions): Promise<void>
}

export declare namespace Client {
  type SendOptions = {
    /** Aborting rejects with `signal.reason` and closes the connection. */
    signal?: AbortSignal | undefined
  }
  type CloseOptions = {
    /** Stops waiting for the reply to QUIT. */
    signal?: AbortSignal | undefined
  }
}

export declare namespace connect {
  type Options = {
    /** Opens the TCP connection, such as `connect` from `cloudflare:sockets`. */
    connect: Connect
    host: string
    /** @default 465 when `secure` is `'on'`, otherwise 587 */
    port?: number | undefined
    /**
     * `'on'` starts TLS right away, `'starttls'` requires the STARTTLS command, and `'off'` never encrypts.
     * @default 'on' for port 465, otherwise 'starttls'
     */
    secure?: 'on' | 'starttls' | 'off' | undefined
    auth?: Auth | undefined
    /** Send credentials over an unencrypted connection. Without it, AUTH requires TLS. @default false */
    allowInsecureAuth?: boolean | undefined
    /** The client's host name for EHLO. @default '[127.0.0.1]' */
    name?: string | undefined
    /** Speak LMTP (RFC 2033): LHLO, and one reply per recipient after the message. @default false */
    lmtp?: boolean | undefined
    /** Limits connecting, the TLS handshake and authentication. Aborting rejects with `signal.reason`. */
    signal?: AbortSignal | undefined
  }
}

type Session = {
  read(command: string): Promise<Reply>
  write(text: string, command: string): Promise<void>
  writeBytes(bytes: Uint8Array, command: string): Promise<void>
  pipe(stream: ReadableStream<Uint8Array>): Promise<void>
  upgrade(): Promise<void>
  destroy(): void
  readonly closed: boolean
}

const encoder = new TextEncoder()
const nonAscii = /[^ -~]/
const invalidAddress = /[<>]|[^ -~\u0080-\uffff]/

function createSession(first: Socket): Session {
  let socket = first
  let reader: Reader = createReader(socket.readable)
  let writer = socket.writable.getWriter()
  let closed = false

  const watch = (s: Socket) => {
    s.opened.catch(() => {})
    s.closed.catch(() => {})
  }
  watch(socket)

  const session: Session = {
    get closed() {
      return closed
    },
    async read(command) {
      const reply = await reader.read(command)
      if (reply.code === 421) session.destroy()
      return reply
    },
    async write(text, command) {
      await session.writeBytes(encoder.encode(text), command)
    },
    async writeBytes(bytes, command) {
      if (closed) throw new CommandError('ECONNECTION', 'Connection is closed', { command })
      try {
        await writer.write(bytes)
      } catch (cause) {
        throw new CommandError('ECONNECTION', 'Connection closed unexpectedly', { command, cause })
      }
    },
    async pipe(stream) {
      writer.releaseLock()
      try {
        await stream.pipeThrough(new DataStream()).pipeTo(socket.writable, { preventClose: true })
      } catch (cause) {
        session.destroy()
        throw new CommandError('EMESSAGE', 'Could not send the message', { command: 'DATA', cause })
      }
      writer = socket.writable.getWriter()
    },
    async upgrade() {
      reader.discard()
      reader.release()
      writer.releaseLock()
      try {
        socket = socket.startTls()
        watch(socket)
        await socket.opened
      } catch (cause) {
        session.destroy()
        throw new CommandError('ETLS', 'TLS handshake failed', { command: 'STARTTLS', cause })
      }
      reader = createReader(socket.readable)
      writer = socket.writable.getWriter()
    },
    destroy() {
      if (closed) return
      closed = true
      reader.cancel()
      try {
        Promise.resolve(socket.close()).catch(() => {})
      } catch {}
    },
  }
  return session
}

async function guard<T>(
  session: Session,
  signal: AbortSignal | undefined,
  run: () => Promise<T>,
): Promise<T> {
  if (!signal) return run()
  signal.throwIfAborted()
  let onAbort = () => {}
  const aborted = new Promise<never>((_, reject) => {
    onAbort = () => {
      session.destroy()
      reject(signal.reason)
    }
  })
  signal.addEventListener('abort', onAbort, { once: true })
  try {
    return await Promise.race([run(), aborted])
  } catch (error) {
    if (signal.aborted) throw signal.reason
    throw error
  } finally {
    signal.removeEventListener('abort', onAbort)
  }
}

function xtext(text: string): string {
  let out = ''
  for (const byte of encoder.encode(text)) {
    out +=
      byte > 32 && byte < 127 && byte !== 43 && byte !== 61
        ? String.fromCharCode(byte)
        : `+${byte.toString(16).toUpperCase().padStart(2, '0')}`
  }
  return out
}

function keyword(line: string): string {
  return (line.split(/[\s=]/, 1)[0] ?? '').toUpperCase()
}

function authMethods(extensions: readonly string[]): string[] {
  const methods: string[] = []
  for (const line of extensions) {
    if (keyword(line) !== 'AUTH') continue
    for (const method of line
      .slice(5)
      .trim()
      .toUpperCase()
      .split(/[\s=]+/)) {
      if (method && !methods.includes(method)) methods.push(method)
    }
  }
  return methods
}

function sizeLimit(extensions: readonly string[]): number {
  const line = extensions.find((line) => keyword(line) === 'SIZE')
  return Number(line?.slice(5).trim()) || 0
}

/**
 * Opens an SMTP session: connects, reads the greeting, sends EHLO (or HELO), starts TLS and logs in.
 *
 * @example
 * ```ts
 * import * as Smtp from '@portable/smtp'
 * import { connect } from 'cloudflare:sockets'
 *
 * const client = await Smtp.connect({
 *   connect,
 *   host: 'smtp.example.com',
 *   auth: { user: 'me@example.com', pass: env.SMTP_PASSWORD },
 *   signal: AbortSignal.timeout(10_000),
 * })
 * const result = await client.send({ from: 'me@example.com', to: ['you@example.com'], message })
 * await client.close()
 * ```
 */
export async function connect(options: connect.Options): Promise<Client> {
  const {
    connect: open,
    host,
    secure = options.port === 465 ? 'on' : 'starttls',
    port = secure === 'on' ? 465 : 587,
    auth,
    allowInsecureAuth = false,
    name = '[127.0.0.1]',
    lmtp = false,
    signal,
  } = options
  if (/[\r\n]/.test(name)) throw new RangeError('`name` must not contain CR or LF')
  signal?.throwIfAborted()

  let socket: Socket
  try {
    socket = open({ hostname: host, port }, { secureTransport: secure, allowHalfOpen: false })
  } catch (cause) {
    throw new CommandError('ECONNECTION', `Could not connect to ${host}:${port}`, {
      command: 'CONNECT',
      cause,
    })
  }
  const session = createSession(socket)
  let tls = secure === 'on'
  let extensions: string[] = []

  const hello = async (): Promise<string[]> => {
    const verb = lmtp ? 'LHLO' : 'EHLO'
    await session.write(`${verb} ${name}\r\n`, verb)
    const reply = await session.read(verb)
    if (reply.code === 250) return reply.lines.slice(1)
    if (reply.code === 421) {
      throw new CommandError('ECONNECTION', 'Server is closing the connection', {
        command: verb,
        reply,
      })
    }
    if (lmtp) throw new CommandError('EPROTOCOL', 'LHLO refused', { command: verb, reply })
    if (secure === 'starttls' && !tls) {
      throw new CommandError('ETLS', 'EHLO refused, and HELO cannot start TLS', {
        command: verb,
        reply,
      })
    }
    await session.write(`HELO ${name}\r\n`, 'HELO')
    const helo = await session.read('HELO')
    if (helo.code !== 250) {
      throw new CommandError(helo.code === 421 ? 'ECONNECTION' : 'EPROTOCOL', 'HELO refused', {
        command: 'HELO',
        reply: helo,
      })
    }
    return []
  }

  const login = async (credentials: Auth) => {
    if (!tls && !allowInsecureAuth) {
      throw new CommandError(
        'EAUTH',
        'Refusing to send credentials over an unencrypted connection. Use `secure`, or set `allowInsecureAuth`',
        { command: 'AUTH' },
      )
    }
    const offered = authMethods(extensions)
    const expect = (reply: Reply, code: number, command: string) => {
      if (reply.code !== code) {
        throw new CommandError(
          reply.code === 421 ? 'ECONNECTION' : 'EAUTH',
          'Authentication failed',
          {
            command,
            reply,
          },
        )
      }
    }
    const step = async (line: string, command: string) => {
      await session.write(`${line}\r\n`, command)
      return session.read(command)
    }

    if ('accessToken' in credentials) {
      const command = 'AUTH XOAUTH2'
      const token = Base64.encode(
        `user=${credentials.user}\x01auth=Bearer ${credentials.accessToken}\x01\x01`,
      )
      let reply = await step(`${command} ${token}`, command)
      if (reply.code === 334) reply = await step('', command)
      return expect(reply, 235, command)
    }

    const method =
      credentials.method ??
      (offered.includes('LOGIN') && !offered.includes('PLAIN') ? 'LOGIN' : 'PLAIN')
    if (!credentials.method && offered.length > 0 && !offered.includes(method)) {
      throw new CommandError(
        'EAUTH',
        `No supported authentication method. The server offers ${offered.join(', ')}`,
        { command: 'AUTH' },
      )
    }
    const command = `AUTH ${method}`
    if (method === 'PLAIN') {
      const response = Base64.encode(`\0${credentials.user}\0${credentials.pass}`)
      let reply = await step(`${command} ${response}`, command)
      if (reply.code === 334) reply = await step(response, command)
      return expect(reply, 235, command)
    }
    expect(await step(command, command), 334, command)
    expect(await step(Base64.encode(credentials.user), command), 334, command)
    expect(await step(Base64.encode(credentials.pass), command), 235, command)
  }

  try {
    await guard(session, signal, async () => {
      try {
        await socket.opened
      } catch (cause) {
        throw new CommandError('ECONNECTION', `Could not connect to ${host}:${port}`, {
          command: 'CONNECT',
          cause,
        })
      }
      const greeting = await session.read('CONNECT')
      if (greeting.code !== 220) {
        throw new CommandError(
          greeting.code === 421 ? 'ECONNECTION' : 'EPROTOCOL',
          'Invalid greeting',
          { command: 'CONNECT', reply: greeting },
        )
      }
      extensions = await hello()
      if (secure === 'starttls') {
        if (!extensions.some((line) => keyword(line) === 'STARTTLS')) {
          throw new CommandError('ETLS', 'Server does not offer STARTTLS', { command: 'STARTTLS' })
        }
        await session.write('STARTTLS\r\n', 'STARTTLS')
        const reply = await session.read('STARTTLS')
        if (reply.code !== 220) {
          throw new CommandError(reply.code === 421 ? 'ECONNECTION' : 'ETLS', 'STARTTLS refused', {
            command: 'STARTTLS',
            reply,
          })
        }
        await session.upgrade()
        tls = true
        extensions = await hello()
      }
      if (auth) await login(auth)
    })
  } catch (error) {
    session.destroy()
    throw error
  }

  return createClient(session, { tls, extensions, lmtp })
}

function createClient(
  session: Session,
  state: { tls: boolean; extensions: string[]; lmtp: boolean },
): Client {
  const { tls, extensions, lmtp } = state
  const has = (name: string) => extensions.some((line) => keyword(line) === name)
  let queue: Promise<unknown> = Promise.resolve()
  const enqueue = <T>(run: () => Promise<T>): Promise<T> => {
    const next = queue.then(run)
    queue = next.catch(() => {})
    return next
  }

  let sending = false

  const reset = async () => {
    if (session.closed) return
    try {
      await session.write('RSET\r\n', 'RSET')
      if ((await session.read('RSET')).code !== 250) session.destroy()
    } catch {
      session.destroy()
    }
  }

  const transaction = async (mail: Mail): Promise<Result> => {
    const recipients = typeof mail.to === 'string' ? [mail.to] : [...mail.to]
    if (recipients.length === 0) {
      throw new CommandError('EENVELOPE', 'No recipients', { command: 'RCPT TO' })
    }
    if (invalidAddress.test(mail.from)) {
      throw new CommandError('EENVELOPE', `Invalid sender ${JSON.stringify(mail.from)}`, {
        command: 'MAIL FROM',
      })
    }
    for (const recipient of recipients) {
      if (!recipient || invalidAddress.test(recipient)) {
        throw new CommandError('EENVELOPE', `Invalid recipient ${JSON.stringify(recipient)}`, {
          command: 'RCPT TO',
        })
      }
    }
    if (mail.size !== undefined && !(Number.isSafeInteger(mail.size) && mail.size >= 0)) {
      throw new RangeError('`size` must be a non-negative integer')
    }
    const utf8 = nonAscii.test(mail.from) || recipients.some((to) => nonAscii.test(to))
    if (utf8 && !has('SMTPUTF8')) {
      throw new CommandError('EENVELOPE', 'Server does not support SMTPUTF8 addresses', {
        command: 'MAIL FROM',
      })
    }
    if (mail.requireTls && !(tls && has('REQUIRETLS'))) {
      throw new CommandError(
        'EENVELOPE',
        tls ? 'Server does not support REQUIRETLS' : 'REQUIRETLS needs an encrypted connection',
        { command: 'MAIL FROM' },
      )
    }
    const { message } = mail
    const data =
      typeof message === 'string'
        ? encodeData(encoder.encode(message))
        : message instanceof Uint8Array
          ? encodeData(message)
          : undefined
    const size = data ? data.length : mail.size
    const limit = sizeLimit(extensions)
    if (limit > 0 && size !== undefined && size > limit) {
      throw new CommandError(
        'EMESSAGE',
        `Message size ${size} exceeds the server limit of ${limit}`,
        {
          command: 'MAIL FROM',
        },
      )
    }

    const params: string[] = []
    if (utf8) params.push('SMTPUTF8')
    if (has('8BITMIME')) params.push('BODY=8BITMIME')
    if (size !== undefined && has('SIZE')) params.push(`SIZE=${size}`)
    const dsn = mail.dsn && has('DSN') ? mail.dsn : undefined
    if (dsn?.ret) params.push(`RET=${dsn.ret}`)
    if (dsn?.envid) params.push(`ENVID=${xtext(dsn.envid)}`)
    if (mail.requireTls) params.push('REQUIRETLS')
    const notify =
      dsn?.notify === undefined
        ? ''
        : ` NOTIFY=${typeof dsn.notify === 'string' ? dsn.notify : dsn.notify.join(',')}`

    const pipelining = has('PIPELINING')
    const mailCommand = `MAIL FROM:<${mail.from}>${params.map((p) => ` ${p}`).join('')}\r\n`
    const rcptCommands = recipients.map((to) => `RCPT TO:<${to}>${notify}\r\n`)
    if (pipelining) {
      await session.write(mailCommand + rcptCommands.join('') + 'DATA\r\n', 'MAIL FROM')
    } else await session.write(mailCommand, 'MAIL FROM')

    const sender = await session.read('MAIL FROM')
    const senderAccepted = sender.code === 250
    if (sender.code === 421 || (!senderAccepted && !pipelining)) {
      throw new CommandError(sender.code === 421 ? 'ECONNECTION' : 'EENVELOPE', 'Sender refused', {
        command: 'MAIL FROM',
        reply: sender,
      })
    }

    const accepted: string[] = []
    const rejected: Rejection[] = []
    for (const [i, recipient] of recipients.entries()) {
      if (!pipelining) await session.write(rcptCommands[i]!, 'RCPT TO')
      const reply = await session.read('RCPT TO')
      if (reply.code === 421) {
        throw new CommandError('ECONNECTION', 'Server is closing the connection', {
          command: 'RCPT TO',
          reply,
        })
      }
      if (reply.code === 250 || reply.code === 251) accepted.push(recipient)
      else {
        rejected.push({
          recipient,
          responseCode: reply.code,
          enhancedCode: reply.enhancedCode,
          response: reply.response,
        })
      }
    }

    let dataReply: Reply | undefined
    if (pipelining) {
      dataReply = await session.read('DATA')
      if (dataReply.code === 421) {
        throw new CommandError('ECONNECTION', 'Server is closing the connection', {
          command: 'DATA',
          reply: dataReply,
        })
      }
      if (!senderAccepted) {
        if (dataReply.code === 354) session.destroy()
        throw new CommandError('EENVELOPE', 'Sender refused', {
          command: 'MAIL FROM',
          reply: sender,
        })
      }
    }

    if (accepted.length === 0) {
      if (dataReply?.code === 354) {
        await session.write('.\r\n', 'DATA')
        await session.read('DATA')
      }
      await reset()
      const first = rejected.find((r) => r.responseCode < 500) ?? rejected[0]!
      throw new CommandError('EENVELOPE', 'Every recipient was refused', {
        command: 'RCPT TO',
        reply: {
          code: first.responseCode,
          enhancedCode: first.enhancedCode,
          lines: [],
          response: first.response,
        },
        rejected,
      })
    }

    if (!pipelining) {
      await session.write('DATA\r\n', 'DATA')
      dataReply = await session.read('DATA')
    }
    if (dataReply!.code !== 354) {
      if (dataReply!.code !== 421) await reset()
      throw new CommandError(
        dataReply!.code === 421 ? 'ECONNECTION' : 'EENVELOPE',
        'DATA refused',
        { command: 'DATA', reply: dataReply },
      )
    }

    sending = true
    if (data) await session.writeBytes(data, 'DATA')
    else await session.pipe(message as ReadableStream<Uint8Array>)

    if (!lmtp) {
      const reply = await session.read('DATA')
      if (reply.code !== 250) {
        throw new CommandError(reply.code === 421 ? 'ECONNECTION' : 'EMESSAGE', 'Message refused', {
          command: 'DATA',
          reply,
        })
      }
      return { accepted, rejected, response: reply.response }
    }

    const delivered: string[] = []
    let response = ''
    for (const recipient of accepted) {
      const reply = await session.read('DATA')
      if (reply.code === 250) {
        delivered.push(recipient)
        response = reply.response
      } else {
        rejected.push({
          recipient,
          responseCode: reply.code,
          enhancedCode: reply.enhancedCode,
          response: reply.response,
        })
      }
    }
    if (delivered.length === 0) {
      throw new CommandError('EMESSAGE', 'Message refused for every recipient', {
        command: 'DATA',
        rejected,
      })
    }
    return { accepted: delivered, rejected, response }
  }

  return {
    secure: tls,
    extensions,
    send(mail, options = {}) {
      return enqueue(async () => {
        sending = false
        try {
          if (session.closed) {
            throw new CommandError('ECONNECTION', 'Connection is closed', { command: 'MAIL FROM' })
          }
          return await guard(session, options.signal, () => transaction(mail))
        } catch (error) {
          if (!sending && mail.message instanceof ReadableStream) {
            mail.message.cancel(error).catch(() => {})
          }
          throw error
        }
      })
    },
    close(options = {}) {
      return enqueue(async () => {
        if (session.closed) return
        try {
          await guard(session, options.signal, async () => {
            await session.write('QUIT\r\n', 'QUIT')
            await session.read('QUIT')
          })
        } catch {}
        session.destroy()
      })
    },
  }
}

/**
 * Connects, sends one message and closes the connection.
 *
 * @example
 * ```ts
 * import * as Smtp from '@portable/smtp'
 * import { connect } from 'cloudflare:sockets'
 *
 * const result = await Smtp.send(
 *   { from: 'me@example.com', to: 'you@example.com', message: 'Subject: Hi\r\n\r\nHello' },
 *   { connect, host: 'smtp.example.com', auth: { user: 'me@example.com', pass: env.SMTP_PASSWORD } },
 * )
 * ```
 */
export async function send(mail: Mail, options: connect.Options): Promise<Result> {
  let client: Client
  try {
    client = await connect(options)
  } catch (error) {
    if (mail.message instanceof ReadableStream) mail.message.cancel(error).catch(() => {})
    throw error
  }
  try {
    return await client.send(mail, { signal: options.signal })
  } finally {
    await client.close({ signal: options.signal })
  }
}
