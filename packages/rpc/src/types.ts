/** A JSON-RPC 2.0 request id. */
export type Id = string | number | null;

/** JSON-RPC 2.0 parameters: positional (an array) or by name (an object). */
export type Params = readonly unknown[] | { readonly [key: string]: unknown };

/** The `error` member of a JSON-RPC 2.0 error response. */
export type ErrorObject = { code: number; message: string; data?: unknown };

export type RequestMessage = {
  jsonrpc: '2.0';
  id: Id;
  method: string;
  params?: Params | undefined;
};

export type NotificationMessage = {
  jsonrpc: '2.0';
  method: string;
  params?: Params | undefined;
};

export type ResponseMessage =
  | { jsonrpc: '2.0'; id: Id; result: unknown }
  | { jsonrpc: '2.0'; id: Id; error: ErrorObject };

/** A JSON-RPC 2.0 message object, or a batch of them. */
export type Message =
  | RequestMessage
  | NotificationMessage
  | ResponseMessage
  | readonly (RequestMessage | NotificationMessage)[]
  | readonly ResponseMessage[];

/**
 * Turns messages into what a transport carries, and back. `decode` may return anything:
 * malformed messages are answered with JSON-RPC errors.
 */
export type Codec<encoded = unknown> = {
  encode(message: Message): encoded;
  decode(data: encoded): unknown;
};

/** A pair of streams that carry encoded messages, such as a WebSocket wrapped in streams. */
export type Transport = {
  readonly readable: ReadableStream<unknown>;
  readonly writable: WritableStream<unknown>;
};

/** What a method wrapped with `withContext` receives as its first argument. */
export type Context = {
  /** Aborted when the caller cancels the call or the connection closes. */
  readonly signal: AbortSignal;
  /** The HTTP request, for methods served by `handler`. */
  readonly request?: Request | undefined;
};

/**
 * The type of a remote API. Every method returns a promise, and a method that returns an async
 * iterable or a `ReadableStream` returns a promise for a `ReadableStream` that can also be
 * iterated with `for await` directly.
 */
export type Remote<api> = 0 extends 1 & api
  ? any
  : {
      readonly [key in keyof api]: api[key] extends (...args: infer args) => infer result
        ? (...args: args) => Result<Awaited<result>>
        : api[key] extends object
          ? Remote<api[key]>
          : never;
    };

/** What a remote method returns for a result of type `value`. */
export type Result<value> = [value] extends [AsyncIterable<infer item> | ReadableStream<infer item>]
  ? Promise<ReadableStream<item>> & AsyncIterable<item>
  : Promise<value>;
