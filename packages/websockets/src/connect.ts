import { withAsyncDispose } from '@portable/errors/internal';
import { connections } from './connections.js';
import { MaxBufferedError } from './errors.js';
import {
  type Duplex,
  type Message,
  type Socket,
  assertSize,
  cancelledError,
  disposedError,
  messageSize,
  isOverMaxBuffered,
  queueLimit,
  toOutgoing,
} from './Socket.js';
import type * as Timers from '@portable/timers';

export declare namespace connect {
  type Options = {
    /** Subprotocols to request, as for `new WebSocket(url, protocols)`. */
    protocols?: string | readonly string[] | undefined;
    /** Closes the socket with code 1000 and fails both streams with `signal.reason`. */
    signal?: AbortSignal | undefined;
    /** Wait before each reconnect. @default { initial: 1000, max: 30000 } */
    delay?: Timers.Delay | undefined;
    /**
     * The number of consecutive failed attempts, counting the first, after which `connect` stops
     * reconnecting and fails the streams with the last error. A connection that finishes `open` resets the count.
     * @default Infinity
     */
    attempts?: number | undefined;
    /** Time limit for each attempt to open and finish `open`, in ms. @default 10000 */
    timeout?: number | undefined;
    /**
     * Runs on every connection, after the socket opens and before queued writes are sent. Use it to
     * authenticate or resubscribe. If it throws, the socket closes and reconnects after `delay`.
     */
    open?: ((context: Context) => void | PromiseLike<void>) | undefined;
    /**
     * Called when the connection closes without the client calling `close`, with the close and
     * `{ attempt }`, the number of failures in a row including this one. It returns whether
     * `connect` reconnects. By default, codes
     * 1000, 1002, 1003, 1007, 1008, 1009, and 1010 are final and every other code reconnects. If it
     * throws, both streams fail with that error. `connect` doesn't call it after a timeout, a missed
     * heartbeat reply, or an `open` that throws, and retries those until `attempts` runs out.
     */
    reconnectIf?:
      | ((close: Close, retry: { attempt: number }) => boolean | PromiseLike<boolean>)
      | undefined;
    /** Writes to hold while disconnected. Further writes wait. @default 1000 */
    maxQueued?: number | undefined;
    /** Writes wait while the socket's `bufferedAmount` is above this many bytes. @default 1048576 */
    highWaterMark?: number | undefined;
    /**
     * Bytes of received binary messages, plus UTF-16 code units of text messages
     * (`string.length`), to hold while the reader is behind. Past it, both streams fail with
     * `MaxBufferedError` and the socket closes. @default Infinity
     */
    maxBuffered?: number | undefined;
    /** Sends `ping` every `interval` ms and reconnects when no `pong` arrives within `timeout` ms. */
    heartbeat?: Heartbeat | undefined;
    /** The WebSocket class to use. @default globalThis.WebSocket */
    WebSocket?: Constructor | undefined;
  };

  /** What `open` receives. */
  type Context = {
    /**
     * Sends a message on this connection now, ahead of queued writes. Throws once the connection
     * has closed.
     */
    send: (message: string | Uint8Array) => void;
    /**
     * Messages received while `open` runs. Messages that `open` doesn't read go to `readable` once
     * `open` returns or cancels this stream.
     */
    messages: ReadableStream<Message>;
    /** Aborts when this connection closes or the attempt times out. */
    signal: AbortSignal;
  };

  /** A close the client didn't start. */
  type Close = {
    code: number;
    reason: string;
  };

  /** An application-level ping, for servers that close idle connections or drop them silently. */
  type Heartbeat = {
    /** The message to send. */
    ping: string | Uint8Array;
    /** Returns `true` for the reply. Replies are not passed to `readable`. */
    pong: (message: Message) => boolean;
    /** Time between pings, in ms. */
    interval: number;
    /** Time to wait for the reply, in ms. @default interval */
    timeout?: number | undefined;
  };

  type Constructor = new (url: string, protocols?: string | string[]) => Socket;

  type Url = string | URL | (() => string | URL | PromiseLike<string | URL>);
}

/**
 * Opens a WebSocket that reconnects when the connection drops, and returns its readable and writable
 * sides. Both streams stay the same across reconnects.
 *
 * Writes made while disconnected are queued and sent after the next connection's `open` finishes.
 * Messages the server sent while the connection dropped, and writes the old socket accepted but
 * never delivered, are lost. Add acknowledgements or sequence numbers to your protocol if that matters.
 *
 * @example
 * ```ts
 * import * as Streams from '@portable/streams';
 * import * as WebSockets from '@portable/websockets';
 *
 * const { readable, writable } = WebSockets.connect('wss://example.com/feed', {
 *   async open({ send }) {
 *     send(JSON.stringify({ subscribe: 'prices' }));
 *   },
 * });
 * const writer = writable.getWriter();
 * await writer.write('hello');
 * for await (const message of Streams.toAsyncIterable(readable)) {
 *   console.log(message);
 * }
 * ```
 */
export function connect(url: connect.Url, options: connect.Options = {}): Duplex {
  const { signal, maxQueued = 1000, maxBuffered = Infinity, ...rest } = options;
  assertSize('maxQueued', maxQueued);
  assertSize('maxBuffered', maxBuffered, 1);
  const stop = new AbortController();
  const source = connections(url, { ...rest, signal: signal?.aborted ? signal : stop.signal });

  let readableController!: ReadableStreamDefaultController<Message>;
  let writableController!: WritableStreamDefaultController;
  let failure: unknown;
  let closing = false;
  let current: WritableStreamDefaultWriter<string | Uint8Array> | undefined;
  const queue: (string | Uint8Array<ArrayBuffer>)[] = [];
  let waiters: (() => void)[] = [];

  const notify = () => {
    const waiting = waiters;
    waiters = [];
    for (const resolve of waiting) {
      resolve();
    }
  };
  const changed = () => new Promise<void>((resolve) => waiters.push(resolve));

  const finish = (error: unknown, closeReadable: boolean) => {
    if (stop.signal.aborted) {
      return;
    }
    failure = error;
    stop.abort(error);
    signal?.removeEventListener('abort', onAbort);
    try {
      if (closeReadable) {
        readableController.close();
      } else {
        readableController.error(error);
      }
    } catch {}
    if (!closing) {
      writableController.error(error);
    }
    queue.length = 0;
    notify();
  };
  const onAbort = () => finish(signal!.reason, false);

  const push = (message: Message) => {
    if (stop.signal.aborted) {
      return;
    }
    readableController.enqueue(message);
    if (isOverMaxBuffered(readableController, maxBuffered)) {
      finish(new MaxBufferedError({ maxBuffered }), false);
    }
  };

  async function run(source: ReadableStream<Duplex>) {
    const reader = source.getReader();
    for (;;) {
      let next: ReadableStreamReadResult<Duplex>;
      try {
        next = await reader.read();
      } catch (error) {
        return finish(error, false);
      }
      if (next.done) {
        return finish(lastError, true);
      }
      const writer = next.value.writable.getWriter();
      const messages = next.value.readable.getReader();
      let open = true;
      while (open && queue.length > 0 && !stop.signal.aborted) {
        try {
          await writer.write(queue[0]);
          queue.shift();
          notify();
        } catch {
          open = false;
        }
      }
      if (open && !stop.signal.aborted) {
        current = writer;
        notify();
        if (closing) {
          void writer.close().catch(() => {});
        }
      }
      try {
        for (;;) {
          const { done, value } = await messages.read();
          if (done) {
            break;
          }
          push(value);
        }
      } catch {}
      if (current === writer) {
        current = undefined;
      }
      await writer.closed.catch((error: unknown) => (lastError = error));
      notify();
    }
  }

  let lastError: unknown;

  const write = (input: string | Uint8Array): Promise<void> | undefined => {
    const chunk = toOutgoing(input);
    if (stop.signal.aborted) {
      throw failure;
    }
    const writer = current;
    if (writer && queue.length === 0) {
      return writer.write(chunk).catch(() => {
        if (current === writer) {
          current = undefined;
        }
        return write(chunk);
      });
    }
    if (queue.length < maxQueued) {
      queue.push(chunk);
      return;
    }
    return changed().then(() => write(chunk));
  };

  const readable = new ReadableStream<Message>(
    {
      start(controller) {
        readableController = controller;
      },
      cancel(reason) {
        finish(reason ?? cancelledError(), false);
      },
    },
    { highWaterMark: queueLimit(maxBuffered), size: messageSize },
  );

  const writable = new WritableStream<string | Uint8Array>({
    start(controller) {
      writableController = controller;
    },
    write(chunk) {
      return write(chunk);
    },
    async close() {
      while (queue.length > 0 && !stop.signal.aborted) {
        await changed();
      }
      if (stop.signal.aborted) {
        throw failure;
      }
      closing = true;
      if (current) {
        await current.close().catch(() => {});
      } else {
        finish(undefined, true);
      }
    },
    abort(reason) {
      finish(reason, false);
    },
  });

  if (signal?.aborted) {
    finish(signal.reason, false);
  } else {
    signal?.addEventListener('abort', onAbort);
    void run(source);
  }
  return withAsyncDispose({ readable, writable }, async () => finish(disposedError(), false));
}
