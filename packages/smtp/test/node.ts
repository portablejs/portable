// oxlint-disable no-restricted-imports, no-restricted-globals -- Node-only helpers for the smtp-server, oracle and benchmark tests.
import net from 'node:net';
import { create } from '@portable/sockets/node';
import type * as Smtp from '@portable/smtp';

export const connect: Smtp.Connect = create({ rejectUnauthorized: false });

export type Capture = { port: number; data: Uint8Array[]; close(): Promise<void> };

/**
 * A minimal SMTP server that answers at once and records the bytes of each DATA section as they
 * arrive on the wire, terminator included. With `record: false` it keeps nothing, for benchmarks.
 */
export function startCapture(record = true): Promise<Capture> {
  const data: Uint8Array[] = [];
  const sockets = new Set<net.Socket>();
  const server = net.createServer((socket) => {
    sockets.add(socket);
    socket.setNoDelay(true);
    socket.on('error', () => {});
    socket.write('220 capture ESMTP\r\n');
    let buffer: Buffer = Buffer.alloc(0);
    let inData = false;
    let searched = 0;
    socket.on('data', (chunk: Buffer) => {
      buffer = buffer.length === 0 ? chunk : Buffer.concat([buffer, chunk]);
      for (;;) {
        if (inData) {
          const end =
            buffer.subarray(0, 3).toString() === '.\r\n'
              ? 0
              : buffer.indexOf('\r\n.\r\n', Math.max(0, searched - 4)) + 2;
          if (end === 1) {
            searched = buffer.length;
            return;
          }
          searched = 0;
          if (record) {
            data.push(new Uint8Array(buffer.subarray(0, end + 3)));
          }
          buffer = buffer.subarray(end + 3);
          inData = false;
          socket.write('250 2.0.0 OK\r\n');
          continue;
        }
        const index = buffer.indexOf('\r\n');
        if (index === -1) {
          return;
        }
        const line = buffer.subarray(0, index).toString();
        buffer = buffer.subarray(index + 2);
        const verb = line.split(' ')[0]!.toUpperCase();
        if (verb === 'EHLO') {
          socket.write('250-capture\r\n250-PIPELINING\r\n250 8BITMIME\r\n');
        } else if (verb === 'DATA') {
          socket.write('354 Go ahead\r\n');
          inData = true;
        } else if (verb === 'QUIT') {
          socket.end('221 Bye\r\n');
        } else {
          socket.write('250 OK\r\n');
        }
      }
    });
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      resolve({
        port: (server.address() as net.AddressInfo).port,
        data,
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
