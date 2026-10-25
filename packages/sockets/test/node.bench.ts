import net from 'node:net';
import { connect as arrowood } from '@arrowood.dev/socket';
import type * as Sockets from '@portable/sockets';
import { connect } from '@portable/sockets/node';
import { afterAll, beforeAll, expect, test } from 'vite-plus/test';
import { echo, listen, type Server } from './servers.js';

let server: Server;
beforeAll(async () => {
  server = await listen(echo);
});
afterAll(async () => {
  await server.close();
});

const chunk = new Uint8Array(64 * 1024).fill(7);
const total = 16 * 1024 * 1024;
const options = { secureTransport: 'off', allowHalfOpen: true } satisfies Sockets.Options;

async function echoWeb(socket: Sockets.Socket): Promise<number> {
  const writer = socket.writable.getWriter();
  const writing = (async () => {
    for (let sent = 0; sent < total; sent += chunk.length) {
      await writer.write(chunk);
    }
    await writer.close();
  })();
  const reader = socket.readable.getReader();
  let received = 0;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) {
      break;
    }
    received += value.byteLength;
  }
  await writing;
  return received;
}

function echoNode(port: number): Promise<number> {
  return new Promise((resolve, reject) => {
    const socket = net.connect({ host: '127.0.0.1', port, allowHalfOpen: true });
    let received = 0;
    socket.on('data', (data: Buffer) => {
      received += data.byteLength;
    });
    socket.on('end', () => resolve(received));
    socket.on('error', reject);
    let sent = 0;
    const write = () => {
      while (sent < total) {
        sent += chunk.length;
        if (!socket.write(chunk)) {
          socket.once('drain', write);
          return;
        }
      }
      socket.end();
    };
    write();
  });
}

test('echoes 16 MB over TCP within 25% of @arrowood.dev/socket', async ({ bench }) => {
  const address = () => ({ hostname: '127.0.0.1', port: server.port });
  const result = await bench.compare(
    bench('@portable/sockets', async () => {
      expect(await echoWeb(connect(address(), options))).toBe(total);
    }),
    bench('@arrowood.dev/socket', async () => {
      expect(await echoWeb(arrowood(address(), options) as unknown as Sockets.Socket)).toBe(total);
    }),
    bench('node:net', async () => {
      expect(await echoNode(server.port)).toBe(total);
    }),
  );
  expect(result.get('@arrowood.dev/socket')).not.toBeFasterThan(result.get('@portable/sockets'), {
    delta: 0.25,
  });
});

test('opens and closes a connection within 25% of @arrowood.dev/socket', async ({ bench }) => {
  const address = () => ({ hostname: '127.0.0.1', port: server.port });
  const result = await bench.compare(
    bench('@portable/sockets', async () => {
      const socket = connect(address(), options);
      await socket.opened;
      await socket.close();
    }),
    bench('@arrowood.dev/socket', async () => {
      const socket = arrowood(address(), options);
      await new Promise<void>((resolve) => {
        (socket as unknown as { socket: net.Socket }).socket.once('connect', () => resolve());
      });
      await socket.close();
    }),
    bench('node:net', async () => {
      const socket = net.connect({ host: '127.0.0.1', port: server.port });
      await new Promise((resolve) => socket.once('connect', resolve));
      socket.destroy();
      await new Promise((resolve) => socket.once('close', resolve));
    }),
  );
  expect(result.get('@arrowood.dev/socket')).not.toBeFasterThan(result.get('@portable/sockets'), {
    delta: 0.25,
  });
});
