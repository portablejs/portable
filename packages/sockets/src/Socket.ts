/** The host and port to connect to. */
export type Address = { hostname: string; port: number };

/**
 * The options a `Connect` receives. Both are required, because the type of `connect` in
 * `@cloudflare/workers-types` requires `allowHalfOpen`.
 */
export type Options = {
  /**
   * `'off'` for plain TCP, `'on'` for TLS from the start, and `'starttls'` for plain TCP that
   * `startTls()` can upgrade later.
   */
  secureTransport: 'off' | 'on' | 'starttls';
  /**
   * When `false`, the socket closes its writable side as soon as the peer ends its side. When
   * `true`, the writable side stays open until it is closed.
   */
  allowHalfOpen: boolean;
};

/** What `opened` resolves with. A field is present only if the runtime knows its value. */
export type Info = {
  remoteAddress?: string | undefined;
  localAddress?: string | undefined;
};

/**
 * A TCP connection with the shape of the WinterTC Sockets API. The socket that `connect` from
 * `cloudflare:sockets` returns matches it as it is.
 */
export type Socket = {
  /** The bytes the peer sends. It closes when the peer ends its side. */
  readonly readable: ReadableStream<Uint8Array>;
  /** The bytes to send. Closing it ends this side of the connection. */
  readonly writable: WritableStream<Uint8Array>;
  /** Resolves once the connection, and the TLS handshake if there is one, is established. */
  readonly opened: Promise<Info>;
  /** Resolves when the connection closes, and rejects if it fails. */
  readonly closed: Promise<void>;
  /** `true` once `startTls()` has moved the connection to a new socket. */
  readonly upgraded: boolean;
  /** Closes both sides of the connection and returns `closed`. */
  close(): Promise<void>;
  /**
   * Starts TLS on a socket opened with `secureTransport: 'starttls'` and returns the encrypted
   * socket. After the call, this socket's readable closes, its writes reject and its `closed`
   * resolves.
   */
  startTls(): Socket;
};

/**
 * Opens a TCP connection. `connect` from `cloudflare:sockets` and `connect` from
 * `@portable/sockets/node` both match this type.
 */
export type Connect = (address: Address, options: Options) => Socket;
