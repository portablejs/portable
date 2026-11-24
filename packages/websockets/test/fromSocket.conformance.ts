import * as WebSockets from '@portable/websockets';
import { describe, expect, test } from 'vite-plus/test';
import { FakeWebSocket, bytes, errorOf, read, sleep, until } from './utils.js';

function open(options: WebSockets.fromSocket.Options = {}) {
  const socket = new FakeWebSocket('wss://example.com');
  socket.accept();
  return { socket, ...WebSockets.fromSocket(socket, options) };
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

  test('writes go straight out on a socket without bufferedAmount', async () => {
    const socket = new FakeWebSocket('wss://example.com');
    socket.accept();
    const withoutBufferedAmount = Object.assign(socket, { bufferedAmount: undefined });
    const { writable } = WebSockets.fromSocket(withoutBufferedAmount, { highWaterMark: 0 });
    const writer = writable.getWriter();
    await writer.write('a');
    await writer.write('b');
    expect(socket.sent).toEqual(['a', 'b']);
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

  test('reads empty text and binary messages in order', async () => {
    const { socket, readable } = open();
    socket.receive('');
    socket.receive(new ArrayBuffer(0));
    socket.receive('last');
    expect(await read(readable.getReader(), 3)).toEqual(['', bytes(), 'last']);
  });

  test('maxBuffered counts an empty message as 1', async () => {
    const { socket, readable } = open({ maxBuffered: 2 });
    socket.receive('');
    socket.receive('');
    socket.receive('');
    const error = await errorOf(readable.getReader().read());
    expect(error).toBeInstanceOf(WebSockets.MaxBufferedError);
  });
});

describe('fromSocket heartbeat', () => {
  const heartbeat = { ping: 'ping', pong: (message: unknown) => message === 'pong', interval: 10 };

  test('sends the ping and hides the pong from readable', async () => {
    const { socket, readable } = open({ heartbeat });
    await until(() => socket.sent.length > 0);
    expect(socket.sent[0]).toBe('ping');
    socket.receive('pong');
    socket.receive('data');
    expect(await read(readable.getReader(), 1)).toEqual(['data']);
  });

  test('starts pinging only once a connecting socket opens', async () => {
    const socket = new FakeWebSocket('wss://example.com');
    WebSockets.fromSocket(socket, { heartbeat });
    await sleep(30);
    expect(socket.sent).toEqual([]);
    socket.accept();
    await until(() => socket.sent.length > 0);
    expect(socket.sent[0]).toBe('ping');
  });

  test('a missed reply closes the socket with 1000 and fails both streams', async () => {
    const { socket, readable, writable } = open({ heartbeat: { ...heartbeat, timeout: 10 } });
    const error = await errorOf(readable.getReader().read());
    expect(error).toMatchObject({ name: 'TimeoutError' });
    expect(socket.closedWith).toEqual({ code: 1000, reason: undefined });
    await expect(writable.getWriter().write('x')).rejects.toBe(error);
  });

  test('keeps the socket open while pongs arrive', async () => {
    const { socket } = open({ heartbeat: { ...heartbeat, interval: 50, timeout: 300 } });
    const answer = setInterval(() => {
      if (socket.sent.at(-1) === 'ping') {
        socket.receive('pong');
      }
    }, 1);
    await sleep(500);
    clearInterval(answer);
    expect(socket.closedWith).toBeUndefined();
  });

  test('never pings a socket that was already closed when wrapped', async () => {
    const socket = new FakeWebSocket('wss://example.com');
    socket.accept();
    socket.close(1000);
    WebSockets.fromSocket(socket, { heartbeat });
    await sleep(30);
    expect(socket.sent).toEqual([]);
  });

  test('stops pinging once the streams end', async () => {
    const { socket, readable } = open({ heartbeat });
    await readable.cancel();
    const sent = socket.sent.length;
    await sleep(40);
    expect(socket.sent).toHaveLength(sent);
  });

  test('rejects an interval below 1 with a RangeError', () => {
    const socket = new FakeWebSocket('wss://example.com');
    expect(() =>
      WebSockets.fromSocket(socket, { heartbeat: { ...heartbeat, interval: 0 } }),
    ).toThrow(RangeError);
  });
});

const { asyncDispose } = Symbol as { asyncDispose?: symbol | undefined };

describe.skipIf(asyncDispose === undefined)('Symbol.asyncDispose', () => {
  test('closes the socket with 1000 and fails both streams', async () => {
    const socket = new FakeWebSocket('wss://example.com');
    socket.accept();
    const duplex = WebSockets.fromSocket(socket);
    await (duplex as unknown as Record<symbol, () => Promise<void>>)[asyncDispose!]!();
    expect(socket.closedWith).toEqual({ code: 1000, reason: undefined });
    expect(await errorOf(duplex.readable.getReader().read())).toMatchObject({ name: 'AbortError' });
    expect(await errorOf(duplex.writable.getWriter().write('x'))).toMatchObject({
      name: 'AbortError',
    });
  });
});
