// oxlint-disable no-restricted-imports, no-restricted-globals -- Node-only helpers for the smtp-server, oracle and benchmark tests.
import net from 'node:net'
import tls from 'node:tls'
import type * as Smtp from '@portable/smtp'

function settle(socket: net.Socket, event: string): Promise<void> {
  return new Promise((resolve, reject) => {
    socket.once(event, () => resolve())
    socket.once('error', reject)
  })
}

function wrap(socket: net.Socket, opened: Promise<void>, starttlsHost?: string): Smtp.Socket {
  socket.setNoDelay(true)
  let attached = true
  opened.catch(() => {})
  const closed = new Promise<void>((resolve) => socket.once('close', () => resolve()))

  const readable = new ReadableStream<Uint8Array>({
    start(controller) {
      socket.on('data', (chunk: Uint8Array) => {
        if (!attached) return
        controller.enqueue(new Uint8Array(chunk))
        if ((controller.desiredSize ?? 0) <= 0) socket.pause()
      })
      socket.once('end', () => {
        if (attached) controller.close()
      })
      socket.on('error', (error) => {
        if (attached) controller.error(error)
      })
      socket.once('close', () => {
        try {
          if (attached) controller.close()
        } catch {}
      })
    },
    pull() {
      socket.resume()
    },
    cancel() {
      socket.destroy()
    },
  })

  const writable = new WritableStream<Uint8Array>({
    write(chunk) {
      return new Promise((resolve, reject) => {
        if (socket.destroyed) return reject(new Error('Socket is closed'))
        const done = (error?: Error | null) => {
          socket.off('drain', done)
          socket.off('close', done)
          if (error) reject(error)
          else if (socket.destroyed) reject(new Error('Socket is closed'))
          else resolve()
        }
        if (socket.write(chunk, (error) => error && done(error))) return resolve()
        socket.once('drain', done)
        socket.once('close', done)
      })
    },
    close() {
      socket.end()
    },
    abort() {
      socket.destroy()
    },
  })

  return {
    readable,
    writable,
    opened,
    closed,
    close() {
      socket.destroy()
      return closed
    },
    startTls() {
      if (starttlsHost === undefined) throw new Error('Socket was not opened for STARTTLS')
      attached = false
      socket.removeAllListeners('data')
      const secure = tls.connect({ socket, servername: starttlsHost, rejectUnauthorized: false })
      return wrap(secure, settle(secure, 'secureConnect'))
    },
  }
}

/** A `Smtp.Connect` for Node built on `node:net` and `node:tls`. It accepts self-signed certificates, for tests only. */
export const connect: Smtp.Connect = ({ hostname, port }, { secureTransport }) => {
  if (secureTransport === 'on') {
    const socket = tls.connect({
      host: hostname,
      port,
      servername: hostname,
      rejectUnauthorized: false,
    })
    return wrap(socket, settle(socket, 'secureConnect'))
  }
  const socket = net.connect({ host: hostname, port })
  return wrap(
    socket,
    settle(socket, 'connect'),
    secureTransport === 'starttls' ? hostname : undefined,
  )
}

export type Capture = { port: number; data: Uint8Array[]; close(): Promise<void> }

/**
 * A minimal SMTP server that answers at once and records the bytes of each DATA section as they
 * arrive on the wire, terminator included. With `record: false` it keeps nothing, for benchmarks.
 */
export function startCapture(record = true): Promise<Capture> {
  const data: Uint8Array[] = []
  const sockets = new Set<net.Socket>()
  const server = net.createServer((socket) => {
    sockets.add(socket)
    socket.setNoDelay(true)
    socket.on('error', () => {})
    socket.write('220 capture ESMTP\r\n')
    let buffer: Buffer = Buffer.alloc(0)
    let inData = false
    let searched = 0
    socket.on('data', (chunk: Buffer) => {
      buffer = buffer.length === 0 ? chunk : Buffer.concat([buffer, chunk])
      for (;;) {
        if (inData) {
          const end =
            buffer.subarray(0, 3).toString() === '.\r\n'
              ? 0
              : buffer.indexOf('\r\n.\r\n', Math.max(0, searched - 4)) + 2
          if (end === 1) {
            searched = buffer.length
            return
          }
          searched = 0
          if (record) data.push(new Uint8Array(buffer.subarray(0, end + 3)))
          buffer = buffer.subarray(end + 3)
          inData = false
          socket.write('250 2.0.0 OK\r\n')
          continue
        }
        const index = buffer.indexOf('\r\n')
        if (index === -1) return
        const line = buffer.subarray(0, index).toString()
        buffer = buffer.subarray(index + 2)
        const verb = line.split(' ')[0]!.toUpperCase()
        if (verb === 'EHLO') socket.write('250-capture\r\n250-PIPELINING\r\n250 8BITMIME\r\n')
        else if (verb === 'DATA') {
          socket.write('354 Go ahead\r\n')
          inData = true
        } else if (verb === 'QUIT') socket.end('221 Bye\r\n')
        else socket.write('250 OK\r\n')
      }
    })
  })
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      resolve({
        port: (server.address() as net.AddressInfo).port,
        data,
        close: () =>
          new Promise((done) => {
            for (const socket of sockets) socket.destroy()
            server.close(() => done())
          }),
      })
    })
  })
}
