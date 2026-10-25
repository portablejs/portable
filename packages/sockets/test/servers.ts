// oxlint-disable no-restricted-imports, no-restricted-globals -- Node servers for the Node adapter's tests.
import { readFileSync } from 'node:fs';
import net from 'node:net';
import tls from 'node:tls';

export const ca: string = readFileSync(
  new URL('./fixtures/localhost.crt.pem.txt', import.meta.url),
  'utf8',
);
const key = readFileSync(new URL('./fixtures/localhost.key.pem.txt', import.meta.url), 'utf8');

export type Server = {
  port: number;
  /** The TCP socket of every connection the server accepted, in order. */
  sockets: net.Socket[];
  close(): Promise<void>;
};

export type Handler = (socket: net.Socket) => void;

/** Writes back every byte it receives, and ends its side when the client ends its side. */
export const echo: Handler = (socket) => {
  socket.pipe(socket);
};

function serve(server: net.Server, handler: Handler, event = 'connection'): Promise<Server> {
  const sockets: net.Socket[] = [];
  server.on('connection', (socket: net.Socket) => {
    sockets.push(socket);
    socket.on('error', () => {});
  });
  server.on(event, (socket: net.Socket) => {
    socket.on('error', () => {});
    handler(socket);
  });
  server.on('tlsClientError', () => {});
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      resolve({
        port: (server.address() as net.AddressInfo).port,
        sockets,
        close: () =>
          new Promise((done) => {
            for (const socket of sockets) {
              socket.destroy();
            }
            server.close(() => done());
          }),
      });
    });
  });
}

/** A TCP server on 127.0.0.1 that passes each connection to `handler`. */
export function listen(handler: Handler): Promise<Server> {
  return serve(net.createServer({ allowHalfOpen: true }), handler);
}

/** A TLS server on 127.0.0.1 with the certificate in `fixtures/`, which is valid only for `localhost`. */
export function listenTls(handler: Handler): Promise<Server> {
  return serve(
    tls.createServer({ key, cert: ca, allowHalfOpen: true }),
    handler,
    'secureConnection',
  );
}

/**
 * A TCP server that answers `STARTTLS\r\n` with `OK\r\n`, then starts TLS on the connection and
 * passes the TLS socket to `handler`. `servernames` records the SNI name of each handshake.
 */
export async function listenStartTls(
  handler: Handler,
): Promise<Server & { servernames: (string | false)[] }> {
  const servernames: (string | false)[] = [];
  const server = await listen((socket) => {
    socket.once('data', (chunk: Buffer) => {
      if (chunk.toString() !== 'STARTTLS\r\n') {
        socket.end('NO\r\n');
        return;
      }
      socket.pause();
      socket.write('OK\r\n');
      const secure = new tls.TLSSocket(socket, { isServer: true, key, cert: ca });
      secure.on('error', () => {});
      secure.once('secure', () => {
        servernames.push((secure as tls.TLSSocket & { servername: string | false }).servername);
        handler(secure);
      });
    });
  });
  return Object.assign(server, { servernames });
}

/** A port on 127.0.0.1 with nothing listening, so a connection to it is refused. */
export async function closedPort(): Promise<number> {
  const server = await listen(() => {});
  await server.close();
  return server.port;
}

/** Collects everything `socket` receives until the client ends its side. */
export function received(socket: net.Socket): Promise<Uint8Array> {
  const chunks: Buffer[] = [];
  socket.on('data', (chunk: Buffer) => chunks.push(chunk));
  return new Promise((resolve) => {
    socket.once('end', () => resolve(new Uint8Array(Buffer.concat(chunks))));
  });
}
