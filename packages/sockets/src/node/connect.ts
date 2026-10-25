/// <reference types="node" />
import net from 'node:net';
import tls from 'node:tls';
import { assertUint8Array } from '@portable/bytes/internal';
import { type AsyncDisposeMethod, withAsyncDispose } from '@portable/errors/internal';
import type * as Sockets from '../Socket.js';

/**
 * A `Sockets.Socket` that also has `[Symbol.asyncDispose]()` where the runtime has the symbol, so
 * `await using socket = connect(address, options)` closes it at the end of the scope.
 */
export type Socket = Omit<Sockets.Socket, 'startTls'> &
  AsyncDisposeMethod & {
    /**
     * Starts TLS on a socket opened with `secureTransport: 'starttls'` and returns the encrypted
     * socket. After the call, this socket's readable closes, its writes reject and its `closed`
     * resolves.
     */
    startTls(): Socket;
  };

export declare namespace create {
  type Options = {
    /** Certificates to trust instead of Node's bundled root certificates, in PEM. */
    ca?: string | readonly string[] | undefined;
    /**
     * Whether to reject a server certificate that doesn't verify. Defaults to `true`. Turn it off
     * only to test against a self-signed certificate, and pass `ca` instead where you can.
     */
    rejectUnauthorized?: boolean | undefined;
  };
  type ReturnType = (address: Sockets.Address, options: Sockets.Options) => Socket;
}

const secureTransports = new Set(['off', 'on', 'starttls']);

/**
 * Returns a `connect` function with the shape of `connect` from `cloudflare:sockets`, built on
 * `node:net` and `node:tls`, that verifies TLS certificates with the given options.
 *
 * @example
 * ```ts
 * import { create } from '@portable/sockets/node';
 *
 * const connect = create({ ca: await readFile('ca.pem', 'utf8') });
 * const socket = connect({ hostname: 'localhost', port: 8443 }, { secureTransport: 'on', allowHalfOpen: false });
 * await socket.opened;
 * ```
 */
export function create(options: create.Options = {}): create.ReturnType {
  const { ca, rejectUnauthorized = true } = options;
  const verify = {
    rejectUnauthorized,
    ...(ca !== undefined && { ca: typeof ca === 'string' ? ca : [...ca] }),
  } satisfies tls.ConnectionOptions;

  return (address, socketOptions) => {
    const { hostname, port } = assertAddress(address);
    const { secureTransport, allowHalfOpen } = socketOptions;
    if (!secureTransports.has(secureTransport)) {
      throw new RangeError(`Unknown secureTransport: ${String(secureTransport)}`);
    }
    if (typeof allowHalfOpen !== 'boolean') {
      throw new TypeError('`allowHalfOpen` must be a boolean');
    }
    const servername = net.isIP(hostname) === 0 ? hostname : undefined;
    const tlsOptions = {
      ...verify,
      ...(servername !== undefined && { servername }),
      allowHalfOpen,
    } satisfies tls.ConnectionOptions & net.SocketConstructorOpts;

    if (secureTransport === 'on') {
      const socket = tls.connect({ host: hostname, port, ...tlsOptions });
      return wrap(socket, 'secureConnect', allowHalfOpen, undefined);
    }
    const socket = net.connect({ host: hostname, port, allowHalfOpen });
    const upgrade =
      secureTransport === 'starttls'
        ? (plain: net.Socket) => tls.connect({ socket: plain, ...tlsOptions })
        : undefined;
    return wrap(socket, 'connect', allowHalfOpen, upgrade);
  };
}

/**
 * Opens a TCP connection with `node:net`, or a TLS connection with `node:tls`, in the shape of the
 * WinterTC Sockets API. Pass it wherever a package takes a `connect` option. Deno and Bun run it
 * through their `node:net` and `node:tls`. It verifies certificates against Node's bundled root
 * certificates. Use `create` to trust other certificates.
 *
 * @example
 * ```ts
 * import * as Smtp from '@portable/smtp';
 * import { connect } from '@portable/sockets/node';
 *
 * await Smtp.send(mail, { connect, host: 'smtp.example.com', auth });
 * ```
 */
export const connect: create.ReturnType = create();

function assertAddress(address: Sockets.Address): Sockets.Address {
  if (typeof address !== 'object' || address === null) {
    throw new TypeError('`address` must be an object with `hostname` and `port`');
  }
  const { hostname, port } = address;
  if (typeof hostname !== 'string' || hostname === '') {
    throw new TypeError('`hostname` must be a non-empty string');
  }
  if (typeof port !== 'number') {
    throw new TypeError('`port` must be a number');
  }
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new RangeError(`\`port\` must be an integer from 0 to 65535, got ${port}`);
  }
  return { hostname, port };
}

function closedError(): TypeError {
  return new TypeError('The socket is closed');
}

function formatAddress(address: string | undefined, port: number | undefined): string | undefined {
  if (address === undefined || port === undefined) {
    return undefined;
  }
  return address.includes(':') ? `[${address}]:${port}` : `${address}:${port}`;
}

function deferred<value>() {
  let resolve!: (value: value) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<value>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  promise.catch(() => {});
  return { promise, resolve, reject };
}

function wrap(
  socket: net.Socket,
  ready: 'connect' | 'secureConnect',
  allowHalfOpen: boolean,
  upgrade: ((socket: net.Socket) => tls.TLSSocket) | undefined,
): Socket {
  socket.setNoDelay(true);
  const opened = deferred<Sockets.Info>();
  const closed = deferred<void>();
  let readable!: ReadableStreamDefaultController<Uint8Array>;
  let writable!: WritableStreamDefaultController;
  let reading = true;
  let writing = true;
  let attached = true;
  let upgraded = false;

  const endReadable = (error?: unknown) => {
    if (!reading) {
      return;
    }
    reading = false;
    if (error === undefined) {
      readable.close();
    } else {
      readable.error(error);
    }
  };
  const endWritable = (error: unknown) => {
    if (!writing) {
      return;
    }
    writing = false;
    writable.error(error);
  };

  const onReady = () => {
    opened.resolve({
      remoteAddress: formatAddress(socket.remoteAddress, socket.remotePort),
      localAddress: formatAddress(socket.localAddress, socket.localPort),
    });
  };
  const onData = (chunk: Uint8Array) => {
    if (!reading) {
      return;
    }
    readable.enqueue(new Uint8Array(chunk.buffer, chunk.byteOffset, chunk.byteLength));
    if ((readable.desiredSize ?? 0) <= 0) {
      socket.pause();
    }
  };
  const onEnd = () => {
    endReadable();
    if (!allowHalfOpen) {
      endWritable(closedError());
    }
  };
  const onError = (error: Error) => {
    opened.reject(error);
    endReadable(error);
    endWritable(error);
    closed.reject(error);
  };
  const onClose = () => {
    opened.reject(closedError());
    endReadable();
    endWritable(closedError());
    closed.resolve();
  };
  socket.once(ready, onReady);
  socket.on('data', onData);
  socket.once('end', onEnd);
  socket.on('error', onError);
  socket.once('close', onClose);

  const result = {
    readable: new ReadableStream<Uint8Array>(
      {
        start(controller) {
          readable = controller;
        },
        pull() {
          socket.resume();
        },
        cancel() {
          reading = false;
          socket.resume();
        },
      },
      { highWaterMark: 64 * 1024, size: (chunk) => chunk.byteLength },
    ),
    writable: new WritableStream<Uint8Array>({
      start(controller) {
        writable = controller;
      },
      write(chunk) {
        assertUint8Array(chunk);
        return new Promise<void>((resolve, reject) => {
          if (!attached || socket.destroyed) {
            reject(closedError());
            return;
          }
          // Deno's node:net fails an empty write with EPERM.
          if (chunk.byteLength === 0) {
            resolve();
            return;
          }
          if (socket.write(chunk)) {
            resolve();
            return;
          }
          const done = () => {
            socket.off('drain', done);
            socket.off('close', done);
            if (socket.destroyed) {
              reject(closedError());
            } else {
              resolve();
            }
          };
          socket.once('drain', done);
          socket.once('close', done);
        });
      },
      async close() {
        writing = false;
        // `node:tls` sends no close_notify or FIN for an `end()` called during the handshake, so the
        // connection would never end.
        await opened.promise;
        await new Promise<void>((resolve, reject) => {
          socket.end((error?: Error | null) => {
            if (error) {
              reject(error);
            } else {
              resolve();
            }
          });
        });
      },
      abort() {
        writing = false;
        socket.destroy();
      },
    }),
    opened: opened.promise,
    closed: closed.promise,
    get upgraded() {
      return upgraded;
    },
    close() {
      if (attached) {
        socket.destroy();
      }
      return closed.promise;
    },
    startTls(): Socket {
      if (upgrade === undefined) {
        throw new TypeError("startTls() needs a socket opened with secureTransport: 'starttls'");
      }
      if (upgraded) {
        throw new TypeError('startTls() was already called on this socket');
      }
      upgraded = true;
      attached = false;
      socket.pause();
      socket.off('data', onData);
      socket.off('end', onEnd);
      socket.off('error', onError);
      socket.off('close', onClose);
      endReadable();
      endWritable(closedError());
      closed.resolve();
      return wrap(upgrade(socket), 'secureConnect', allowHalfOpen, undefined);
    },
  };
  return withAsyncDispose(result, () => result.close().catch(() => {}));
}
