import {
  type RawData,
  type ServerOptions,
  type WebSocket as ServerSocket,
  WebSocketServer,
} from 'ws'

/** A `ws` server on a free local port. */
export async function listen(
  onConnection: (socket: ServerSocket) => void = echo,
  options: ServerOptions = {},
): Promise<{ server: WebSocketServer; url: string; port: number; close: () => Promise<void> }> {
  const server = new WebSocketServer({ port: 0, host: '127.0.0.1', ...options })
  await new Promise<void>((resolve, reject) => {
    server.once('listening', resolve)
    server.once('error', reject)
  })
  server.on('connection', onConnection)
  const address = server.address()
  const port = typeof address === 'object' && address ? address.port : 0
  const url = `ws://127.0.0.1:${port}`
  const close = () =>
    new Promise<void>((resolve) => {
      for (const client of server.clients) client.terminate()
      server.close(() => resolve())
    })
  return { server, url, port, close }
}

export function echo(socket: ServerSocket): void {
  socket.on('message', (data, isBinary) => socket.send(data, { binary: isBinary }))
}

const decoder = new TextDecoder()

export const text = (data: RawData): string =>
  Array.isArray(data) ? data.map((part) => decoder.decode(part)).join('') : decoder.decode(data)
