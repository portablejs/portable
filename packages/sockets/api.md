# @portable/sockets API

`pnpm api` generates this file from the source. It lists the declarations that each public entry point exports. Don't edit it by hand.

## @portable/sockets

```ts
type Address = {
  hostname: string;
  port: number;
};

type Connect = (address: Address, options: Options) => Socket;

type Info = {
  remoteAddress?: string | undefined;
  localAddress?: string | undefined;
};

type Options = {
  secureTransport: 'off' | 'on' | 'starttls';
  allowHalfOpen: boolean;
};

type Socket = {
  readonly readable: ReadableStream<Uint8Array>;
  readonly writable: WritableStream<Uint8Array>;
  readonly opened: Promise<Info>;
  readonly closed: Promise<void>;
  readonly upgraded: boolean;
  close(): Promise<void>;
  startTls(): Socket;
};
```

## @portable/sockets/node

```ts
type Socket = Omit<Sockets.Socket, 'startTls'> &
  AsyncDisposeMethod & {
    startTls(): Socket;
  };

const connect: create.ReturnType;

function create(options?: create.Options): create.ReturnType;
namespace create {
  type Options = {
    ca?: string | readonly string[] | undefined;
    rejectUnauthorized?: boolean | undefined;
  };
  type ReturnType = (address: Sockets.Address, options: Sockets.Options) => Socket;
}

// Not exported, but used by the exports above.

type Address = {
  hostname: string;
  port: number;
};

type Info = {
  remoteAddress?: string | undefined;
  localAddress?: string | undefined;
};

type Options = {
  secureTransport: 'off' | 'on' | 'starttls';
  allowHalfOpen: boolean;
};

type Socket = {
  readonly readable: ReadableStream<Uint8Array>;
  readonly writable: WritableStream<Uint8Array>;
  readonly opened: Promise<Info>;
  readonly closed: Promise<void>;
  readonly upgraded: boolean;
  close(): Promise<void>;
  startTls(): Socket;
};
```
