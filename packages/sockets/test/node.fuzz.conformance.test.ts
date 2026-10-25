// Needs node:net servers, so it runs in Node, Bun, and Deno but not in browsers (see
// node.conformance.test.ts).
import { byteForm, cuts, fc, fuzz, split, toByteForm } from '@portable/fuzz';
import type * as Sockets from '@portable/sockets';
import { create } from '@portable/sockets/node';
import * as Streams from '@portable/streams';
import { afterAll, beforeAll, expect, test } from 'vite-plus/test';
import { ca, echo, listen, listenTls, type Server } from './servers.js';

const connect = create({ ca });
let plain: Server;
let secure: Server;

beforeAll(async () => {
  [plain, secure] = await Promise.all([listen(echo), listenTls(echo)]);
});

afterAll(async () => {
  await Promise.all([plain.close(), secure.close()]);
});

test('echoes the same bytes however the writes are chunked', async () => {
  await fuzz(
    fc.asyncProperty(
      fc.uint8Array({ maxLength: 64 * 1024 }),
      cuts,
      byteForm,
      fc.constantFrom<Sockets.Options['secureTransport']>('off', 'on'),
      fc.boolean(),
      async (data, at, form, secureTransport, allowHalfOpen) => {
        const server = secureTransport === 'on' ? secure : plain;
        const socket = connect(
          { hostname: 'localhost', port: server.port },
          { secureTransport, allowHalfOpen },
        );
        const writer = socket.writable.getWriter();
        const writing = (async () => {
          for (const chunk of split(data, at)) {
            await writer.write(toByteForm(chunk, form));
          }
          await writer.close();
        })();
        const echoed = await Streams.toBytes(socket.readable);
        await writing;
        await socket.closed;
        expect(echoed).toEqual(data);
      },
    ),
    { timeout: 10_000 },
  );
});
