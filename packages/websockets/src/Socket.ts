import { assertUint8Array, toBufferSource } from '@portable/bytes/internal';
import * as Timers from '@portable/timers';
import type { AsyncDisposeMethod } from './dispose.js';

/** A received message: text as a `string`, binary data as a `Uint8Array`. */
export type Message = string | Uint8Array<ArrayBuffer>;

/**
 * The readable and writable sides of a WebSocket. Where the runtime has `Symbol.asyncDispose`,
 * `[Symbol.asyncDispose]()` closes the socket with code 1000, stops reconnecting, and fails both
 * streams with an `AbortError` `DOMException`, as aborting `signal` does, so a connection declared
 * with `await using` is closed when the scope ends.
 */
export type Duplex = AsyncDisposeMethod & {
  /** Received messages. */
  readable: ReadableStream<Message>;
  /** Messages to send. */
  writable: WritableStream<string | Uint8Array>;
};

/** The part of the platform `WebSocket` this package uses. Any object with this shape works. */
export type Socket = {
  readonly readyState: number;
  readonly bufferedAmount: number;
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

export async function drained(socket: Socket, highWaterMark: number): Promise<void> {
  for (let wait = 1; socket.bufferedAmount > highWaterMark && socket.readyState === OPEN;) {
    await Timers.sleep(wait);
    wait = Math.min(wait * 2, 32);
  }
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
export function queueLimit(maxBuffered: number): number {
  return Math.min(maxBuffered, Number.MAX_SAFE_INTEGER);
}

export const closedError = (): DOMException =>
  new DOMException('The WebSocket is closed.', 'InvalidStateError');

export const disposedError = (): DOMException =>
  new DOMException('The WebSocket streams were disposed.', 'AbortError');

export const cancelledError = (): DOMException =>
  new DOMException('The WebSocket streams were cancelled.', 'AbortError');
