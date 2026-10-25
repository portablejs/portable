import { connect as arrowood } from '@arrowood.dev/socket';
import type * as Sockets from '@portable/sockets';
import { create } from '@portable/sockets/node';
import * as Streams from '@portable/streams';
import { afterAll, beforeAll, describe, expect, test } from 'vite-plus/test';
import { ca, echo, listen, listenStartTls, type Server } from './servers.js';

const connect = create({ ca });
const encoder = new TextEncoder();
const decoder = new TextDecoder();
let server: Server;

beforeAll(async () => {
  server = await listen(echo);
});

afterAll(async () => {
  await server.close();
});

async function roundTrip(socket: Sockets.Socket, chunks: readonly Uint8Array[]) {
  const writer = socket.writable.getWriter();
  const writing = (async () => {
    for (const chunk of chunks) {
      await writer.write(chunk);
    }
    await writer.close();
  })();
  const echoed = await Streams.toBytes(socket.readable);
  await writing;
  return echoed;
}

describe('the same bytes as @arrowood.dev/socket', () => {
  const inputs = {
    empty: [],
    'one byte': [new Uint8Array([0])],
    'text in three writes': ['a', 'bc', 'def'].map((text) => encoder.encode(text)),
    '1 MB in 64 KB writes': Array.from({ length: 16 }, (_, i) => new Uint8Array(64 * 1024).fill(i)),
  } satisfies Record<string, Uint8Array[]>;

  test.each(Object.entries(inputs))('%s', async (_, chunks) => {
    const address = { hostname: '127.0.0.1', port: server.port };
    const ours = await roundTrip(
      connect(address, { secureTransport: 'off', allowHalfOpen: true }),
      chunks,
    );
    const theirs = await roundTrip(
      arrowood(address, {
        secureTransport: 'off',
        allowHalfOpen: true,
      }) as unknown as Sockets.Socket,
      chunks,
    );
    expect(ours).toEqual(new Uint8Array(theirs));
  });
});

describe('known upstream issues', () => {
  test('upstream close() ends only this side, and ours closes both', async () => {
    const late = await listen((socket) => {
      socket.once('end', () => setTimeout(() => socket.end('after close'), 20));
    });
    const address = { hostname: '127.0.0.1', port: late.port };
    try {
      const ours = connect(address, { secureTransport: 'off', allowHalfOpen: true });
      await ours.opened;
      await ours.close();
      expect(await Streams.toBytes(ours.readable)).toEqual(new Uint8Array());

      const theirs = arrowood(address, { secureTransport: 'off', allowHalfOpen: true });
      await theirs.close();
      expect(
        decoder.decode(await Streams.toBytes(theirs.readable as ReadableStream<Uint8Array>)),
      ).toBe('after close');
    } finally {
      await late.close();
    }
  });

  test('upstream startTls() accepts a certificate that does not verify, and ours rejects it', async () => {
    const starttls = await listenStartTls(echo);
    const address = { hostname: 'localhost', port: starttls.port };
    const upgrade = async (socket: Sockets.Socket) => {
      const writer = socket.writable.getWriter();
      await writer.write(encoder.encode('STARTTLS\r\n'));
      writer.releaseLock();
      const reader = socket.readable.getReader();
      expect(decoder.decode((await reader.read()).value)).toBe('OK\r\n');
      reader.releaseLock();
      return socket.startTls();
    };
    try {
      const { connect: defaultConnect } = await import('@portable/sockets/node');
      const ours = await upgrade(
        defaultConnect(address, { secureTransport: 'starttls', allowHalfOpen: false }),
      );
      await expect(ours.opened).rejects.toMatchObject({ code: 'DEPTH_ZERO_SELF_SIGNED_CERT' });

      const theirs = await upgrade(
        arrowood(address, { secureTransport: 'starttls' }) as unknown as Sockets.Socket,
      );
      const echoed = await roundTrip(theirs, [encoder.encode('unverified')]);
      expect(decoder.decode(echoed)).toBe('unverified');
    } finally {
      await starttls.close();
    }
  });
});
