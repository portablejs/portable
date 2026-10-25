// The Node adapter's conformance tests. They need node:net servers, so they run in Node, Bun, and
// Deno, but not in browsers: the file name ends in `.test.ts`, which the browser project skips, and
// contains `conformance`, which `pnpm test:bun` and `pnpm test:deno` select.
import { byteForms, rejectedByteForms, toByteForm } from '@portable/fuzz';
import type * as Sockets from '@portable/sockets';
import { connect as defaultConnect, create } from '@portable/sockets/node';
import * as Streams from '@portable/streams';
import { afterEach, describe, expect, test } from 'vite-plus/test';
import {
  ca,
  closedPort,
  echo,
  listen,
  listenStartTls,
  listenTls,
  received,
  type Handler,
  type Server,
} from './servers.js';

const connect = create({ ca });
const encoder = new TextEncoder();
const decoder = new TextDecoder();
const plain = { secureTransport: 'off', allowHalfOpen: false } satisfies Sockets.Options;
const halfOpen = { secureTransport: 'off', allowHalfOpen: true } satisfies Sockets.Options;

const servers: Server[] = [];
afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.close()));
});

async function start<server extends Server>(
  listener: (handler: Handler) => Promise<server>,
  handler: Handler,
): Promise<server> {
  const server = await listener(handler);
  servers.push(server);
  return server;
}

const local = (port: number) => ({ hostname: '127.0.0.1', port });

async function send(socket: Sockets.Socket, text: string): Promise<void> {
  const writer = socket.writable.getWriter();
  await writer.write(encoder.encode(text));
  writer.releaseLock();
}

/** Reads until the received text ends with `suffix`, and releases the reader. */
async function readUntil(socket: Sockets.Socket, suffix: string): Promise<string> {
  const reader = socket.readable.getReader();
  let text = '';
  while (!text.endsWith(suffix)) {
    const { value, done } = await reader.read();
    if (done) {
      break;
    }
    text += decoder.decode(value, { stream: true });
  }
  reader.releaseLock();
  return text;
}

/** Reads the socket to its end, and records the order in which its promises and readable settle. */
function settled(socket: Sockets.Socket): Promise<string[]> {
  const events: string[] = [];
  const track = (name: string, promise: Promise<unknown>) =>
    promise.then(
      () => events.push(`${name} resolved`),
      () => events.push(`${name} rejected`),
    );
  const reader = socket.readable.getReader();
  const drain = (): Promise<void> =>
    reader.read().then(
      ({ done }) => (done ? undefined : drain()),
      () => undefined,
    );
  void drain();
  return Promise.all([
    track('opened', socket.opened),
    track('readable', reader.closed),
    track('closed', socket.closed),
  ]).then(() => events);
}

describe('connect', () => {
  test('opens a TCP connection and resolves opened with the addresses', async () => {
    const server = await start(listen, echo);
    const socket = connect(local(server.port), plain);
    const info = await socket.opened;
    expect(info.remoteAddress).toBe(`127.0.0.1:${server.port}`);
    expect(info.localAddress).toMatch(/^127\.0\.0\.1:\d+$/);
    expect(socket.upgraded).toBe(false);
    await socket.close();
  });

  test('sends and receives bytes, and resolves closed after both sides end', async () => {
    const server = await start(listen, echo);
    const socket = connect(local(server.port), plain);
    const writer = socket.writable.getWriter();
    await writer.write(encoder.encode('hello '));
    await writer.write(encoder.encode('world'));
    await writer.close();
    expect(decoder.decode(await Streams.toBytes(socket.readable))).toBe('hello world');
    await expect(socket.closed).resolves.toBeUndefined();
  });

  test('reads plain Uint8Array chunks, not Buffers', async () => {
    const server = await start(listen, (socket) => socket.end('hi'));
    const socket = connect(local(server.port), plain);
    const chunks = await Streams.toArray(socket.readable);
    expect(chunks.length).toBeGreaterThan(0);
    for (const chunk of chunks) {
      expect(Object.getPrototypeOf(chunk)).toBe(Uint8Array.prototype);
    }
  });

  test('carries 4 MB unchanged in both directions', async () => {
    const server = await start(listen, echo);
    const socket = connect(local(server.port), plain);
    const data = new Uint8Array(4 * 1024 * 1024);
    for (let i = 0; i < data.length; i++) {
      data[i] = (i * 31) % 251;
    }
    const writer = socket.writable.getWriter();
    const writing = (async () => {
      for (let offset = 0; offset < data.length; offset += 100_000) {
        await writer.write(data.subarray(offset, offset + 100_000));
      }
      await writer.close();
    })();
    const echoed = await Streams.toBytes(socket.readable);
    await writing;
    expect(echoed.length).toBe(data.length);
    expect(echoed).toEqual(data);
  });

  test('writes each byte form', async () => {
    const server = await start(listen, echo);
    const socket = connect(local(server.port), plain);
    const writer = socket.writable.getWriter();
    for (const form of byteForms) {
      await writer.write(toByteForm(encoder.encode(`${form};`), form));
    }
    await writer.close();
    expect(decoder.decode(await Streams.toBytes(socket.readable))).toBe(
      byteForms.map((form) => `${form};`).join(''),
    );
  });

  test.each(Object.entries(rejectedByteForms))('rejects a write of %s', async (_, value) => {
    const server = await start(listen, echo);
    const socket = connect(local(server.port), plain);
    const writer = socket.writable.getWriter();
    await expect(writer.write(value as Uint8Array)).rejects.toThrow(TypeError);
    await socket.close();
  });

  test('throws for an invalid address or option', () => {
    const run =
      (address: unknown, options: unknown = plain) =>
      () =>
        connect(address as Sockets.Address, options as Sockets.Options);
    expect(run({ hostname: '', port: 80 })).toThrow(TypeError);
    expect(run({ hostname: 'localhost', port: '80' })).toThrow(TypeError);
    expect(run({ hostname: 'localhost', port: 70000 })).toThrow(RangeError);
    expect(run({ hostname: 'localhost', port: 1.5 })).toThrow(RangeError);
    expect(run('localhost:80')).toThrow(TypeError);
    expect(run(local(80), { ...plain, secureTransport: 'yes' })).toThrow(RangeError);
    expect(run(local(80), { secureTransport: 'off' })).toThrow(TypeError);
  });
});

describe('half-close', () => {
  test('closing the writable ends this side, and the peer can still reply', async () => {
    const server = await start(listen, (socket) => {
      void received(socket).then((bytes) => socket.end(`got ${decoder.decode(bytes)}`));
    });
    const socket = connect(local(server.port), plain);
    await send(socket, 'ping');
    await socket.writable.close();
    expect(decoder.decode(await Streams.toBytes(socket.readable))).toBe('got ping');
    await socket.closed;
  });

  test('with allowHalfOpen, the writable stays open after the peer ends its side', async () => {
    let after!: Promise<Uint8Array>;
    const server = await start(listen, (socket) => {
      after = received(socket);
      socket.end('bye');
    });
    const socket = connect(local(server.port), halfOpen);
    expect(decoder.decode(await Streams.toBytes(socket.readable))).toBe('bye');
    await send(socket, 'still here');
    await socket.writable.close();
    expect(decoder.decode(await after)).toBe('still here');
    await expect(socket.closed).resolves.toBeUndefined();
  });

  test('without allowHalfOpen, the writable closes when the peer ends its side', async () => {
    const server = await start(listen, (socket) => socket.end('bye'));
    const socket = connect(local(server.port), plain);
    expect(decoder.decode(await Streams.toBytes(socket.readable))).toBe('bye');
    await expect(send(socket, 'too late')).rejects.toThrow(TypeError);
    await expect(socket.closed).resolves.toBeUndefined();
  });

  test('cancelling the readable leaves the writable open and closed pending', async () => {
    let got!: Promise<Uint8Array>;
    const server = await start(listen, (socket) => {
      got = received(socket);
      socket.write('ignored');
    });
    const socket = connect(local(server.port), plain);
    let isClosed = false;
    void socket.closed.then(() => {
      isClosed = true;
    });
    await socket.opened;
    await socket.readable.cancel();
    await send(socket, 'after cancel');
    await socket.writable.close();
    expect(decoder.decode(await got)).toBe('after cancel');
    expect(isClosed).toBe(false);
    await socket.close();
  });
});

describe('errors and close', () => {
  test('a refused connection rejects opened, errors the streams, then rejects closed', async () => {
    const socket = connect(local(await closedPort()), plain);
    const order = settled(socket);
    const error = await socket.opened.then(
      () => undefined,
      (reason: unknown) => reason,
    );
    expect(error).toMatchObject({ code: 'ECONNREFUSED' });
    await expect(socket.closed).rejects.toBe(error);
    await expect(socket.writable.getWriter().write(new Uint8Array(1))).rejects.toBe(error);
    expect(await order).toEqual(['opened rejected', 'readable rejected', 'closed rejected']);
  });

  test('a refused connection with nothing awaiting it causes no unhandled rejection', async () => {
    const socket = connect(local(await closedPort()), plain);
    await new Promise((resolve) => setTimeout(resolve, 100));
    await expect(socket.opened).rejects.toMatchObject({ code: 'ECONNREFUSED' });
  });

  test('a reset errors the readable, then rejects closed', async () => {
    const server = await start(listen, (socket) => {
      socket.write('partial');
      socket.once('data', () => socket.resetAndDestroy());
    });
    const socket = connect(local(server.port), plain);
    const order = settled(socket);
    await socket.opened;
    await send(socket, 'go');
    await expect(socket.closed).rejects.toMatchObject({ code: 'ECONNRESET' });
    expect(await order).toEqual(['opened resolved', 'readable rejected', 'closed rejected']);
  });

  test('a clean end from the peer closes the readable, then resolves closed', async () => {
    const server = await start(listen, (socket) => socket.end('bye'));
    const socket = connect(local(server.port), plain);
    expect(await settled(socket)).toEqual([
      'opened resolved',
      'readable resolved',
      'closed resolved',
    ]);
  });

  test('close() closes both sides even if the peer never ends its side', async () => {
    let peer!: Promise<unknown>;
    const server = await start(listen, (socket) => {
      peer = new Promise((resolve) => socket.once('end', resolve));
    });
    const socket = connect(local(server.port), plain);
    await socket.opened;
    const writer = socket.writable.getWriter();
    const reader = socket.readable.getReader();
    await expect(socket.close()).resolves.toBeUndefined();
    await expect(reader.read()).resolves.toEqual({ done: true, value: undefined });
    await expect(writer.write(new Uint8Array(1))).rejects.toThrow(TypeError);
    await peer;
  });

  test('close() returns the closed promise', async () => {
    const server = await start(listen, echo);
    const socket = connect(local(server.port), plain);
    await socket.opened;
    const closing = socket.close();
    await closing;
    await expect(socket.closed).resolves.toBeUndefined();
  });

  test('close() before the connection opens rejects opened and resolves closed', async () => {
    const server = await start(listen, echo);
    const socket = connect(local(server.port), plain);
    await expect(socket.close()).resolves.toBeUndefined();
    await expect(socket.opened).rejects.toThrow(TypeError);
  });

  test('Symbol.asyncDispose closes the socket', async () => {
    const server = await start(listen, echo);
    const socket = connect(local(server.port), plain);
    await socket.opened;
    await socket[Symbol.asyncDispose]();
    await expect(socket.closed).resolves.toBeUndefined();
  });
});

describe('TLS', () => {
  const secure = { secureTransport: 'on', allowHalfOpen: false } satisfies Sockets.Options;

  test('opens a TLS connection that verifies against ca', async () => {
    const server = await start(listenTls, echo);
    const socket = connect({ hostname: 'localhost', port: server.port }, secure);
    await socket.opened;
    await send(socket, 'secret');
    await socket.writable.close();
    expect(decoder.decode(await Streams.toBytes(socket.readable))).toBe('secret');
    await socket.closed;
  });

  test('rejects opened for a certificate that does not verify', async () => {
    const server = await start(listenTls, echo);
    const socket = defaultConnect({ hostname: 'localhost', port: server.port }, secure);
    await expect(socket.opened).rejects.toMatchObject({ code: 'DEPTH_ZERO_SELF_SIGNED_CERT' });
    await expect(socket.closed).rejects.toMatchObject({ code: 'DEPTH_ZERO_SELF_SIGNED_CERT' });
  });

  test('rejects opened for a certificate issued to another name', async () => {
    const server = await start(listenTls, echo);
    const socket = connect(local(server.port), secure);
    await expect(socket.opened).rejects.toMatchObject({ code: 'ERR_TLS_CERT_ALTNAME_INVALID' });
  });

  test('accepts any certificate with rejectUnauthorized: false', async () => {
    const server = await start(listenTls, echo);
    const socket = create({ rejectUnauthorized: false })(
      { hostname: 'localhost', port: server.port },
      secure,
    );
    await expect(socket.opened).resolves.toMatchObject({
      remoteAddress: `127.0.0.1:${server.port}`,
    });
    await socket.close();
  });

  test('without allowHalfOpen, closes a TLS connection when the peer ends its side', async () => {
    const server = await start(listenTls, (socket) => socket.end('bye'));
    const socket = connect({ hostname: 'localhost', port: server.port }, secure);
    expect(decoder.decode(await Streams.toBytes(socket.readable))).toBe('bye');
    await expect(send(socket, 'too late')).rejects.toThrow(TypeError);
    await expect(socket.closed).resolves.toBeUndefined();
  });

  test('closing the writable during the handshake still ends this side', async () => {
    const server = await start(listenTls, echo);
    const socket = connect({ hostname: 'localhost', port: server.port }, secure);
    await socket.writable.close();
    expect(await Streams.toBytes(socket.readable)).toEqual(new Uint8Array());
    await socket.closed;
  });

  test('half-closes a TLS connection with allowHalfOpen', async () => {
    let after!: Promise<Uint8Array>;
    const server = await start(listenTls, (socket) => {
      after = received(socket);
      socket.end('bye');
    });
    const socket = connect(
      { hostname: 'localhost', port: server.port },
      { ...secure, allowHalfOpen: true },
    );
    expect(decoder.decode(await Streams.toBytes(socket.readable))).toBe('bye');
    await send(socket, 'still here');
    await socket.writable.close();
    expect(decoder.decode(await after)).toBe('still here');
  });
});

describe('startTls', () => {
  const starttls = { secureTransport: 'starttls', allowHalfOpen: false } satisfies Sockets.Options;

  test('upgrades an open connection, and the old socket stops working', async () => {
    const server = await start(listenStartTls, echo);
    const socket = connect({ hostname: 'localhost', port: server.port }, starttls);
    await socket.opened;
    await send(socket, 'STARTTLS\r\n');
    expect(await readUntil(socket, '\r\n')).toBe('OK\r\n');

    const secure = socket.startTls();
    expect(socket.upgraded).toBe(true);
    expect(secure.upgraded).toBe(false);
    await expect(socket.closed).resolves.toBeUndefined();
    await expect(send(socket, 'plaintext')).rejects.toThrow(TypeError);
    await expect(socket.readable.getReader().read()).resolves.toMatchObject({ done: true });

    await secure.opened;
    await send(secure, 'over TLS');
    await secure.writable.close();
    expect(decoder.decode(await Streams.toBytes(secure.readable))).toBe('over TLS');
    await secure.closed;
    expect(server.servernames).toEqual(['localhost']);
  });

  test('verifies the certificate of the upgraded connection', async () => {
    const server = await start(listenStartTls, echo);
    const socket = defaultConnect({ hostname: 'localhost', port: server.port }, starttls);
    await send(socket, 'STARTTLS\r\n');
    await readUntil(socket, '\r\n');
    const secure = socket.startTls();
    await expect(secure.opened).rejects.toMatchObject({ code: 'DEPTH_ZERO_SELF_SIGNED_CERT' });
  });

  test('throws unless the socket was opened with secureTransport: starttls', async () => {
    const server = await start(listen, echo);
    const socket = connect(local(server.port), plain);
    expect(() => socket.startTls()).toThrow(TypeError);
    await socket.close();
  });

  test('throws when called twice, or on the upgraded socket', async () => {
    const server = await start(listenStartTls, echo);
    const socket = connect({ hostname: 'localhost', port: server.port }, starttls);
    await send(socket, 'STARTTLS\r\n');
    await readUntil(socket, '\r\n');
    const secure = socket.startTls();
    expect(() => socket.startTls()).toThrow(TypeError);
    expect(() => secure.startTls()).toThrow(TypeError);
    await secure.close();
  });
});
