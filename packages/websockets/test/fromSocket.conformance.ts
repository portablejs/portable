import * as WebSockets from '@portable/websockets';
import { describe, expect, test } from 'vite-plus/test';
import { FakeWebSocket, bytes, errorOf, read, sleep } from './utils.js';

function open() {
  const socket = new FakeWebSocket('wss://example.com');
  socket.accept();
  return { socket, ...WebSockets.fromSocket(socket) };
}

describe('fromSocket', () => {
  test('reads text and binary messages', async () => {
    const { socket, readable } = open();
    expect(socket.binaryType).toBe('arraybuffer');
    socket.receive('text');
    socket.receive(bytes(1, 2).buffer);
    expect(await read(readable.getReader(), 2)).toEqual(['text', bytes(1, 2)]);
  });

  test('writes text and bytes', async () => {
    const { socket, writable } = open();
    const writer = writable.getWriter();
    await writer.write('a');
    await writer.write(bytes(3));
    expect(socket.sent).toEqual(['a', bytes(3)]);
  });

  test('writes wait until a connecting socket opens', async () => {
    const socket = new FakeWebSocket('wss://example.com');
    const { writable } = WebSockets.fromSocket(socket);
    const write = writable.getWriter().write('early');
    await sleep(5);
    expect(socket.sent).toEqual([]);
    socket.accept();
    await write;
    expect(socket.sent).toEqual(['early']);
  });

  test('writes fail when a connecting socket never opens', async () => {
    const socket = new FakeWebSocket('wss://example.com');
    const { writable } = WebSockets.fromSocket(socket);
    const write = writable.getWriter().write('early');
    socket.fail();
    expect(await errorOf(write)).toBeInstanceOf(Error);
  });

  test.each([1000, 1001, 1005])('readable closes when the socket closes with %i', async (code) => {
    const { socket, readable, writable } = open();
    socket.receive('last');
    socket.drop(code);
    expect(await read(readable.getReader(), 2)).toEqual(['last']);
    expect(await errorOf(writable.getWriter().write('x'))).toBeInstanceOf(WebSockets.CloseError);
  });

  test('readable fails with a CloseError when the connection drops', async () => {
    const { socket, readable } = open();
    socket.drop(1006);
    const error = await errorOf(readable.getReader().read());
    expect(error).toBeInstanceOf(WebSockets.CloseError);
    expect(error).toMatchObject({ code: 1006 });
  });

  test('writable.close() closes the socket with 1000, and readable ends after the close', async () => {
    const { socket, readable, writable } = open();
    await writable.close();
    expect(socket.closedWith).toEqual({ code: 1000, reason: undefined });
    expect(await read(readable.getReader())).toEqual([]);
  });

  test('cancelling readable closes the socket and fails writable', async () => {
    const { socket, readable, writable } = open();
    await readable.cancel();
    expect(socket.closedWith).toEqual({ code: 1000, reason: undefined });
    await expect(writable.getWriter().write('x')).rejects.toMatchObject({ name: 'AbortError' });
  });

  test('aborting writable closes the socket and fails readable', async () => {
    const { socket, readable, writable } = open();
    await writable.abort(new Error('stop'));
    expect(socket.closedWith).toEqual({ code: 1000, reason: undefined });
    expect(await errorOf(readable.getReader().read())).toMatchObject({ message: 'stop' });
  });

  test('the signal closes the socket with 1000 and fails both streams', async () => {
    const socket = new FakeWebSocket('wss://example.com');
    socket.accept();
    const controller = new AbortController();
    const { readable, writable } = WebSockets.fromSocket(socket, { signal: controller.signal });
    controller.abort(new Error('done'));
    expect(socket.closedWith).toEqual({ code: 1000, reason: undefined });
    expect(await errorOf(readable.getReader().read())).toMatchObject({ message: 'done' });
    expect(await errorOf(writable.getWriter().write('x'))).toMatchObject({ message: 'done' });
  });

  test('writes wait while bufferedAmount is above highWaterMark', async () => {
    const socket = new FakeWebSocket('wss://example.com');
    socket.accept();
    const { writable } = WebSockets.fromSocket(socket, { highWaterMark: 4 });
    socket.bufferedAmount = 5;
    const write = writable.getWriter().write('x');
    await sleep(15);
    expect(socket.sent).toEqual([]);
    socket.bufferedAmount = 0;
    await write;
    expect(socket.sent).toEqual(['x']);
  });

  test('maxBuffered fails both streams and closes the socket', async () => {
    const socket = new FakeWebSocket('wss://example.com');
    socket.accept();
    const { readable, writable } = WebSockets.fromSocket(socket, { maxBuffered: 3 });
    socket.receive(bytes(1, 2).buffer);
    socket.receive(bytes(3, 4).buffer);
    const error = await errorOf(readable.getReader().read());
    expect(error).toMatchObject({ name: 'WebSockets.MaxBufferedError', maxBuffered: 3 });
    expect(socket.closedWith).toBeDefined();
    await expect(writable.getWriter().write('x')).rejects.toBe(error);
  });
});
