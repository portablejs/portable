import { fc, fuzz, outcomeAsync } from '@portable/fuzz';
import * as WebSockets from '@portable/websockets';
import { expect, test } from 'vite-plus/test';
import { FakeWebSocket, read } from './utils.js';

const message = fc.oneof(
  fc.string({ maxLength: 20 }),
  fc.uint8Array({ maxLength: 20 }).map((bytes) => new Uint8Array(bytes)),
);

const open = (options?: WebSockets.fromSocket.Options) => {
  const socket = new FakeWebSocket('wss://example.com');
  socket.accept();
  return { socket, ...WebSockets.fromSocket(socket, options) };
};

const size = (message: WebSockets.Message) =>
  typeof message === 'string' ? message.length : message.byteLength;

test('reads received messages in order and writes written ones in order', async () => {
  await fuzz(
    fc.asyncProperty(fc.array(message, { maxLength: 10 }), async (messages) => {
      const { socket, readable, writable } = open();
      for (const each of messages) {
        socket.receive(typeof each === 'string' ? each : each.slice().buffer);
      }
      expect(await read(readable.getReader(), messages.length)).toEqual(messages);
      const writer = writable.getWriter();
      for (const each of messages) {
        await writer.write(each);
      }
      expect(socket.sent).toEqual(messages);
    }),
  );
});

test('maxBuffered fails the stream only when unread messages exceed it', async () => {
  await fuzz(
    fc.asyncProperty(
      fc.array(message, { maxLength: 10 }),
      fc.integer({ min: 1, max: 100 }),
      async (messages, maxBuffered) => {
        const { socket, readable } = open({ maxBuffered });
        for (const each of messages) {
          socket.receive(typeof each === 'string' ? each : each.slice().buffer);
        }
        let total = 0;
        const over = messages.some((each) => (total += size(each)) > maxBuffered);
        const result = await outcomeAsync([WebSockets.MaxBufferedError], () =>
          read(readable.getReader(), messages.length),
        );
        expect(result).toEqual(over ? { error: WebSockets.MaxBufferedError } : { value: messages });
      },
    ),
  );
});
