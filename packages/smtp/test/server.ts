import { SMTPServer, type Options, type Session } from 'smtp-server'

export type Received = {
  from: string
  to: string[]
  data: Uint8Array
  envelope: Session['envelope']
  secure: boolean
}

export type TestServer = {
  port: number
  received: Received[]
  server: SMTPServer
  close(): Promise<void>
}

/**
 * Starts nodemailer's smtp-server on a free port. It accepts testuser/testpass, senders at
 * valid.sender and recipients at valid.recipient, and records every message. `options` overrides
 * these defaults.
 */
export function startServer(options: Options = {}): Promise<TestServer> {
  const received: Received[] = []
  const server = new SMTPServer({
    logger: false,
    disabledCommands: ['STARTTLS'],
    authMethods: ['PLAIN', 'LOGIN'],
    onAuth(auth, _session, done) {
      if (auth.username !== 'testuser' || auth.password !== 'testpass') {
        return done(new Error('Invalid username or password'))
      }
      done(null, { user: 'testuser' })
    },
    onMailFrom(address, _session, done) {
      if (!address.address.endsWith('@valid.sender')) {
        return done(new Error('Only user@valid.sender is allowed to send mail'))
      }
      done()
    },
    onRcptTo(address, _session, done) {
      if (!address.address.endsWith('@valid.recipient')) {
        return done(new Error('Only user@valid.recipient is allowed to receive mail'))
      }
      done()
    },
    onData(stream, session, done) {
      const chunks: Uint8Array[] = []
      stream.on('data', (chunk: Uint8Array) => chunks.push(chunk))
      stream.on('end', () => {
        const data = new Uint8Array(chunks.reduce((sum, chunk) => sum + chunk.length, 0))
        let offset = 0
        for (const chunk of chunks) {
          data.set(chunk, offset)
          offset += chunk.length
        }
        const { mailFrom, rcptTo } = session.envelope
        received.push({
          from: mailFrom ? mailFrom.address : '',
          to: rcptTo.map((rcpt) => rcpt.address),
          data,
          envelope: JSON.parse(JSON.stringify(session.envelope)),
          secure: session.secure,
        })
        done()
      })
    },
    ...options,
  })
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const address = server.server.address()
      resolve({
        port: typeof address === 'object' && address ? address.port : 0,
        received,
        server,
        close: () =>
          new Promise((done) => {
            for (const connection of server.connections) connection._socket.destroy()
            server.close(done)
          }),
      })
    })
  })
}
