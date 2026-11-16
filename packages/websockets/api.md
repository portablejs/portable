# @portable/websockets API

`pnpm api` generates this file from the source. It lists the declarations that each public entry point exports. Don't edit it by hand.

## @portable/websockets

```ts
export { Backoff, Delay } from '@portable/timers';

class CloseError extends Errors.BaseError {
  static readonly kind: string;
  readonly code: number;
  readonly reason: string;
  constructor(options: { code: number; reason: string });
}

type Duplex = AsyncDisposeMethod & {
  readable: ReadableStream<Message>;
  writable: WritableStream<string | Uint8Array>;
};

class MaxBufferedError extends Errors.BaseError {
  static readonly kind: string;
  readonly maxBuffered: number;
  constructor(options: { maxBuffered: number });
}

type Message = string | Uint8Array<ArrayBuffer>;

type Socket = {
  readonly readyState: number;
  readonly bufferedAmount: number;
  binaryType: string;
  send(data: string | Uint8Array<ArrayBuffer>): void;
  close(code?: number, reason?: string): void;
  addEventListener(type: string, listener: (event: SocketEvent) => void): void;
  removeEventListener(type: string, listener: (event: SocketEvent) => void): void;
};

function connect(url: connect.Url, options?: connect.Options): Duplex;
namespace connect {
  type Options = {
    protocols?: string | readonly string[] | undefined;
    signal?: AbortSignal | undefined;
    delay?: Timers.Delay | undefined;
    attempts?: number | undefined;
    timeout?: number | undefined;
    open?: ((context: Context) => void | PromiseLike<void>) | undefined;
    reconnectIf?:
      | ((
          close: Close,
          retry: {
            attempt: number;
          },
        ) => boolean | PromiseLike<boolean>)
      | undefined;
    maxQueued?: number | undefined;
    highWaterMark?: number | undefined;
    maxBuffered?: number | undefined;
    heartbeat?: Heartbeat | undefined;
    WebSocket?: Constructor | undefined;
  };
  type Context = {
    send: (message: string | Uint8Array) => void;
    messages: ReadableStream<Message>;
    signal: AbortSignal;
  };
  type Close = {
    code: number;
    reason: string;
  };
  type Heartbeat = {
    ping: string | Uint8Array;
    pong: (message: Message) => boolean;
    interval: number;
    timeout?: number | undefined;
  };
  type Constructor = new (url: string, protocols?: string | string[]) => Socket;
  type Url = string | URL | (() => string | URL | PromiseLike<string | URL>);
}

function fromSocket(socket: Socket, options?: fromSocket.Options): Duplex;
namespace fromSocket {
  type Options = {
    signal?: AbortSignal | undefined;
    highWaterMark?: number | undefined;
    maxBuffered?: number | undefined;
  };
}

// Not exported, but used by the exports above.

type SocketEvent = Event & {
  data?: unknown;
  code?: number | undefined;
  reason?: string | undefined;
};
```
