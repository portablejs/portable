# @portable/rpc API

`pnpm api` generates this file from the source. It lists the declarations that each public entry point exports. Don't edit it by hand.

## @portable/rpc

```ts
type Codec<encoded = unknown, received = encoded> = {
  encode(message: Message): encoded;
  decode(data: received): unknown;
  readonly contentType?: string | undefined;
};

type Context = {
  readonly signal: AbortSignal;
  readonly request?: Request | undefined;
};

type Message =
  | RequestMessage
  | NotificationMessage
  | ResponseMessage
  | readonly (RequestMessage | NotificationMessage)[]
  | readonly ResponseMessage[];

type Notifier<api> = 0 extends 1 & api
  ? any
  : {
      readonly [key in keyof api]: api[key] extends (...args: infer args) => unknown
        ? (...args: args) => Promise<void>
        : api[key] extends object
          ? Notifier<api[key]>
          : never;
    };

type Remote<api> = 0 extends 1 & api
  ? any
  : {
      readonly [key in keyof api]: api[key] extends (...args: infer args) => infer result
        ? (...args: args) => Result<Awaited<result>>
        : api[key] extends object
          ? Remote<api[key]>
          : never;
    };

class RemoteError extends Errors.BaseError {
  static readonly kind: string;
  readonly code: number;
  readonly data: unknown;
  constructor(options: RemoteError.Options);
}
namespace RemoteError {
  type Options = ErrorObject & ErrorOptions;
}

type Result<value> = [value] extends [AsyncIterable<infer item> | ReadableStream<infer item>]
  ? Promise<ReadableStream<item>> & AsyncIterable<item>
  : Promise<value>;

type Transport = {
  readonly readable: ReadableStream<unknown>;
  readonly writable: WritableStream<unknown>;
};

class TransportError extends Errors.BaseError {
  static readonly kind: string;
}

function answer<encoded = string, received = string | Uint8Array>(
  options: answer.Options<encoded, received>,
): Promise<answer.ReturnType<encoded>>;
namespace answer {
  type Options<encoded, received> = {
    methods: object;
    message: NoInfer<received>;
    codec?: Codec<encoded, received> | undefined;
    signal?: AbortSignal | undefined;
  };
  type ReturnType<encoded> = encoded | undefined;
}

function call<fn extends (...args: any[]) => unknown>(
  method: fn,
  params: CallParams<fn>,
  options?: call.Options,
): ReturnType<fn>;
namespace call {
  type Options = {
    signal?: AbortSignal | undefined;
  };
}

function connect<api>(
  transport: Transport | ReadableStream<Transport>,
  options?: connect.Options,
): Remote<api> & AsyncDisposeMethod;
namespace connect {
  type Options = {
    codec?: Codec<any> | undefined;
    methods?: object | undefined;
    signal?: AbortSignal | undefined;
  };
}

function handler(
  methods: object,
  options?: handler.Options,
): (request: Request) => Promise<Response>;
namespace handler {
  type Options = {
    codec?: Codec<any, any> | undefined;
  };
}

function http<api>(url: string | URL, options?: http.Options): Remote<api> & AsyncDisposeMethod;
namespace http {
  type Options = {
    fetch?: ((request: Request) => Promise<Response>) | undefined;
    signal?: AbortSignal | undefined;
    codec?: Codec<any, any> | undefined;
  };
}

const json: Codec<string, string | Uint8Array>;

function notifier<api>(
  send: (data: any) => void | PromiseLike<void>,
  options?: notifier.Options,
): Notifier<api>;
namespace notifier {
  type Options = {
    codec?: Codec<any> | undefined;
  };
}

function notify<fn extends (...args: any[]) => unknown>(
  method: fn,
  params: CallParams<fn>,
  options?: notify.Options,
): Promise<void>;
namespace notify {
  type Options = {
    signal?: AbortSignal | undefined;
  };
}

function port(target: port.Target, options?: port.Options): Transport;
namespace port {
  type Target = {
    postMessage(message: unknown): void;
    addEventListener(type: 'message', listener: (event: MessageEvent) => void): void;
    removeEventListener(type: 'message', listener: (event: MessageEvent) => void): void;
    start?(): void;
  };
  type Options = {
    signal?: AbortSignal | undefined;
  };
}

function provide(transport: Transport, methods: object, options?: provide.Options): void;
namespace provide {
  type Options = Omit<connect.Options, 'methods'>;
}

function window(target: window.Target, options: window.Options): Transport;
namespace window {
  type Target = {
    postMessage(message: unknown, targetOrigin: string): void;
  };
  type Options = {
    origin: string;
    channel?: string | undefined;
    signal?: AbortSignal | undefined;
  };
}

function withContext<args extends unknown[], result>(
  fn: (context: Context, ...args: args) => result,
): (...args: args) => result;

// Not exported, but used by the exports above.

type CallParams<fn> = 0 extends 1 & fn ? Params : Parameters<fn & ((...args: any[]) => unknown)>;

type ErrorObject = {
  code: number;
  message: string;
  data?: unknown;
};

type Id = string | number | null;

type NotificationMessage = {
  jsonrpc: '2.0';
  method: string;
  params?: Params | undefined;
};

type Params =
  | readonly unknown[]
  | {
      readonly [key: string]: unknown;
    };

type RequestMessage = {
  jsonrpc: '2.0';
  id: Id;
  method: string;
  params?: Params | undefined;
};

type ResponseMessage =
  | {
      jsonrpc: '2.0';
      id: Id;
      result: unknown;
    }
  | {
      jsonrpc: '2.0';
      id: Id;
      error: ErrorObject;
    };
```
