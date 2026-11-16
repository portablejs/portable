import * as Timers from '@portable/timers';
import { withAsyncDispose } from '@portable/errors/internal';
import type { connect } from './connect.js';
import { CloseError, MaxBufferedError } from './errors.js';
import {
  type Duplex,
  type Message,
  OPEN,
  type Socket,
  type SocketEvent,
  assertSize,
  cancelledError,
  closedError,
  drained,
  isNormalClose,
  messageSize,
  timeout as startTimer,
  toMessage,
  toOutgoing,
} from './Socket.js';

export declare namespace connections {
  /** The options of `connect`, without `maxQueued`, because writes aren't queued between connections. */
  type Options = Omit<connect.Options, 'maxQueued'>;
}

type Outcome = { ready: boolean; closedByClient: boolean } & (
  | { kind: 'close'; close: connect.Close }
  | { kind: 'error'; error: unknown; final?: boolean | undefined }
);

type Session = { duplex?: Duplex | undefined; ended: Promise<Outcome> };

const finalCodes = new Set([1000, 1002, 1003, 1007, 1008, 1009, 1010]);
const defaultReconnectIf = (event: connect.Close) => !finalCodes.has(event.code);

/**
 * Opens a WebSocket that reconnects when the connection drops, and returns a stream with one
 * `{ readable, writable }` pair per connection. A pair is enqueued once its socket is open and the
 * `open` option's function has finished. When the socket closes, the pair's `readable` delivers the
 * messages it holds and then ends. If the close code is 1000, 1001, or 1005, or you closed the pair,
 * `readable` closes. Otherwise it fails with a `CloseError`, or with the error that ended the
 * connection. A write to a pair whose socket is no longer open rejects without sending anything.
 * Closing a pair's `writable` or cancelling its `readable` closes the socket with code 1000 and ends
 * the stream of connections.
 *
 * When `reconnectIf` returns false, the stream ends if the close code is 1000, 1001, or 1005, and
 * fails with a `CloseError` for any other code. It fails with the last error when `attempts` runs
 * out, when `reconnectIf` throws, or when an error stops reconnecting, such as `MaxBufferedError`.
 *
 * Use it when you need to know which messages went out on which connection. `Rpc.connect` uses it
 * to reject the calls whose requests were lost. `connect` calls `connections` and joins the pairs
 * into one `{ readable, writable }` that stays the same across reconnects.
 *
 * @example
 * ```ts
 * import * as Streams from '@portable/streams';
 * import * as WebSockets from '@portable/websockets';
 *
 * const connections = WebSockets.connections('wss://example.com/feed');
 * for await (const { readable, writable } of Streams.toAsyncIterable(connections)) {
 *   const writer = writable.getWriter();
 *   await writer.write(JSON.stringify({ subscribe: 'prices' }));
 *   writer.releaseLock();
 *   for await (const message of Streams.toAsyncIterable(readable)) {
 *     console.log(message);
 *   }
 * }
 * ```
 */
export function connections(
  url: connect.Url,
  options: connections.Options = {},
): ReadableStream<Duplex> {
  const {
    protocols,
    signal,
    delay = { initial: 1000, max: 30_000 },
    attempts = Infinity,
    timeout = 10_000,
    open,
    reconnectIf = defaultReconnectIf,
    highWaterMark = 1 << 20,
    maxBuffered = Infinity,
    heartbeat,
    WebSocket: Impl = globalThis.WebSocket,
  } = options;
  if (typeof Impl !== 'function') {
    throw new TypeError('No WebSocket class found. Pass one as the `WebSocket` option.');
  }
  const next = Timers.backoff(delay);
  assertSize('attempts', attempts, 1);
  assertSize('timeout', timeout, 1);
  assertSize('highWaterMark', highWaterMark);
  assertSize('maxBuffered', maxBuffered, 1);
  if (heartbeat) {
    assertSize('heartbeat.interval', heartbeat.interval, 1);
    assertSize('heartbeat.timeout', heartbeat.timeout ?? heartbeat.interval, 1);
  }
  const ping = heartbeat && toOutgoing(heartbeat.ping);
  const protocolList = typeof protocols === 'string' ? protocols : protocols && [...protocols];

  let controller!: ReadableStreamDefaultController<Duplex>;
  const stop = new AbortController();

  const finish = (error: unknown, clean: boolean) => {
    if (stop.signal.aborted) {
      return;
    }
    stop.abort(error);
    signal?.removeEventListener('abort', onAbort);
    try {
      if (clean) {
        controller.close();
      } else {
        controller.error(error);
      }
    } catch {}
  };
  const onAbort = () => finish(signal!.reason, false);

  async function session(): Promise<Session> {
    let socket: Socket;
    try {
      const target = typeof url === 'function' ? await url() : url;
      if (stop.signal.aborted) {
        return { ended: Promise.resolve(stopped()) };
      }
      socket = new Impl(String(target), protocolList);
    } catch (error) {
      const final = typeof url !== 'function';
      return {
        ended: Promise.resolve({
          ready: false,
          closedByClient: false,
          kind: 'error',
          error,
          final,
        }),
      };
    }
    socket.binaryType = 'arraybuffer';

    const attempt = new AbortController();
    let ready = false;
    let closedByClient = false;
    let outcome: Outcome | undefined;
    let ended!: (outcome: Outcome) => void;
    const result = new Promise<Outcome>((resolve) => (ended = resolve));

    const buffer: Message[] = [];
    let buffered = 0;
    let wakeReader: (() => void) | undefined;
    let readableEnd: { clean: boolean; error: unknown } | undefined;
    let writableController!: WritableStreamDefaultController;
    const closeByClient = () => {
      if (outcome) {
        return;
      }
      closedByClient = true;
      socket.close(1000);
    };
    const push = (message: Message) => {
      if (outcome) {
        return;
      }
      buffer.push(message);
      buffered += messageSize(message);
      wakeReader?.();
      if (buffered > maxBuffered) {
        buffer.length = 0;
        socket.close(1000);
        end({
          ready,
          closedByClient,
          kind: 'error',
          error: new MaxBufferedError({ maxBuffered }),
          final: true,
        });
      }
    };

    let handshake = !!open;
    const inbox: Message[] = [];
    let wakeHandshake: (() => void) | undefined;
    const release = () => {
      handshake = false;
      for (const message of inbox) {
        push(message);
      }
      inbox.length = 0;
      wakeHandshake?.();
    };

    let pingTimer: ReturnType<typeof setInterval> | undefined;
    let pongTimer: ReturnType<typeof setTimeout> | undefined;
    const openTimer = startTimer(
      () =>
        attempt.abort(
          new DOMException(`The WebSocket did not open within ${timeout} ms.`, 'TimeoutError'),
        ),
      timeout,
    );

    const end = (next: Outcome) => {
      if (outcome) {
        return;
      }
      release();
      outcome = next;
      socket.removeEventListener('message', onMessage);
      socket.removeEventListener('close', onClose);
      stop.signal.removeEventListener('abort', onStop);
      clearTimeout(openTimer);
      clearInterval(pingTimer);
      clearTimeout(pongTimer);
      attempt.abort();
      const error =
        next.kind === 'error'
          ? next.error
          : new CloseError({ code: next.close.code, reason: next.close.reason });
      const clean =
        next.closedByClient || (next.kind === 'close' && isNormalClose(next.close.code));
      if (next.kind === 'error' && (next.final || stop.signal.aborted)) {
        buffer.length = 0;
      }
      readableEnd = { clean, error };
      wakeReader?.();
      try {
        writableController.error(next.closedByClient ? closedError() : error);
      } catch {}
      ended(next);
    };

    const readable = new ReadableStream<Message>(
      {
        async pull(c) {
          while (buffer.length === 0 && !readableEnd) {
            await new Promise<void>((resolve) => (wakeReader = resolve));
          }
          const message = buffer.shift();
          if (message !== undefined) {
            buffered -= messageSize(message);
            c.enqueue(message);
          } else if (readableEnd!.clean) {
            c.close();
          } else {
            c.error(readableEnd!.error);
          }
        },
        cancel: closeByClient,
      },
      { highWaterMark: 0 },
    );
    const writable = new WritableStream<string | Uint8Array>({
      start(c) {
        writableController = c;
      },
      async write(chunk) {
        const data = toOutgoing(chunk);
        if (socket.bufferedAmount > highWaterMark) {
          await drained(socket, highWaterMark);
        }
        if (outcome || socket.readyState !== OPEN) {
          throw closedError();
        }
        socket.send(data);
      },
      async close() {
        closeByClient();
        await result;
      },
      abort: closeByClient,
    });

    const onMessage = (event: SocketEvent) => {
      let message: Message;
      try {
        message = toMessage(event.data);
      } catch (error) {
        socket.close(1000);
        return end({ ready, closedByClient, kind: 'error', error, final: true });
      }
      if (heartbeat?.pong(message)) {
        clearTimeout(pongTimer);
        pongTimer = undefined;
      } else if (handshake) {
        inbox.push(message);
        wakeHandshake?.();
      } else {
        push(message);
      }
    };
    const onClose = (event: SocketEvent) =>
      end({
        ready,
        closedByClient,
        kind: 'close',
        close: { code: event.code ?? 1005, reason: event.reason ?? '' },
      });
    const onStop = () => attempt.abort(stop.signal.reason);

    socket.addEventListener('message', onMessage);
    socket.addEventListener('close', onClose);
    // Keep an error listener after teardown: the ws package throws if an error event has no
    // listener.
    socket.addEventListener('error', () => {});
    stop.signal.addEventListener('abort', onStop);
    attempt.signal.addEventListener('abort', () => {
      if (outcome) {
        return;
      }
      socket.close(stop.signal.aborted ? 1000 : undefined);
      end({ ready, closedByClient, kind: 'error', error: attempt.signal.reason });
    });
    if (stop.signal.aborted) {
      onStop();
    }

    const opened = await Promise.race([
      new Promise<boolean>((resolve) => socket.addEventListener('open', () => resolve(true))),
      result.then(() => false),
    ]);
    if (!opened) {
      return { ended: result };
    }

    if (open) {
      const messages = new ReadableStream<Message>(
        {
          async pull(c) {
            while (handshake && inbox.length === 0) {
              await new Promise<void>((resolve) => (wakeHandshake = resolve));
            }
            if (inbox.length > 0) {
              c.enqueue(inbox.shift()!);
            } else {
              c.close();
            }
          },
          cancel: release,
        },
        { highWaterMark: 0 },
      );
      const send = (message: string | Uint8Array) => {
        if (outcome || socket.readyState !== OPEN) {
          throw new DOMException('The WebSocket is not open.', 'InvalidStateError');
        }
        socket.send(toOutgoing(message));
      };
      const handshakeDone = Promise.resolve().then(() =>
        open({ send, messages, signal: attempt.signal }),
      );
      handshakeDone.catch(() => {});
      try {
        await Promise.race([handshakeDone, result]);
      } catch (error) {
        attempt.abort(error);
      }
      if (outcome) {
        return { ended: result };
      }
    }

    clearTimeout(openTimer);
    release();
    if (socket.readyState !== OPEN) {
      return { ended: result };
    }
    ready = true;

    if (heartbeat) {
      const { interval, timeout: wait = interval } = heartbeat;
      pingTimer = setInterval(() => {
        if (socket.readyState !== OPEN) {
          return;
        }
        socket.send(ping!);
        pongTimer ??= startTimer(
          () =>
            attempt.abort(
              new DOMException(`No heartbeat reply within ${wait} ms.`, 'TimeoutError'),
            ),
          wait,
        );
      }, interval);
    }
    const duplex = withAsyncDispose({ readable, writable }, async () => {
      closeByClient();
      await result;
    });
    return { duplex, ended: result };
  }

  const stopped = (): Outcome => ({
    ready: false,
    closedByClient: false,
    kind: 'error',
    error: stop.signal.reason,
  });

  async function run() {
    for (let failures = 0; !stop.signal.aborted;) {
      const { duplex, ended } = await session();
      if (duplex && !stop.signal.aborted) {
        controller.enqueue(duplex);
      }
      const outcome = await ended;
      if (stop.signal.aborted) {
        return;
      }
      if (outcome.closedByClient) {
        return finish(undefined, true);
      }
      if (outcome.ready) {
        failures = 0;
      }
      if (outcome.kind === 'close') {
        let reconnect: boolean;
        try {
          reconnect = await reconnectIf(outcome.close, { attempt: failures + 1 });
        } catch (error) {
          return finish(error, false);
        }
        if (stop.signal.aborted) {
          return;
        }
        if (!reconnect) {
          const { code, reason } = outcome.close;
          return finish(new CloseError({ code, reason }), isNormalClose(code));
        }
      }
      const error =
        outcome.kind === 'error'
          ? outcome.error
          : new CloseError({ code: outcome.close.code, reason: outcome.close.reason });
      if (outcome.kind === 'error' && outcome.final) {
        return finish(error, false);
      }
      if (++failures >= attempts) {
        return finish(error, false);
      }
      await Timers.sleep(next({ attempt: failures, error }), { signal: stop.signal }).catch(
        () => {},
      );
    }
  }

  return new ReadableStream<Duplex>(
    {
      start(c) {
        controller = c;
        if (signal?.aborted) {
          finish(signal.reason, false);
        } else {
          signal?.addEventListener('abort', onAbort);
          void run();
        }
      },
      cancel(reason) {
        finish(reason ?? cancelledError(), true);
      },
    },
    { highWaterMark: 0 },
  );
}
