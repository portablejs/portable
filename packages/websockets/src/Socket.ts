import { assertUint8Array, toBufferSource } from '@portable/bytes/internal';
import * as Timers from '@portable/timers';
import type { AsyncDisposeMethod } from '@portable/errors/internal';
import type { connect } from './connect.js';

/** A received message: text as a `string`, binary data as a `Uint8Array`. */
export type Message = string | Uint8Array<ArrayBuffer>;

/**
 * The readable and writable sides of a WebSocket. Where the runtime has `Symbol.asyncDispose`,
 * `[Symbol.asyncDispose]()` closes the socket with code 1000, stops reconnecting, and fails both
 * streams with an `AbortError` `DOMException`, as aborting `signal` does, so a connection declared
 * with `await using` is closed when the scope ends. Without the symbol, abort `signal` to close it,
 * even while a reader or writer holds a lock.
 */
export type Duplex = AsyncDisposeMethod & {
  /** Received messages. */
  readable: ReadableStream<Message>;
  /** Messages to send. */
  writable: WritableStream<string | Uint8Array>;
};

/**
 * The part of the platform `WebSocket` this package uses. Any object with this shape works. A
 * socket without `bufferedAmount`, such as a Cloudflare Workers `WebSocket`, sends each write at
 * once.
 */
export type Socket = {
  readonly readyState: number;
  readonly bufferedAmount?: number | undefined;
  binaryType: string;
  send(data: string | Uint8Array<ArrayBuffer>): void;
  close(code?: number, reason?: string): void;
  addEventListener(type: string, listener: (event: SocketEvent) => void): void;
  removeEventListener(type: string, listener: (event: SocketEvent) => void): void;
};

/** The fields this package reads from `message` and `close` events. */
export type SocketEvent = Event & {
  data?: unknown;
  code?: number | undefined;
  reason?: string | undefined;
};

export const OPEN = 1;
export const CONNECTING = 0;

const maxTimeout = 2 ** 31 - 1;

export function timeout(fn: () => void, ms: number): ReturnType<typeof setTimeout> | undefined {
  return ms === Infinity ? undefined : setTimeout(fn, Math.min(ms, maxTimeout));
}

export function toMessage(data: unknown): Message {
  if (typeof data === 'string') {
    return data;
  }
  if (data instanceof ArrayBuffer) {
    return new Uint8Array(data);
  }
  if (ArrayBuffer.isView(data)) {
    const { buffer, byteOffset, byteLength } = data;
    if (buffer instanceof ArrayBuffer) {
      return new Uint8Array(buffer, byteOffset, byteLength);
    }
    return new Uint8Array(new Uint8Array(buffer, byteOffset, byteLength));
  }
  throw new TypeError('Expected a string or ArrayBuffer message. Set binaryType to "arraybuffer".');
}

export function toOutgoing(message: unknown): string | Uint8Array<ArrayBuffer> {
  return typeof message === 'string' ? message : toBufferSource(assertUint8Array(message));
}

export const messageSize = (message: Message): number =>
  typeof message === 'string' ? message.length : message.byteLength;

export function isAboveHighWaterMark(socket: Socket, highWaterMark: number): boolean {
  return (socket.bufferedAmount ?? 0) > highWaterMark;
}

export async function drained(socket: Socket, highWaterMark: number): Promise<void> {
  for (let wait = 1; isAboveHighWaterMark(socket, highWaterMark) && socket.readyState === OPEN;) {
    await Timers.sleep(wait);
    wait = Math.min(wait * 2, 32);
  }
}

export type HeartbeatTimer = {
  /** Stops the timer for the reply. Call it when `heartbeat.pong` returns `true`. */
  pong(): void;
  /** Stops sending pings. */
  stop(): void;
};

export function assertHeartbeat(heartbeat: connect.Heartbeat): string | Uint8Array<ArrayBuffer> {
  assertSize('heartbeat.interval', heartbeat.interval, 1);
  assertSize('heartbeat.timeout', heartbeat.timeout ?? heartbeat.interval, 1);
  return toOutgoing(heartbeat.ping);
}

/**
 * Sends `ping` on `socket` every `heartbeat.interval` ms, and calls `missed` with a `TimeoutError`
 * when no reply arrives within `heartbeat.timeout` ms of a ping.
 */
export function startHeartbeat(
  socket: Socket,
  heartbeat: connect.Heartbeat,
  ping: string | Uint8Array<ArrayBuffer>,
  missed: (error: DOMException) => void,
): HeartbeatTimer {
  const { interval, timeout: wait = interval } = heartbeat;
  let pongTimer: ReturnType<typeof setTimeout> | undefined;
  const pingTimer = setInterval(() => {
    if (socket.readyState !== OPEN) {
      return;
    }
    socket.send(ping);
    pongTimer ??= timeout(
      () => missed(new DOMException(`No heartbeat reply within ${wait} ms.`, 'TimeoutError')),
      wait,
    );
  }, interval);
  return {
    pong() {
      clearTimeout(pongTimer);
      pongTimer = undefined;
    },
    stop() {
      clearInterval(pingTimer);
      clearTimeout(pongTimer);
    },
  };
}

export function isNormalClose(code: number): boolean {
  return code === 1000 || code === 1001 || code === 1005;
}

export function assertSize(name: string, value: number, min = 0): void {
  if (!(value >= min)) {
    throw new RangeError(`Expected \`${name}\` to be a number >= ${min}.`);
  }
}

// The Streams spec allows a `highWaterMark` of `Infinity`, but Workers throws a TypeError for it.
// Workers also stores a `highWaterMark` as a 32-bit integer, so a value of 2 ** 31 or more wraps
// to a negative number, and `desiredSize` is negative before anything is queued.
export function queueLimit(maxBuffered: number): number {
  return Math.min(maxBuffered, 2 ** 31 - 1);
}

export function isOverMaxBuffered(
  controller: ReadableStreamDefaultController<unknown>,
  maxBuffered: number,
): boolean {
  return queueLimit(maxBuffered) - controller.desiredSize! > maxBuffered;
}

export const closedError = (): DOMException =>
  new DOMException('The WebSocket is closed.', 'InvalidStateError');

export const disposedError = (): DOMException =>
  new DOMException('The WebSocket streams were disposed.', 'AbortError');

export const cancelledError = (): DOMException =>
  new DOMException('The WebSocket streams were cancelled.', 'AbortError');
